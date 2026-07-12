// VibeNet — Dashboard app shell: fixed sidebar + main content area.
//
// Owns all the "New chat" state: the client-side conversation registry, the
// live WebSocket connection, and the per-peer AES-GCM key derivation that
// encrypts outgoing messages and decrypts incoming ones. Sidebar and
// NewChatDialog are presentation/selection only — this is where a selected
// peer actually becomes a working encrypted conversation.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppShell } from '@astryxdesign/core/AppShell';
import { Heading } from '@astryxdesign/core/Heading';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { gooeyToast } from 'goey-toast';
import { ApiError, type AuthUser } from '@/lib/api';
import { apiClient } from '@/lib/apiClient';
import { verifyPeerPin } from '@/lib/user';
import {
  applyPeerUpdate,
  chatRoomIdFor,
  listConversations,
  peerName,
  upsertConversation,
  type Conversation,
} from '@/lib/conversations';
import { decryptText, deriveSharedKey, encryptText, importPublicKey } from '@/lib/e2ee';
import {
  decodeMessageBody,
  deleteMessage,
  encodeMessageBody,
  getMessages,
  markOwnMessagesRead,
  mergeMessages,
  setMessageKept,
  setMessagePinned,
  setMessageStatus,
  type ChatMessage,
  type ReplyPreview,
} from '@/lib/messageStore';
import { useChatSocket } from '@/hooks/useChatSocket';
import { useE2EEKeys } from '@/hooks/useE2EEKeys';
import { ChatView } from './ChatView';
import { ContactsView } from './ContactsView';
import { EmptyState } from './EmptyState';
import { ForwardDialog } from './ForwardDialog';
import { NewChatDialog, type ResolvedPeer } from './NewChatDialog';
import { PinPromptDialog } from './PinPromptDialog';
import { SettingsPanel, type SettingsSection } from './SettingsPanel';
import { Sidebar } from './Sidebar';

// What's showing in the main content pane beside the sidebar. 'chat' covers both an
// open conversation and the welcome/empty state — settings and contacts are rendered
// in place of it, Discord-style, so switching to them never tears down the chat shell
// (socket, conversation registry, derived keys all stay live behind them).
export type DashboardView = 'chat' | 'contacts' | 'settings';

// A frame off the WebSocket. `type` discriminates a chat message from the
// delivery/read control frames (see the backend websocket package); the
// message fields are present only on chat frames, `delivered` only on acks,
// and `chat_room_id` identifies the room for acks and read receipts alike.
interface InboundFrame {
  type?:
    | 'message'
    | 'ack'
    | 'read'
    | 'presence'
    | 'presence_update'
    | 'typing'
    | 'pin_message'
    | 'delete_message'
    | 'user_update';
  message_id?: string;
  sender_id?: string;
  chat_room_id?: string;
  ciphertext?: string;
  nonce?: string;
  timestamp?: number;
  delivered?: boolean;
  reader_id?: string;
  online?: string[];
  is_forwarded?: boolean;
  // typing frame: a peer started/stopped composing (sender_id carries who).
  is_typing?: boolean;
  // presence_update frame: a peer connected/disconnected (user_id carries who,
  // last_seen set on the offline transition).
  is_online?: boolean;
  last_seen?: number;
  // user_update frame: a peer edited their profile (see UpdateProfile on the
  // backend). Carries public profile fields only, never ciphertext.
  user_id?: string;
  display_name?: string;
  avatar_url?: string;
}

// How often to re-query which peers are online (ms). Presence has no push
// channel, so we poll over the same socket while connected.
const PRESENCE_POLL_MS = 20_000;

// Clear a peer's typing indicator if no further typing frame arrives within this
// window. The sender re-emits "typing" every ~2s while composing (see ChatView
// TYPING_HEARTBEAT_MS), so this must be comfortably larger than that heartbeat to
// avoid clearing mid-typing; it also self-heals a missed "stopped" frame.
const TYPING_TIMEOUT_MS = 5_000;

// Stable empty set for the "nobody known online" case (disconnected), so we
// don't mint a new Set identity on every render.
const NO_ONLINE_PEERS: ReadonlySet<string> = new Set();

interface RemoteMessageDTO {
  message_id: string;
  sender_id: string;
  ciphertext: string;
  nonce: string;
  timestamp: number;
}

export function DashboardShell({
  user,
  onLogout,
  onUserUpdated,
}: {
  user: AuthUser | null;
  onLogout: () => void;
  // Applies a profile the settings panel just persisted, so the sidebar avatar and
  // every other reader of the session agree without a reload (see useAuth.updateUser).
  onUserUpdated: (user: AuthUser) => void;
}) {
  const keyState = useE2EEKeys(user);

  const [conversations, setConversations] = useState<Conversation[]>(() =>
    user ? listConversations(user.user_id) : [],
  );
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  // What the main pane is showing. Opening any conversation returns it to 'chat'
  // (see openPeer), so picking a contact or a DM leaves settings.
  const [activeView, setActiveView] = useState<DashboardView>('chat');
  // Which settings section is open. Held here (rather than inside SettingsPanel) so the
  // sidebar's "Chat PIN" shortcut can jump straight to Privacy & Security.
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('profile');
  // Chat-PIN gate for NEW conversations only: when the TARGET being messaged has
  // chat_pin_enabled, starting a chat via username search prompts for THAT
  // recipient's PIN (their anti-spam gate) before the room opens — verified
  // server-side against the target's profile. Existing DM sidebar / recent-chat
  // clicks bypass the gate (contact already established). pinPendingConversation
  // holds the not-yet-persisted conversation to open once its PIN is verified;
  // it is intentionally NOT saved until then, so cancelling can't leave a
  // PIN-free openable entry in the sidebar.
  const [pinPendingConversation, setPinPendingConversation] = useState<Conversation | null>(null);
  // Targets whose PIN has already been verified this session, so re-initiating a
  // chat with the same person doesn't prompt again.
  const verifiedPeerIds = useRef<Set<string>>(new Set());
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinErrorNonce, setPinErrorNonce] = useState(0);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  // Bumped each time the dialog opens so NewChatDialog remounts with fresh
  // internal state instead of needing a reset-on-close effect.
  const [newChatSession, setNewChatSession] = useState(0);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // The message currently being forwarded, if any — drives the ForwardDialog.
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  // Peer IDs currently reported online by the hub (see the presence poll below).
  const [onlinePeers, setOnlinePeers] = useState<Set<string>>(new Set());
  // Peer IDs currently composing a message to us (drives the typing indicator).
  const [typingPeers, setTypingPeers] = useState<Set<string>>(new Set());
  // Per-peer last-seen (unix ms), seeded from the key endpoint on open and kept
  // current by presence_update frames when a peer goes offline.
  const [lastSeenByPeer, setLastSeenByPeer] = useState<Record<string, number>>({});
  // Per-peer auto-clear timers for the typing indicator (see TYPING_TIMEOUT_MS).
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Derived AES-GCM keys are per-peer and deterministic (ECDH) — cache them
  // instead of re-deriving on every message.
  const sharedKeyCache = useRef<Map<string, CryptoKey>>(new Map());

  const getSharedKey = useCallback(
    async (peer: Conversation): Promise<CryptoKey | null> => {
      if (keyState.status !== 'ready') return null;
      const cached = sharedKeyCache.current.get(peer.peerId);
      if (cached) return cached;
      const theirPublicKey = await importPublicKey(peer.peerPublicKey);
      const shared = await deriveSharedKey(keyState.privateKey, theirPublicKey);
      sharedKeyCache.current.set(peer.peerId, shared);
      return shared;
    },
    [keyState],
  );

  // Proactively re-fetches a peer's current public key and updates the cached
  // conversation (busting the derived shared key) when it changed. Runs when a
  // conversation is opened so our *outgoing* messages are always encrypted to
  // the peer's current key rather than a copy cached who-knows-when — the
  // sender is the only party that can prevent encrypting to a rotated key.
  // Quiet: an unchanged key is the normal case, not an error.
  const syncPeerPublicKey = useCallback(
    async (conversation: Conversation, currentUserId: string): Promise<Conversation> => {
      try {
        const resolved = await apiClient.get<{
          user_id: string;
          public_key: string;
          display_name?: string;
          avatar_url?: string;
          last_seen?: number;
        }>(`/api/users/${conversation.peerId}/key`);
        // Seed the peer's last-seen so the header can show it immediately when
        // they're offline (presence_update only fires on a live transition).
        if (typeof resolved.last_seen === 'number') {
          const seen = resolved.last_seen;
          setLastSeenByPeer((prev) => ({ ...prev, [conversation.peerId]: seen }));
        }
        const keyChanged = resolved.public_key !== conversation.peerPublicKey;
        // Also backfill the avatar and real name: conversations started before
        // these existed (or from an incoming message) have none cached, so pick
        // them up here even when the key itself hasn't rotated.
        const avatarChanged = (resolved.avatar_url ?? undefined) !== conversation.peerAvatarUrl;
        const resolvedName = resolved.display_name?.trim() || undefined;
        const nameChanged =
          resolvedName !== undefined && resolvedName !== conversation.peerDisplayName;
        if (!keyChanged && !avatarChanged && !nameChanged) return conversation;
        if (keyChanged) sharedKeyCache.current.delete(conversation.peerId);
        const refreshed: Conversation = {
          ...conversation,
          peerPublicKey: resolved.public_key,
          peerAvatarUrl: resolved.avatar_url,
          peerDisplayName: resolvedName ?? conversation.peerDisplayName,
        };
        setConversations(upsertConversation(currentUserId, refreshed));
        return refreshed;
      } catch {
        // Best-effort — a cached key still works if it hasn't rotated.
        return conversation;
      }
    },
    [],
  );

  // Proactively backfill peer avatars so the DM list shows profile photos
  // without the user having to open each chat first. syncPeerPublicKey caches
  // the avatar_url the key endpoint returns into the conversation. Each peer is
  // attempted at most once per mount — password accounts have no avatar and
  // would otherwise be refetched on every conversation-list change.
  const avatarBackfillAttempted = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;
    const pending = conversations.filter(
      (c) => c.peerAvatarUrl === undefined && !avatarBackfillAttempted.current.has(c.peerId),
    );
    if (pending.length === 0) return;
    const currentUserId = user.user_id;
    pending.forEach((c) => avatarBackfillAttempted.current.add(c.peerId));
    void (async () => {
      for (const c of pending) {
        await syncPeerPublicKey(c, currentUserId);
      }
    })();
  }, [user, conversations, syncPeerPublicKey]);

  // Re-fetches a peer's current public key, refreshes the cached conversation
  // entry (and busts the cached derived shared key) when it turns out to
  // differ from what we had cached — e.g. they lost their local private key
  // and useE2EEKeys self-healed by generating and uploading a new keypair
  // since we last fetched theirs. Returns null if the server's key matches
  // what we already tried (a real mismatch, not staleness) or the refresh
  // itself fails, so callers can tell "not recoverable" apart from "fixed."
  const refreshPeerSharedKey = useCallback(
    async (
      conversation: Conversation,
      currentUserId: string,
    ): Promise<{ key: CryptoKey; conversation: Conversation } | null> => {
      try {
        const resolved = await apiClient.get<{ user_id: string; public_key: string }>(
          `/api/users/${conversation.peerId}/key`,
        );
        if (resolved.public_key === conversation.peerPublicKey) {
          // Not a recoverable staleness case: the server already advertises the
          // key we tried, so this ciphertext was encrypted under a key that is gone.
          return null;
        }

        sharedKeyCache.current.delete(conversation.peerId);
        const refreshed: Conversation = { ...conversation, peerPublicKey: resolved.public_key };
        setConversations(upsertConversation(currentUserId, refreshed));

        const key = await getSharedKey(refreshed);
        if (!key) return null;
        return { key, conversation: refreshed };
      } catch {
        return null;
      }
    },
    [getSharedKey],
  );

  // Decrypts a single inbound frame, retrying once against a freshly-fetched
  // peer public key on failure (see refreshPeerSharedKey) before giving up.
  // This is what turns a permanent, silent OperationError into a
  // self-correcting resync.
  const decryptIncoming = useCallback(
    async (
      conversation: Conversation,
      ciphertext: string,
      nonce: string,
      currentUserId: string,
    ): Promise<string> => {
      const sharedKey = await getSharedKey(conversation);
      if (!sharedKey) throw new Error('no shared key available');

      try {
        return await decryptText(sharedKey, ciphertext, nonce);
      } catch (err) {
        // The cached public key may be stale (peer rotated it) — refetch their
        // current key and retry once before giving up.
        const refresh = await refreshPeerSharedKey(conversation, currentUserId);
        if (!refresh) throw err;
        return await decryptText(refresh.key, ciphertext, nonce);
      }
    },
    [getSharedKey, refreshPeerSharedKey],
  );

  // Inbound frames that arrive before this device's E2EE keys are ready (e.g.
  // a brand-new browser profile still generating its keypair — see
  // useE2EEKeys) used to be dropped silently by handleIncoming, since
  // getSharedKey has nothing to derive with yet. Queue them here and replay
  // once keyState flips to 'ready' instead of losing them.
  const pendingFramesRef = useRef<InboundFrame[]>([]);

  // Catches a conversation up on anything sent while this device wasn't
  // connected — the WS hub only delivers live, with no queue (see
  // GetChatHistory on the backend). Best-effort: a failed fetch just means
  // live delivery keeps working without the catch-up.
  const syncHistory = useCallback(
    async (conversation: Conversation, currentUserId: string) => {
      try {
        const sharedKey = await getSharedKey(conversation);
        if (!sharedKey) return;

        const { messages: remote } = await apiClient.get<{ messages: RemoteMessageDTO[] }>(
          `/api/messages/${encodeURIComponent(conversation.chatRoomId)}`,
        );
        if (remote.length === 0) return;

        // Skip anything we've already decrypted and cached locally — otherwise
        // every reload re-attempts (and re-fails on) the same old messages that
        // were encrypted under keys this device no longer has, spamming the
        // console and doing pointless crypto work each time.
        const alreadyHave = new Set(getMessages(conversation.chatRoomId).map((m) => m.id));
        const pending = remote.filter((m) => !alreadyHave.has(m.message_id));
        if (pending.length === 0) return;

        const decryptAll = async (key: CryptoKey) => {
          const ok: ChatMessage[] = [];
          for (const m of pending) {
            try {
              const plaintext = await decryptText(key, m.ciphertext, m.nonce);
              const { text, replyTo, isForwarded } = decodeMessageBody(plaintext);
              ok.push({
                id: m.message_id,
                senderId: m.sender_id,
                text,
                timestamp: m.timestamp,
                replyTo,
                isForwarded,
              });
            } catch {
              // Expected for history predating a key rotation/loss — summarised
              // once below rather than logged per message.
            }
          }
          return ok;
        };

        let decrypted = await decryptAll(sharedKey);

        // A miss can mean the peer rotated their key since we cached it — retry
        // once against their current key before concluding it's unrecoverable.
        if (decrypted.length < pending.length) {
          const refresh = await refreshPeerSharedKey(conversation, currentUserId);
          if (refresh) {
            const retried = await decryptAll(refresh.key);
            if (retried.length > decrypted.length) decrypted = retried;
          }
        }

        if (decrypted.length === 0) return;

        const merged = mergeMessages(conversation.chatRoomId, decrypted);
        setMessagesByRoom((prev) => ({ ...prev, [conversation.chatRoomId]: merged }));
      } catch {
        // Network/auth failure — live delivery still works without history.
        // Any messages that stay undecryptable were encrypted under a key
        // that's no longer available, which is expected after key loss.
      }
    },
    [getSharedKey, refreshPeerSharedKey],
  );

  // Goes through mergeMessages (dedupe by id) rather than a blind append —
  // the same message can otherwise land twice: once live over the
  // WebSocket, once again from a history sync a moment later.
  function recordMessage(chatRoomId: string, message: ChatMessage) {
    const merged = mergeMessages(chatRoomId, [message]);
    setMessagesByRoom((prev) => ({ ...prev, [chatRoomId]: merged }));
  }

  const handleIncoming = useCallback(
    (data: unknown) => {
      if (!user) return;
      const frame = data as InboundFrame;

      // Presence snapshot: which of the peers we asked about are online.
      if (frame.type === 'presence') {
        setOnlinePeers(new Set(frame.online ?? []));
        return;
      }

      // Typing indicator: a peer started (is_typing) or stopped composing. Each
      // "true" (re)arms a 3s auto-clear so a missed "false" still resolves.
      if (frame.type === 'typing') {
        const sender = frame.sender_id;
        if (!sender) return;
        const timers = typingTimersRef.current;
        const existing = timers.get(sender);
        if (existing) clearTimeout(existing);

        const clearTyping = () =>
          setTypingPeers((prev) => {
            if (!prev.has(sender)) return prev;
            const next = new Set(prev);
            next.delete(sender);
            return next;
          });

        if (frame.is_typing) {
          setTypingPeers((prev) => (prev.has(sender) ? prev : new Set(prev).add(sender)));
          timers.set(
            sender,
            setTimeout(() => {
              timers.delete(sender);
              clearTyping();
            }, TYPING_TIMEOUT_MS),
          );
        } else {
          timers.delete(sender);
          clearTyping();
        }
        return;
      }

      // Presence transition: a peer connected/disconnected. Only track peers we
      // actually have a conversation with (mirrors user_update).
      if (frame.type === 'presence_update') {
        const uid = frame.user_id;
        if (!uid || !conversations.some((c) => c.peerId === uid)) return;
        setOnlinePeers((prev) => {
          const has = prev.has(uid);
          if (frame.is_online && !has) return new Set(prev).add(uid);
          if (!frame.is_online && has) {
            const next = new Set(prev);
            next.delete(uid);
            return next;
          }
          return prev;
        });
        if (!frame.is_online) {
          // Offline: record last-seen and drop any lingering typing state.
          if (typeof frame.last_seen === 'number') {
            const seen = frame.last_seen;
            setLastSeenByPeer((prev) => ({ ...prev, [uid]: seen }));
          }
          const timer = typingTimersRef.current.get(uid);
          if (timer) {
            clearTimeout(timer);
            typingTimersRef.current.delete(uid);
          }
          setTypingPeers((prev) => {
            if (!prev.has(uid)) return prev;
            const next = new Set(prev);
            next.delete(uid);
            return next;
          });
        }
        return;
      }

      // Delivery ack for a message we sent: grey single → grey double tick.
      if (frame.type === 'ack') {
        if (frame.delivered && frame.chat_room_id && frame.message_id) {
          const updated = setMessageStatus(frame.chat_room_id, frame.message_id, 'delivered');
          setMessagesByRoom((prev) => ({ ...prev, [frame.chat_room_id!]: updated }));
        }
        return;
      }

      // Read receipt: the recipient opened the chat — flip our sent messages
      // in that room to the blue double tick.
      if (frame.type === 'read') {
        if (frame.chat_room_id) {
          const updated = markOwnMessagesRead(frame.chat_room_id, user.user_id);
          setMessagesByRoom((prev) => ({ ...prev, [frame.chat_room_id!]: updated }));
        }
        return;
      }

      // "Delete for everyone" broadcast: drop the message from our cache too.
      if (frame.type === 'delete_message') {
        if (frame.chat_room_id && frame.message_id) {
          const updated = deleteMessage(frame.chat_room_id, frame.message_id);
          setMessagesByRoom((prev) => ({ ...prev, [frame.chat_room_id!]: updated }));
        }
        return;
      }

      // Pin broadcast: someone pinned a message for the whole room — mirror it.
      if (frame.type === 'pin_message') {
        if (frame.chat_room_id && frame.message_id) {
          const updated = setMessagePinned(frame.chat_room_id, frame.message_id, true);
          setMessagesByRoom((prev) => ({ ...prev, [frame.chat_room_id!]: updated }));
        }
        return;
      }

      // Profile update broadcast: a peer changed their real name / avatar. Patch
      // the cached conversation so the DM list, chat header, and bubbles update
      // live — no reload needed. Only touches peers we actually have a chat with.
      if (frame.type === 'user_update') {
        if (frame.user_id && conversations.some((c) => c.peerId === frame.user_id)) {
          const updated = applyPeerUpdate(user.user_id, frame.user_id, {
            peerDisplayName: frame.display_name,
            peerAvatarUrl: frame.avatar_url,
          });
          setConversations(updated);
        }
        return;
      }

      const {
        sender_id: senderId,
        chat_room_id: chatRoomId,
        ciphertext,
        nonce,
        message_id: messageId,
        timestamp,
        is_forwarded: frameForwarded,
      } = frame;
      if (!senderId || !chatRoomId || !ciphertext || !nonce || !messageId) return;

      // Keys not generated/imported yet (fresh browser profile racing the
      // first inbound message) — queue and replay once ready instead of
      // dropping the frame for good.
      if (keyState.status !== 'ready') {
        pendingFramesRef.current.push(frame);
        return;
      }

      void (async () => {
        let conversation = conversations.find((c) => c.peerId === senderId);

        if (!conversation) {
          // First message from someone we haven't started a chat with — resolve
          // just enough to display it. Best-effort: fails silently for
          // PIN-gated senders, since we have no PIN-entry surface here.
          try {
            const resolved = await apiClient.get<{
              user_id: string;
              public_key: string;
              display_name?: string;
              avatar_url?: string;
            }>(`/api/users/${senderId}/key`);
            conversation = {
              peerId: senderId,
              peerUsername: `user_${senderId.slice(0, 8)}`,
              // The key endpoint carries the peer's real name — use it so an
              // unknown first-time sender shows a proper name, not just a stub id.
              peerDisplayName: resolved.display_name?.trim() || undefined,
              peerPublicKey: resolved.public_key,
              peerAvatarUrl: resolved.avatar_url,
              chatRoomId,
              createdAt: Date.now(),
            };
            setConversations(upsertConversation(user.user_id, conversation));
          } catch {
            gooeyToast('New encrypted message from an unknown contact.', {
              description: 'Start a chat with them from "New chat" to read it.',
            });
            return;
          }
        }

        try {
          const plaintext = await decryptIncoming(conversation, ciphertext, nonce, user.user_id);
          // Unwrap the envelope: pulls out the text and any metadata the sender
          // embedded — reply context and the forwarded flag (legacy plain-text
          // bodies decode to just the text).
          const { text, replyTo, isForwarded } = decodeMessageBody(plaintext);
          recordMessage(chatRoomId, {
            id: messageId,
            senderId,
            text,
            timestamp: timestamp ?? Date.now(),
            // Render the "Forwarded" tag on the recipient's bubble too. The flag
            // travels inside the ciphertext (the backend drops frame-level extras
            // as a blind router); the frame flag is only a fallback if a future
            // backend starts relaying it.
            isForwarded: isForwarded ?? frameForwarded,
            replyTo,
          });
        } catch {
          // Undecryptable even after a key-refresh retry — genuinely
          // tampered payload or an unresolvable key mismatch. Drop rather
          // than show ciphertext.
        }
      })();
    },
    [conversations, decryptIncoming, keyState.status, user],
  );

  // Replay anything that arrived while keys were still being set up.
  useEffect(() => {
    if (keyState.status !== 'ready' || pendingFramesRef.current.length === 0) return;
    const queued = pendingFramesRef.current;
    pendingFramesRef.current = [];
    for (const frame of queued) handleIncoming(frame);
  }, [keyState.status, handleIncoming]);

  const { status: connectionStatus, send } = useChatSocket(handleIncoming);

  // openPeer opens an existing conversation immediately — sidebar DM rows and
  // the empty-state "Recent chats" list use this path and never trigger the PIN gate.
  const openPeer = useCallback((peerId: string) => {
    if (!peerId) return;
    setActiveView('chat');
    setActivePeerId(peerId);
  }, []);

  // Opens settings in the main pane, optionally on a specific section — the sidebar's
  // "Chat PIN" item uses this to land directly on Privacy & Security.
  const openSettings = useCallback((section: SettingsSection = 'profile') => {
    setSettingsSection(section);
    setActiveView('settings');
  }, []);

  // Persists a conversation into the client registry and opens it. Used once a
  // new chat is cleared to open — either immediately (no target PIN) or after the
  // target's PIN is verified.
  const persistAndOpen = useCallback((ownerId: string, conversation: Conversation) => {
    setConversations(upsertConversation(ownerId, conversation));
    setMessagesByRoom((prev) =>
      prev[conversation.chatRoomId]
        ? prev
        : { ...prev, [conversation.chatRoomId]: getMessages(conversation.chatRoomId) },
    );
    setActiveView('chat');
    setActivePeerId(conversation.peerId);
  }, []);

  async function submitChatPin(code: string) {
    const target = pinPendingConversation;
    if (!user || !target) return;
    setPinVerifying(true);
    try {
      // Verify against the TARGET recipient's PIN profile, not the caller's own.
      await verifyPeerPin(target.peerId, code);
      verifiedPeerIds.current.add(target.peerId);
      setPinPendingConversation(null);
      setPinError(null);
      // Only now is the conversation saved + opened — never before verification.
      persistAndOpen(user.user_id, target);
    } catch (err) {
      // Wrong PIN (403) or any other failure: keep the dialog open and shake.
      setPinError(
        err instanceof ApiError && err.status === 403
          ? 'Incorrect PIN. Try again.'
          : err instanceof Error
            ? err.message
            : 'Could not verify the PIN.',
      );
      setPinErrorNonce((n) => n + 1);
    } finally {
      setPinVerifying(false);
    }
  }

  function handleStartConversation(peer: ResolvedPeer) {
    if (!user) return;
    const conversation: Conversation = {
      peerId: peer.userId,
      peerUsername: peer.username,
      peerDisplayName: peer.displayName,
      peerPublicKey: peer.publicKey,
      peerAvatarUrl: peer.avatarUrl,
      chatRoomId: chatRoomIdFor(user.user_id, peer.userId),
      createdAt: Date.now(),
    };
    // Gate on the TARGET's PIN requirement, not the current user's. Already-verified
    // targets (this session) skip straight through.
    const needsPin =
      peer.chatPinEnabled === true && !verifiedPeerIds.current.has(peer.userId);
    // Search dialog closes on select; defer one frame so the overlay stack never
    // shows two dialogs at once, then either prompt for the target's PIN or open.
    setIsNewChatOpen(false);
    setActiveView('chat');
    requestAnimationFrame(() => {
      if (needsPin) {
        // Hold the conversation unsaved until the PIN is verified (see submitChatPin).
        setPinError(null);
        setPinPendingConversation(conversation);
        return;
      }
      persistAndOpen(user.user_id, conversation);
    });
  }

  // Fetches history whenever the active conversation changes (new chat
  // started, or an existing one selected from the sidebar) and again if the
  // connection drops and reconnects while a conversation is open — otherwise
  // anything sent during the gap would only show up on the next full reload.
  useEffect(() => {
    if (connectionStatus !== 'open' || !activePeerId || !user) return;
    const conversation = conversations.find((c) => c.peerId === activePeerId);
    if (!conversation) return;
    const currentUserId = user.user_id;
    // Refresh the peer's public key first so our outgoing messages target
    // their current key, then catch up on history.
    void (async () => {
      const fresh = await syncPeerPublicKey(conversation, currentUserId);
      await syncHistory(fresh, currentUserId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resync on reconnect only; re-running for every unrelated `conversations`/`syncHistory` identity change would be wasteful, not incorrect.
  }, [connectionStatus, activePeerId]);

  async function handleSend(text: string, replyTo?: ReplyPreview) {
    if (!user) return;
    const conversation = conversations.find((c) => c.peerId === activePeerId);
    if (!conversation) return;

    setIsSending(true);
    setSendError(null);
    try {
      const sharedKey = await getSharedKey(conversation);
      if (!sharedKey) throw new Error('Encryption keys are not ready yet.');

      // Wrap the text (and reply metadata, when replying) in the envelope
      // before encrypting, so the whole reply context is end-to-end encrypted.
      const { ciphertext, nonce } = await encryptText(
        sharedKey,
        encodeMessageBody(text, { replyTo }),
      );
      const messageId = crypto.randomUUID();
      const timestamp = Date.now();

      const enqueued = send({
        type: 'message',
        message_id: messageId,
        receiver_id: conversation.peerId,
        chat_room_id: conversation.chatRoomId,
        ciphertext,
        nonce,
        timestamp,
      });
      if (!enqueued) throw new Error('Not connected — reconnecting, try again shortly.');

      // Optimistically show a single tick; the server's delivery ack upgrades
      // it to a double tick, and the recipient's read receipt turns it blue.
      recordMessage(conversation.chatRoomId, {
        id: messageId,
        senderId: user.user_id,
        text,
        timestamp,
        status: 'sent',
        replyTo,
      });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setIsSending(false);
    }
  }

  // ── Per-message actions (surfaced by ChatView's context menu) ──────────────
  // These operate on the open conversation's room: ChatView only renders the
  // active conversation, so every message it hands back belongs to it.

  function handleTogglePin(message: ChatMessage) {
    if (!activeConversation) return;
    const room = activeConversation.chatRoomId;
    const nextPinned = !message.pinned;
    const updated = setMessagePinned(room, message.id, nextPinned);
    setMessagesByRoom((prev) => ({ ...prev, [room]: updated }));
    if (nextPinned) {
      // Broadcast the pin to everyone in the room; local mirror is already set.
      send({ type: 'pin_message', message_id: message.id, chat_room_id: room });
      gooeyToast('Message pinned');
    } else {
      // Unpin has no broadcast frame defined — clear it locally only.
      gooeyToast('Message unpinned');
    }
  }

  function handleToggleKeep(message: ChatMessage) {
    if (!activeConversation) return;
    const room = activeConversation.chatRoomId;
    const nextKept = !message.kept;
    const updated = setMessageKept(room, message.id, nextKept);
    setMessagesByRoom((prev) => ({ ...prev, [room]: updated }));
    gooeyToast(nextKept ? 'Added to Kept' : 'Removed from Kept');
  }

  function handleDeleteForMe(message: ChatMessage) {
    if (!activeConversation) return;
    const room = activeConversation.chatRoomId;
    const updated = deleteMessage(room, message.id);
    setMessagesByRoom((prev) => ({ ...prev, [room]: updated }));
  }

  function handleDeleteForEveryone(message: ChatMessage) {
    if (!activeConversation) return;
    const room = activeConversation.chatRoomId;
    const updated = deleteMessage(room, message.id);
    setMessagesByRoom((prev) => ({ ...prev, [room]: updated }));
    // Ask the hub to broadcast the deletion (and drop it from DynamoDB).
    send({ type: 'delete_message', message_id: message.id, chat_room_id: room });
    gooeyToast('Message deleted for everyone');
  }

  // Forward re-encrypts the already-decrypted plaintext under the chosen
  // contact's shared key and sends fresh ciphertext — the hallmark of E2EE
  // forwarding: the server never sees plaintext and can't reuse the original
  // ciphertext, which was encrypted for a different recipient.
  async function handleForward(peerId: string, message: ChatMessage | null) {
    if (!user || !message) return;
    const target = conversations.find((c) => c.peerId === peerId);
    if (!target) return;
    try {
      const sharedKey = await getSharedKey(target);
      if (!sharedKey) throw new Error('Encryption keys are not ready yet.');

      // Forwarded flag rides inside the encrypted envelope (not just the WS
      // frame) so it survives the backend's blind relay and reaches the peer.
      const { ciphertext, nonce } = await encryptText(
        sharedKey,
        encodeMessageBody(message.text, { isForwarded: true }),
      );
      const messageId = crypto.randomUUID();
      const timestamp = Date.now();

      const enqueued = send({
        type: 'message',
        message_id: messageId,
        receiver_id: target.peerId,
        chat_room_id: target.chatRoomId,
        ciphertext,
        nonce,
        timestamp,
        // Tell the recipient (and the history record) this is a forward, so
        // their bubble renders the "Forwarded" tag too — the flag rides
        // alongside the ciphertext, never the plaintext.
        is_forwarded: true,
      });
      if (!enqueued) throw new Error('Not connected — reconnecting, try again shortly.');

      recordMessage(target.chatRoomId, {
        id: messageId,
        senderId: user.user_id,
        text: message.text,
        timestamp,
        status: 'sent',
        // Mark our own optimistic bubble as forwarded up front — without this
        // the tag never appears on the sender's side until a history refetch.
        isForwarded: true,
      });
      gooeyToast(`Forwarded to ${peerName(target)}`);
    } catch (err) {
      gooeyToast('Could not forward message', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  const activeConversation = conversations.find((c) => c.peerId === activePeerId) ?? null;
  const activeMessages = activeConversation
    ? (messagesByRoom[activeConversation.chatRoomId] ?? getMessages(activeConversation.chatRoomId))
    : [];

  // While a conversation is open, tell the peer we've read their messages so
  // their sent bubbles turn blue. Re-runs when a new message arrives (the
  // message count changes) so incoming messages are marked read as they land.
  const activePeer = activeConversation?.peerId;
  const activeRoom = activeConversation?.chatRoomId;
  const hasPeerMessages = activeMessages.some((m) => m.senderId === activePeer);
  useEffect(() => {
    if (connectionStatus !== 'open' || !activePeer || !activeRoom || !hasPeerMessages) return;
    send({ type: 'read', receiver_id: activePeer, chat_room_id: activeRoom });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `send` is stable enough; re-sending on its identity change would be wasteful, not incorrect.
  }, [connectionStatus, activePeer, activeRoom, hasPeerMessages, activeMessages.length]);

  // Poll the hub for which conversation peers are online while connected. Sorted
  // + joined so the effect only restarts when the set of peers actually changes.
  const peerIdsKey = conversations
    .map((c) => c.peerId)
    .sort()
    .join(',');
  useEffect(() => {
    if (connectionStatus !== 'open' || peerIdsKey === '') return;
    const userIds = peerIdsKey.split(',');
    const query = () => send({ type: 'presence', user_ids: userIds });
    query();
    const timer = setInterval(query, PRESENCE_POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `send` is stable enough; re-subscribing on its identity change would needlessly reset the poll.
  }, [connectionStatus, peerIdsKey]);

  // Clear any pending typing auto-clear timers on unmount.
  useEffect(() => {
    const timers = typingTimersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  // While disconnected we can't trust the last snapshot, so show everyone
  // offline until the socket reopens and the poll refreshes it.
  const visibleOnlinePeers = connectionStatus === 'open' ? onlinePeers : NO_ONLINE_PEERS;

  return (
    <AppShell
      contentPadding={0}
      height="fill"
      sideNav={
        <Sidebar
          user={user}
          conversations={conversations}
          activePeerId={activePeerId}
          onlinePeers={visibleOnlinePeers}
          onSelectConversation={openPeer}
          onNewChat={() => {
            setNewChatSession((n) => n + 1);
            setIsNewChatOpen(true);
          }}
          onContacts={() => setActiveView('contacts')}
          onSettings={openSettings}
          activeView={activeView}
          onLogout={onLogout}
        />
      }>
      {activeView === 'settings' ? (
        <SettingsPanel
          user={user}
          section={settingsSection}
          onSectionChange={setSettingsSection}
          onUserUpdated={onUserUpdated}
          onLogout={onLogout}
        />
      ) : activeView === 'contacts' ? (
        <ContactsView
          conversations={conversations}
          onlinePeers={visibleOnlinePeers}
          onSelectContact={openPeer}
          onNewChat={() => {
            setNewChatSession((n) => n + 1);
            setIsNewChatOpen(true);
          }}
        />
      ) : activeConversation ? (
        <ChatView
          conversation={activeConversation}
          messages={activeMessages}
          myUserId={user?.user_id ?? ''}
          onSend={handleSend}
          isSending={isSending}
          sendError={sendError}
          connectionStatus={connectionStatus}
          isPeerOnline={visibleOnlinePeers.has(activeConversation.peerId)}
          peerLastSeen={lastSeenByPeer[activeConversation.peerId] ?? null}
          isPeerTyping={typingPeers.has(activeConversation.peerId)}
          onTyping={(isTyping) =>
            send({
              type: 'typing',
              receiver_id: activeConversation.peerId,
              chat_room_id: activeConversation.chatRoomId,
              is_typing: isTyping,
            })
          }
          onForward={setForwardingMessage}
          onTogglePin={handleTogglePin}
          onToggleKeep={handleToggleKeep}
          onDeleteForMe={handleDeleteForMe}
          onDeleteForEveryone={handleDeleteForEveryone}
        />
      ) : (
        <Layout
          height="fill"
          contentWidth={768}
          content={
            <LayoutContent padding={6}>
              <VStack gap={2}>
                <Heading level={1} type="display-3">
                  Welcome{user ? `, ${user.display_name || user.username}` : ''}
                </Heading>
                <Text type="body" color="secondary">
                  Your end-to-end encrypted workspace is ready. Pick a
                  conversation from the sidebar or start a new chat.
                </Text>
                <EmptyState
                  conversations={conversations}
                  onlinePeers={visibleOnlinePeers}
                  onSelect={openPeer}
                />
              </VStack>
            </LayoutContent>
          }
        />
      )}

      {user && (
        <NewChatDialog
          key={newChatSession}
          isOpen={isNewChatOpen}
          onOpenChange={setIsNewChatOpen}
          currentUserId={user.user_id}
          onStart={handleStartConversation}
        />
      )}

      {/* PIN gate for new-chat initiation only — verifies the TARGET recipient's
          PIN. Existing sidebar DMs (established contacts) open directly. */}
      {user && (
        <PinPromptDialog
          isOpen={pinPendingConversation !== null}
          title={
            pinPendingConversation
              ? `Enter ${peerName(pinPendingConversation)}'s chat PIN`
              : 'Enter chat PIN'
          }
          avatarName={pinPendingConversation ? peerName(pinPendingConversation) : ''}
          avatarUrl={pinPendingConversation?.peerAvatarUrl}
          subtitle={
            pinPendingConversation
              ? `${peerName(pinPendingConversation)} protects new chats with a PIN. Enter their 6-digit code to start the conversation.`
              : 'Enter the 6-digit chat PIN to start this conversation.'
          }
          isVerifying={pinVerifying}
          error={pinError}
          errorNonce={pinErrorNonce}
          onSubmit={(code) => void submitChatPin(code)}
          onCancel={() => {
            setPinPendingConversation(null);
            setPinError(null);
          }}
        />
      )}

      {user && (
        <ForwardDialog
          isOpen={forwardingMessage !== null}
          onOpenChange={(open) => {
            if (!open) setForwardingMessage(null);
          }}
          conversations={conversations}
          messagePreview={forwardingMessage?.text ?? ''}
          onForward={(peerId) => handleForward(peerId, forwardingMessage)}
        />
      )}
    </AppShell>
  );
}

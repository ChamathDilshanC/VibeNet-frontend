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
import type { AuthUser } from '@/lib/api';
import { apiClient } from '@/lib/apiClient';
import {
  chatRoomIdFor,
  listConversations,
  upsertConversation,
  type Conversation,
} from '@/lib/conversations';
import { decryptText, deriveSharedKey, encryptText, importPublicKey } from '@/lib/e2ee';
import {
  getMessages,
  markOwnMessagesRead,
  mergeMessages,
  setMessageStatus,
  type ChatMessage,
} from '@/lib/messageStore';
import { useChatSocket } from '@/hooks/useChatSocket';
import { useE2EEKeys } from '@/hooks/useE2EEKeys';
import { ChatView } from './ChatView';
import { EmptyState } from './EmptyState';
import { NewChatDialog, type ResolvedPeer } from './NewChatDialog';
import { Sidebar } from './Sidebar';

// A frame off the WebSocket. `type` discriminates a chat message from the
// delivery/read control frames (see the backend websocket package); the
// message fields are present only on chat frames, `delivered` only on acks,
// and `chat_room_id` identifies the room for acks and read receipts alike.
interface InboundFrame {
  type?: 'message' | 'ack' | 'read' | 'presence';
  message_id?: string;
  sender_id?: string;
  chat_room_id?: string;
  ciphertext?: string;
  nonce?: string;
  timestamp?: number;
  delivered?: boolean;
  reader_id?: string;
  online?: string[];
}

// How often to re-query which peers are online (ms). Presence has no push
// channel, so we poll over the same socket while connected.
const PRESENCE_POLL_MS = 20_000;

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
}: {
  user: AuthUser | null;
  onLogout: () => void;
}) {
  const keyState = useE2EEKeys(user);

  const [conversations, setConversations] = useState<Conversation[]>(() =>
    user ? listConversations(user.user_id) : [],
  );
  const [activePeerId, setActivePeerId] = useState<string | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  // Bumped each time the dialog opens so NewChatDialog remounts with fresh
  // internal state instead of needing a reset-on-close effect.
  const [newChatSession, setNewChatSession] = useState(0);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // Peer IDs currently reported online by the hub (see the presence poll below).
  const [onlinePeers, setOnlinePeers] = useState<Set<string>>(new Set());

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
        const resolved = await apiClient.get<{ user_id: string; public_key: string }>(
          `/api/users/${conversation.peerId}/key`,
        );
        if (resolved.public_key === conversation.peerPublicKey) return conversation;
        sharedKeyCache.current.delete(conversation.peerId);
        const refreshed: Conversation = { ...conversation, peerPublicKey: resolved.public_key };
        setConversations(upsertConversation(currentUserId, refreshed));
        return refreshed;
      } catch {
        // Best-effort — a cached key still works if it hasn't rotated.
        return conversation;
      }
    },
    [],
  );

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
              const text = await decryptText(key, m.ciphertext, m.nonce);
              ok.push({ id: m.message_id, senderId: m.sender_id, text, timestamp: m.timestamp });
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

      const {
        sender_id: senderId,
        chat_room_id: chatRoomId,
        ciphertext,
        nonce,
        message_id: messageId,
        timestamp,
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
            const resolved = await apiClient.get<{ user_id: string; public_key: string }>(
              `/api/users/${senderId}/key`,
            );
            conversation = {
              peerId: senderId,
              peerUsername: `user_${senderId.slice(0, 8)}`,
              peerPublicKey: resolved.public_key,
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
          const text = await decryptIncoming(conversation, ciphertext, nonce, user.user_id);
          recordMessage(chatRoomId, {
            id: messageId,
            senderId,
            text,
            timestamp: timestamp ?? Date.now(),
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

  function handleStartConversation(peer: ResolvedPeer) {
    if (!user) return;
    const conversation: Conversation = {
      peerId: peer.userId,
      peerUsername: peer.username,
      peerPublicKey: peer.publicKey,
      chatRoomId: chatRoomIdFor(user.user_id, peer.userId),
      createdAt: Date.now(),
    };
    setConversations(upsertConversation(user.user_id, conversation));
    setActivePeerId(peer.userId);
    setMessagesByRoom((prev) =>
      prev[conversation.chatRoomId]
        ? prev
        : { ...prev, [conversation.chatRoomId]: getMessages(conversation.chatRoomId) },
    );
    // History sync runs from the effect below, keyed off activePeerId — not
    // called directly here too, so opening a conversation only fetches once.
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

  async function handleSend(text: string) {
    if (!user) return;
    const conversation = conversations.find((c) => c.peerId === activePeerId);
    if (!conversation) return;

    setIsSending(true);
    setSendError(null);
    try {
      const sharedKey = await getSharedKey(conversation);
      if (!sharedKey) throw new Error('Encryption keys are not ready yet.');

      const { ciphertext, nonce } = await encryptText(sharedKey, text);
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
      });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setIsSending(false);
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
          onSelectConversation={setActivePeerId}
          onNewChat={() => {
            setNewChatSession((n) => n + 1);
            setIsNewChatOpen(true);
          }}
          onLogout={onLogout}
        />
      }>
      {activeConversation ? (
        <ChatView
          conversation={activeConversation}
          messages={activeMessages}
          myUserId={user?.user_id ?? ''}
          onSend={handleSend}
          isSending={isSending}
          sendError={sendError}
          connectionStatus={connectionStatus}
        />
      ) : (
        <Layout
          height="fill"
          contentWidth={768}
          content={
            <LayoutContent padding={6}>
              <VStack gap={2}>
                <Heading level={1} type="display-3">
                  Welcome{user ? `, ${user.username}` : ''}
                </Heading>
                <Text type="body" color="secondary">
                  Your end-to-end encrypted workspace is ready. Pick a
                  conversation from the sidebar or start a new chat.
                </Text>
                <EmptyState
                  conversations={conversations}
                  onlinePeers={visibleOnlinePeers}
                  onSelect={setActivePeerId}
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
    </AppShell>
  );
}

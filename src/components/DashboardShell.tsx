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
import { getMessages, mergeMessages, type ChatMessage } from '@/lib/messageStore';
import { useChatSocket } from '@/hooks/useChatSocket';
import { useE2EEKeys } from '@/hooks/useE2EEKeys';
import { ChatView } from './ChatView';
import { EmptyState } from './EmptyState';
import { NewChatDialog, type ResolvedPeer } from './NewChatDialog';
import { Sidebar } from './Sidebar';

interface InboundFrame {
  message_id: string;
  sender_id: string;
  chat_room_id: string;
  ciphertext: string;
  nonce: string;
  timestamp: number;
}

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

  // Derived AES-GCM keys are per-peer and deterministic (ECDH) — cache them
  // instead of re-deriving on every message.
  const sharedKeyCache = useRef<Map<string, CryptoKey>>(new Map());

  const getSharedKey = useCallback(
    async (peer: Conversation): Promise<CryptoKey | null> => {
      if (keyState.status !== 'ready') {
        console.warn('[vibenet:e2ee] shared key requested before local keys were ready', {
          peerId: peer.peerId,
          keyStatus: keyState.status,
        });
        return null;
      }
      const cached = sharedKeyCache.current.get(peer.peerId);
      if (cached) return cached;
      const theirPublicKey = await importPublicKey(peer.peerPublicKey);
      const shared = await deriveSharedKey(keyState.privateKey, theirPublicKey);
      sharedKeyCache.current.set(peer.peerId, shared);
      return shared;
    },
    [keyState],
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
          console.error(
            '[vibenet:e2ee] peer public key on the server matches what we already tried for',
            conversation.peerId,
            '— this is a real key mismatch, not staleness',
          );
          return null;
        }

        sharedKeyCache.current.delete(conversation.peerId);
        const refreshed: Conversation = { ...conversation, peerPublicKey: resolved.public_key };
        setConversations(upsertConversation(currentUserId, refreshed));
        console.log('[vibenet:e2ee] peer public key had rotated, refreshed cache for', conversation.peerId);

        const key = await getSharedKey(refreshed);
        if (!key) return null;
        return { key, conversation: refreshed };
      } catch (err) {
        console.error('[vibenet:e2ee] failed to refresh peer public key for', conversation.peerId, err);
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
        console.warn(
          '[vibenet:receive] decrypt failed with cached public key for',
          conversation.peerId,
          '— refetching their current key and retrying once',
          err,
        );
        const refresh = await refreshPeerSharedKey(conversation, currentUserId);
        if (!refresh) throw err;
        console.log('[vibenet:receive] retrying decrypt with refreshed key');
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

        const decryptAll = async (key: CryptoKey) => {
          const ok: ChatMessage[] = [];
          for (const m of remote) {
            try {
              const text = await decryptText(key, m.ciphertext, m.nonce);
              ok.push({ id: m.message_id, senderId: m.sender_id, text, timestamp: m.timestamp });
            } catch {
              // Collected as a miss below — one shared key per conversation,
              // so a miss on one message means every message will miss.
            }
          }
          return ok;
        };

        let decrypted = await decryptAll(sharedKey);

        if (decrypted.length < remote.length) {
          console.warn(
            '[vibenet:history]',
            remote.length - decrypted.length,
            'of',
            remote.length,
            'history message(s) failed to decrypt with the cached key for',
            conversation.peerId,
            '— retrying once with a refreshed peer key',
          );
          const refresh = await refreshPeerSharedKey(conversation, currentUserId);
          if (refresh) {
            const retried = await decryptAll(refresh.key);
            // Keep whichever attempt decrypted more — the peer's key may
            // have rotated partway through this room's history, splitting
            // messages across an old and a new key.
            if (retried.length > decrypted.length) decrypted = retried;
          }
          if (decrypted.length < remote.length) {
            console.warn(
              '[vibenet:history]',
              remote.length - decrypted.length,
              'message(s) still undecryptable after retry — encrypted under a key this device (or the peer) no longer has. Inherent E2EE key loss, not a bug.',
            );
          }
        }

        if (decrypted.length === 0) return;

        const merged = mergeMessages(conversation.chatRoomId, decrypted);
        setMessagesByRoom((prev) => ({ ...prev, [conversation.chatRoomId]: merged }));
      } catch (err) {
        // Network/auth failure — live delivery still works without history.
        console.error('[vibenet:history] failed to sync history for', conversation.chatRoomId, err);
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
      const frame = data as Partial<InboundFrame>;
      const {
        sender_id: senderId,
        chat_room_id: chatRoomId,
        ciphertext,
        nonce,
        message_id: messageId,
        timestamp,
      } = frame;
      console.log('[vibenet:receive] frontend received frame', {
        messageId,
        senderId,
        chatRoomId,
      });
      if (!senderId || !chatRoomId || !ciphertext || !nonce || !messageId) {
        console.error('[vibenet:receive] dropping frame — missing required fields', frame);
        return;
      }

      // Keys not generated/imported yet (fresh browser profile racing the
      // first inbound message) — queue and replay once ready instead of
      // dropping the frame for good.
      if (keyState.status !== 'ready') {
        console.warn('[vibenet:receive] E2EE keys not ready yet, queuing frame for retry', messageId);
        pendingFramesRef.current.push(frame as InboundFrame);
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
            console.log('[vibenet:receive] auto-resolved unknown sender', senderId);
          } catch (err) {
            console.error('[vibenet:receive] could not resolve unknown sender', senderId, err);
            gooeyToast('New encrypted message from an unknown contact.', {
              description: 'Start a chat with them from "New chat" to read it.',
            });
            return;
          }
        }

        try {
          const text = await decryptIncoming(conversation, ciphertext, nonce, user.user_id);
          console.log('[vibenet:receive] decrypted message', messageId, 'from', senderId);
          recordMessage(chatRoomId, {
            id: messageId,
            senderId,
            text,
            timestamp: timestamp ?? Date.now(),
          });
        } catch (err) {
          // Undecryptable even after a key-refresh retry — genuinely
          // tampered payload or an unresolvable key mismatch. Drop rather
          // than show ciphertext.
          console.error('[vibenet:receive] decryption failed, dropping frame', messageId, err);
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
    console.log('[vibenet:receive] keys now ready, replaying', queued.length, 'queued frame(s)');
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
    if (conversation) void syncHistory(conversation, user.user_id);
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
      console.log('[vibenet:send] encrypted, sending over socket', {
        messageId,
        receiverId: conversation.peerId,
        chatRoomId: conversation.chatRoomId,
      });

      const delivered = send({
        message_id: messageId,
        receiver_id: conversation.peerId,
        chat_room_id: conversation.chatRoomId,
        ciphertext,
        nonce,
        timestamp,
      });
      console.log('[vibenet:send] socket.send() returned delivered =', delivered, 'for', messageId);
      if (!delivered) throw new Error('Not connected — reconnecting, try again shortly.');

      recordMessage(conversation.chatRoomId, {
        id: messageId,
        senderId: user.user_id,
        text,
        timestamp,
      });
    } catch (err) {
      console.error('[vibenet:send] failed to send message', err);
      setSendError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setIsSending(false);
    }
  }

  const activeConversation = conversations.find((c) => c.peerId === activePeerId) ?? null;
  const activeMessages = activeConversation
    ? (messagesByRoom[activeConversation.chatRoomId] ?? getMessages(activeConversation.chatRoomId))
    : [];

  return (
    <AppShell
      contentPadding={0}
      height="fill"
      sideNav={
        <Sidebar
          user={user}
          conversations={conversations}
          activePeerId={activePeerId}
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
                <EmptyState />
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

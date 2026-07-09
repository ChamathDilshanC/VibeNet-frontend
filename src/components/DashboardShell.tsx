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
import { appendMessage, getMessages, mergeMessages, type ChatMessage } from '@/lib/messageStore';
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

  // Catches a conversation up on anything sent while this device wasn't
  // connected — the WS hub only delivers live, with no queue (see
  // GetChatHistory on the backend). Best-effort: a failed fetch just means
  // live delivery keeps working without the catch-up.
  const syncHistory = useCallback(
    async (conversation: Conversation) => {
      try {
        const sharedKey = await getSharedKey(conversation);
        if (!sharedKey) return;

        const { messages: remote } = await apiClient.get<{ messages: RemoteMessageDTO[] }>(
          `/api/messages/${encodeURIComponent(conversation.chatRoomId)}`,
        );
        if (remote.length === 0) return;

        const decrypted: ChatMessage[] = [];
        for (const m of remote) {
          try {
            const text = await decryptText(sharedKey, m.ciphertext, m.nonce);
            decrypted.push({
              id: m.message_id,
              senderId: m.sender_id,
              text,
              timestamp: m.timestamp,
            });
          } catch {
            // Skip anything that fails to decrypt (e.g. sent under a rotated key).
          }
        }
        if (decrypted.length === 0) return;

        const merged = mergeMessages(conversation.chatRoomId, decrypted);
        setMessagesByRoom((prev) => ({ ...prev, [conversation.chatRoomId]: merged }));
      } catch {
        // Network/auth failure — live delivery still works without history.
      }
    },
    [getSharedKey],
  );

  function recordMessage(chatRoomId: string, message: ChatMessage) {
    appendMessage(chatRoomId, message);
    setMessagesByRoom((prev) => ({
      ...prev,
      [chatRoomId]: [...(prev[chatRoomId] ?? getMessages(chatRoomId)), message],
    }));
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
      if (!senderId || !chatRoomId || !ciphertext || !nonce || !messageId) return;

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

        const sharedKey = await getSharedKey(conversation);
        if (!sharedKey) return;

        try {
          const text = await decryptText(sharedKey, ciphertext, nonce);
          recordMessage(chatRoomId, {
            id: messageId,
            senderId,
            text,
            timestamp: timestamp ?? Date.now(),
          });
        } catch {
          // Undecryptable frame (stale/rotated key) — drop rather than show ciphertext.
        }
      })();
    },
    [conversations, getSharedKey, user],
  );

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
    if (connectionStatus !== 'open' || !activePeerId) return;
    const conversation = conversations.find((c) => c.peerId === activePeerId);
    if (conversation) void syncHistory(conversation);
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

      const delivered = send({
        message_id: messageId,
        receiver_id: conversation.peerId,
        chat_room_id: conversation.chatRoomId,
        ciphertext,
        nonce,
        timestamp,
      });
      if (!delivered) throw new Error('Not connected — reconnecting, try again shortly.');

      recordMessage(conversation.chatRoomId, {
        id: messageId,
        senderId: user.user_id,
        text,
        timestamp,
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

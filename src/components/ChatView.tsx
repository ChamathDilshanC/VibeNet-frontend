// VibeNet — active conversation panel: header, message list, composer.
//
// Renders in place of EmptyState once a conversation is selected. Messages
// are plaintext by the time they reach this component — DashboardShell
// decrypts on receive and encrypts on send, so this is purely a display +
// input concern.

'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Layout, LayoutContent, LayoutFooter, LayoutHeader } from '@astryxdesign/core/Layout';
import { HStack, VStack } from '@astryxdesign/core/Stack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { ChatSocketStatus } from '@/hooks/useChatSocket';
import type { Conversation } from '@/lib/conversations';
import type { ChatMessage } from '@/lib/messageStore';

const CONNECTION_LABEL: Record<ChatSocketStatus, string> = {
  open: 'Connected',
  connecting: 'Connecting…',
  closed: 'Reconnecting…',
};

const CONNECTION_VARIANT: Record<ChatSocketStatus, 'success' | 'warning' | 'neutral'> = {
  open: 'success',
  connecting: 'neutral',
  closed: 'warning',
};

export function ChatView({
  conversation,
  messages,
  myUserId,
  onSend,
  isSending,
  sendError,
  connectionStatus,
}: {
  conversation: Conversation;
  messages: ChatMessage[];
  myUserId: string;
  onSend: (text: string) => void;
  isSending: boolean;
  sendError: string | null;
  connectionStatus: ChatSocketStatus;
}) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <Layout
      height="fill"
      contentWidth={768}
      header={
        <LayoutHeader hasDivider padding={4}>
          <HStack gap={2} vAlign="center">
            <Avatar name={conversation.peerUsername} size="small" />
            <Text type="body" weight="semibold">
              {conversation.peerUsername}
            </Text>
            <StatusDot
              variant={CONNECTION_VARIANT[connectionStatus]}
              label={CONNECTION_LABEL[connectionStatus]}
            />
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={6}>
          <VStack gap={3}>
            {messages.length === 0 && (
              <Text type="supporting" color="secondary">
                No messages yet. Say hello — messages are encrypted on your
                device before they&apos;re sent.
              </Text>
            )}
            {messages.map((message) => {
              const isMine = message.senderId === myUserId;
              return (
                <HStack key={message.id} hAlign={isMine ? 'end' : 'start'}>
                  <Card
                    variant={isMine ? 'blue' : 'default'}
                    padding={3}
                    maxWidth="70%">
                    <Text type="body">{message.text}</Text>
                  </Card>
                </HStack>
              );
            })}
            <div ref={bottomRef} />
          </VStack>
        </LayoutContent>
      }
      footer={
        <LayoutFooter hasDivider padding={4}>
          <VStack gap={1.5}>
            {sendError && (
              <Text type="supporting" className="text-red-600 dark:text-red-400">
                {sendError}
              </Text>
            )}
            <HStack gap={2} vAlign="center">
              <TextInput
                label="Message"
                isLabelHidden
                placeholder={`Message ${conversation.peerUsername}`}
                value={draft}
                onChange={setDraft}
                onEnter={handleSend}
                width="100%"
              />
              <Button
                label="Send"
                variant="primary"
                onClick={handleSend}
                isDisabled={!draft.trim() || isSending}
                isLoading={isSending}
              />
            </HStack>
          </VStack>
        </LayoutFooter>
      }
    />
  );
}

// VibeNet — active conversation panel: header, message list, composer.
//
// Renders in place of EmptyState once a conversation is selected. Messages
// are plaintext by the time they reach this component — DashboardShell
// decrypts on receive and encrypts on send, so this is purely a display +
// input concern.
//
// Layout is a full-height flex column (fills the AppShell content region):
// a sticky header, a single scrolling message region, and a composer pinned
// at the bottom that never scrolls away.

'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { FaceSmileIcon, PaperClipIcon } from '@heroicons/react/24/outline';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import type { ChatSocketStatus } from '@/hooks/useChatSocket';
import type { Conversation } from '@/lib/conversations';
import type { ChatMessage, MessageStatus } from '@/lib/messageStore';

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

const STATUS_LABEL: Record<MessageStatus, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// WhatsApp-style delivery ticks, sized to sit next to the timestamp inside the
// sender bubble: one tick when only the server has it, two once the recipient
// is online and received it, and a deep-blue double tick once they've read it —
// which "lights up" against the lighter logo-blue bubble.
function DeliveryTicks({ status }: { status: MessageStatus }) {
  const isDouble = status !== 'sent';
  const isRead = status === 'read';
  const color = isRead ? 'text-[#0b3f8f]' : status === 'delivered' ? 'text-white/90' : 'text-white/70';
  return (
    <span role="img" aria-label={STATUS_LABEL[status]} className={`inline-flex ${color}`}>
      <svg
        width="16"
        height="11"
        viewBox="0 0 16 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true">
        <path d="M1 6l3 3 5.5-6.5" />
        {isDouble && <path d="M6.5 9l5.5-6.5" />}
      </svg>
    </span>
  );
}

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

  const canSend = Boolean(draft.trim()) && !isSending;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-gradient-to-br from-[#f1ecfb] via-[#eaeefb] to-[#e6effb]">
      {/* Header — peer identity + live connection status. */}
      <header className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-white/70 px-4 py-3 backdrop-blur-sm sm:px-6">
        <Avatar name={conversation.peerUsername} size="small" />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-gray-900">
            {conversation.peerUsername}
          </span>
          <span className="text-xs text-gray-500">
            {CONNECTION_LABEL[connectionStatus]}
          </span>
        </div>
        <StatusDot
          className="ml-auto"
          variant={CONNECTION_VARIANT[connectionStatus]}
          label={CONNECTION_LABEL[connectionStatus]}
        />
      </header>

      {/* Scrolling message region — the only scrollable area. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-gray-500">
              No messages yet. Say hello — messages are encrypted on your device
              before they&apos;re sent.
            </p>
          )}

          {messages.map((message) => {
            const isMine = message.senderId === myUserId;

            if (isMine) {
              // Sender bubble — right aligned, solid blue, white text.
              return (
                <div key={message.id} className="vibe-msg-in flex origin-bottom-right justify-end">
                  <div className="max-w-[75%] rounded-2xl rounded-br-md bg-[var(--vibe-blue)] px-4 py-2.5 text-white shadow-sm [text-shadow:0_1px_1px_rgba(2,20,40,0.28)]">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {message.text}
                    </p>
                    <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-white/85">
                      {formatTime(message.timestamp)}
                      {message.status && <DeliveryTicks status={message.status} />}
                    </span>
                  </div>
                </div>
              );
            }

            // Receiver bubble — left aligned, avatar + name, light gray.
            return (
              <div key={message.id} className="vibe-msg-in flex origin-bottom-left items-end gap-2">
                <Avatar name={conversation.peerUsername} size="small" />
                <div className="max-w-[75%] rounded-2xl rounded-tl-md bg-white px-4 py-2.5 shadow-sm ring-1 ring-black/[0.03]">
                  <span className="mb-0.5 block text-[13px] font-semibold text-[#277a0c]">
                    {conversation.peerUsername}
                  </span>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700">
                    {message.text}
                  </p>
                  <span className="mt-1 block text-right text-[11px] text-gray-400">
                    {formatTime(message.timestamp)}
                  </span>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer — pinned at the bottom, floating pill container. */}
      <div className="shrink-0 px-4 pb-5 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-3xl">
          {sendError && (
            <p className="mb-2 px-3 text-xs text-red-600 dark:text-red-400">
              {sendError}
            </p>
          )}
          <form
            className="flex items-center gap-1.5 rounded-full bg-white p-1.5 pl-3 shadow-[0_8px_30px_rgba(37,63,132,0.12)] ring-1 ring-black/[0.04]"
            onSubmit={(event) => {
              event.preventDefault();
              handleSend();
            }}>
            <button
              type="button"
              aria-label="Add emoji"
              className="flex shrink-0 items-center justify-center rounded-full p-1.5 text-gray-400 transition-colors hover:text-gray-600">
              <FaceSmileIcon className="h-6 w-6" />
            </button>

            <input
              type="text"
              aria-label="Message"
              placeholder={`Message ${conversation.peerUsername}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-w-0 flex-1 bg-transparent px-1 text-sm text-gray-900 outline-none placeholder:text-gray-400"
            />

            <button
              type="button"
              aria-label="Attach file"
              className="flex shrink-0 items-center justify-center rounded-full p-1.5 text-gray-400 transition-colors hover:text-gray-600">
              <PaperClipIcon className="h-6 w-6" />
            </button>

            <button
              type="submit"
              aria-label="Send message"
              disabled={!canSend}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--vibe-blue)] text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:bg-gray-300">
              <PaperAirplaneIcon className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

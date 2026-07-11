// VibeNet — active conversation panel: header, message list, composer.
//
// Renders in place of EmptyState once a conversation is selected. Messages
// are plaintext by the time they reach this component — DashboardShell
// decrypts on receive and encrypts on send, so this is purely a display +
// input concern.
//
// Layout is a full-height flex column (fills the AppShell content region):
// a sticky header, an optional pinned-message banner, a single scrolling
// message region, and a composer pinned at the bottom that never scrolls away.
// Each bubble carries a hover context menu (see MessageContextMenu) with the
// full WhatsApp-style action set; the composer grows a reply preview above it
// when a message is being replied to, and a selection bar replaces the header
// while multi-select is active.

'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { Avatar } from '@astryxdesign/core/Avatar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
  CheckCircleIcon as CheckCircleOutlineIcon,
  FaceSmileIcon,
  PaperClipIcon,
  Square2StackIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  BookmarkIcon as BookmarkSolidIcon,
  CheckCircleIcon as CheckCircleSolidIcon,
  MapPinIcon as MapPinSolidIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/solid';
import { gooeyToast } from 'goey-toast';
import type { ChatSocketStatus } from '@/hooks/useChatSocket';
import type { Conversation } from '@/lib/conversations';
import type { ChatMessage, MessageStatus } from '@/lib/messageStore';
import { MessageContextMenu } from './MessageContextMenu';

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

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

// A day separator label: "Today"/"Yesterday" for the two most recent days,
// otherwise a written-out date (the year is dropped when it's the current one).
function dayLabel(timestamp: number): string {
  const now = Date.now();
  if (isSameDay(timestamp, now)) return 'Today';
  if (isSameDay(timestamp, now - 86_400_000)) return 'Yesterday';
  const date = new Date(timestamp);
  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
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

// Truncated one-line preview of a message body — used by the reply preview and
// the pinned banner.
function previewText(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
}

// Callbacks a bubble needs; grouped so both the row and its context menu share
// the same shape.
interface MessageActions {
  onReply: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onForward: (message: ChatMessage) => void;
  onTogglePin: (message: ChatMessage) => void;
  onToggleKeep: (message: ChatMessage) => void;
  onStartSelect: (message: ChatMessage) => void;
  onReport: (message: ChatMessage) => void;
  onDeleteForMe: (message: ChatMessage) => void;
  onDeleteForEveryone: (message: ChatMessage) => void;
}

function MessageRow({
  message,
  isMine,
  conversation,
  actions,
  menuOpen,
  onMenuOpenChange,
  selectMode,
  isSelected,
  onToggleSelect,
}: {
  message: ChatMessage;
  isMine: boolean;
  conversation: Conversation;
  actions: MessageActions;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: (message: ChatMessage) => void;
}) {
  // The hover chevron lives in the bubble's top corner. Keep it mounted but
  // invisible until the row is hovered (or its menu is open, so it doesn't
  // vanish while you're using it). On the blue sender bubble the chevron is
  // tinted white for contrast; on the light receiver bubble it stays grey.
  const trigger = (
    <div
      className={[
        'absolute top-1 z-10 transition-opacity',
        isMine ? 'left-1 [&_svg]:text-white/90' : 'right-1 [&_svg]:text-gray-500',
        menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
      ].join(' ')}
      // The menu is an action surface, not part of the selection hit area.
      onClick={(e) => e.stopPropagation()}>
      <MessageContextMenu
        message={message}
        isMine={isMine}
        isOpen={menuOpen}
        onOpenChange={onMenuOpenChange}
        onReply={() => actions.onReply(message)}
        onCopy={() => actions.onCopy(message)}
        onForward={() => actions.onForward(message)}
        onTogglePin={() => actions.onTogglePin(message)}
        onToggleKeep={() => actions.onToggleKeep(message)}
        onSelect={() => actions.onStartSelect(message)}
        onReport={() => actions.onReport(message)}
        onDeleteForMe={() => actions.onDeleteForMe(message)}
        onDeleteForEveryone={() => actions.onDeleteForEveryone(message)}
      />
    </div>
  );

  const rowSelectProps = selectMode
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: () => onToggleSelect(message),
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleSelect(message);
          }
        },
      }
    : {};

  const SelectMark = isSelected ? CheckCircleSolidIcon : CheckCircleOutlineIcon;

  return (
    <div
      {...rowSelectProps}
      className={[
        'group -mx-2 flex items-center gap-2 rounded-2xl px-2 py-0.5 transition-colors',
        selectMode ? 'cursor-pointer' : '',
        isSelected ? 'bg-[var(--vibe-blue)]/10' : selectMode ? 'hover:bg-black/[0.03]' : '',
      ].join(' ')}>
      {selectMode && (
        <SelectMark
          className={`h-6 w-6 shrink-0 ${isSelected ? 'text-[var(--vibe-blue)]' : 'text-gray-400'}`}
          aria-hidden="true"
        />
      )}

      {isMine ? (
        // Sender bubble — right aligned, solid blue, white text.
        <div className="vibe-msg-in flex flex-1 origin-bottom-right justify-end">
          <div className="relative max-w-[75%] rounded-2xl rounded-br-md bg-[var(--vibe-blue)] px-4 py-2.5 text-white shadow-sm [text-shadow:0_1px_1px_rgba(2,20,40,0.28)]">
            {!selectMode && trigger}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {message.text}
            </p>
            <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-white/85">
              {message.kept && (
                <BookmarkSolidIcon className="h-3 w-3 text-white/85" aria-label="Kept" />
              )}
              {message.pinned && (
                <MapPinSolidIcon className="h-3 w-3 text-white/85" aria-label="Pinned" />
              )}
              {formatTime(message.timestamp)}
              {message.status && <DeliveryTicks status={message.status} />}
            </span>
          </div>
        </div>
      ) : (
        // Receiver bubble — left aligned, avatar + name, light gray.
        <div className="vibe-msg-in flex flex-1 origin-bottom-left items-end gap-2">
          <Avatar src={conversation.peerAvatarUrl} name={conversation.peerUsername} size="small" />
          <div className="relative max-w-[75%] rounded-2xl rounded-tl-md bg-white px-4 py-2.5 shadow-sm ring-1 ring-black/[0.03]">
            {!selectMode && trigger}
            <span className="mb-0.5 block text-[13px] font-semibold text-[#277a0c]">
              {conversation.peerUsername}
            </span>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700">
              {message.text}
            </p>
            <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-gray-400">
              {message.kept && (
                <BookmarkSolidIcon className="h-3 w-3 text-gray-400" aria-label="Kept" />
              )}
              {message.pinned && (
                <MapPinSolidIcon className="h-3 w-3 text-gray-400" aria-label="Pinned" />
              )}
              {formatTime(message.timestamp)}
            </span>
          </div>
        </div>
      )}
    </div>
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
  onForward,
  onTogglePin,
  onToggleKeep,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  conversation: Conversation;
  messages: ChatMessage[];
  myUserId: string;
  onSend: (text: string) => void;
  isSending: boolean;
  sendError: string | null;
  connectionStatus: ChatSocketStatus;
  onForward: (message: ChatMessage) => void;
  onTogglePin: (message: ChatMessage) => void;
  onToggleKeep: (message: ChatMessage) => void;
  onDeleteForMe: (message: ChatMessage) => void;
  onDeleteForEveryone: (message: ChatMessage) => void;
}) {
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // A message deleted while it was the reply target shouldn't leave a preview
  // pointing at nothing — derive the live target rather than clearing state in
  // an effect (which would trigger a cascading render).
  const activeReply =
    replyingTo && messages.some((m) => m.id === replyingTo.id) ? replyingTo : null;

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
    setReplyingTo(null);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(message: ChatMessage) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(message.id)) next.delete(message.id);
      else next.add(message.id);
      return next;
    });
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.text);
      gooeyToast('Copied to clipboard');
    } catch {
      gooeyToast('Could not copy message', { description: 'Clipboard access was blocked.' });
    }
  }

  const actions: MessageActions = {
    onReply: (message) => {
      setReplyingTo(message);
      inputRef.current?.focus();
    },
    onCopy: (message) => void copyMessage(message),
    onForward,
    onTogglePin,
    onToggleKeep,
    onStartSelect: (message) => {
      setSelectMode(true);
      setSelectedIds(new Set([message.id]));
    },
    onReport: () => {
      gooeyToast('Message reported', {
        description: 'Thanks — our team will review it. (Demo only.)',
      });
    },
    onDeleteForMe,
    onDeleteForEveryone,
  };

  const selectedMessages = messages.filter((m) => selectedIds.has(m.id));

  function copySelected() {
    const text = selectedMessages.map((m) => m.text).join('\n');
    navigator.clipboard.writeText(text).then(
      () => gooeyToast(`Copied ${selectedMessages.length} message${selectedMessages.length === 1 ? '' : 's'}`),
      () => gooeyToast('Could not copy messages'),
    );
  }

  function deleteSelected() {
    selectedMessages.forEach((m) => onDeleteForMe(m));
    exitSelectMode();
  }

  const canSend = Boolean(draft.trim()) && !isSending;
  const pinnedMessages = messages.filter((m) => m.pinned);
  const latestPinned = pinnedMessages[pinnedMessages.length - 1];
  const replyIsMine = activeReply?.senderId === myUserId;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-gradient-to-br from-[#f1ecfb] via-[#eaeefb] to-[#e6effb]">
      {/* Header — either peer identity + connection, or the selection toolbar. */}
      {selectMode ? (
        <header className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-white/80 px-4 py-3 backdrop-blur-sm sm:px-6">
          <button
            type="button"
            aria-label="Cancel selection"
            onClick={exitSelectMode}
            className="flex items-center justify-center rounded-full p-1.5 text-gray-500 transition-colors hover:bg-black/[0.05] hover:text-gray-700">
            <XMarkIcon className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-gray-900">
            {selectedIds.size} selected
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              aria-label="Copy selected"
              disabled={selectedIds.size === 0}
              onClick={copySelected}
              className="flex items-center justify-center rounded-full p-2 text-gray-500 transition-colors hover:bg-black/[0.05] hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">
              <Square2StackIcon className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Delete selected for me"
              disabled={selectedIds.size === 0}
              onClick={deleteSelected}
              className="flex items-center justify-center rounded-full p-2 text-red-500 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40">
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </header>
      ) : (
        <header className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-white/70 px-4 py-3 backdrop-blur-sm sm:px-6">
          <Avatar src={conversation.peerAvatarUrl} name={conversation.peerUsername} size="small" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-gray-900">
              {conversation.peerUsername}
            </span>
            <span className="text-xs text-gray-500">{CONNECTION_LABEL[connectionStatus]}</span>
          </div>
          <StatusDot
            className="ml-auto"
            variant={CONNECTION_VARIANT[connectionStatus]}
            label={CONNECTION_LABEL[connectionStatus]}
          />
        </header>
      )}

      {/* Pinned-message banner — shows the most recent pin for the room. */}
      {latestPinned && !selectMode && (
        <div className="flex shrink-0 items-center gap-2 border-b border-black/5 bg-white/60 px-4 py-2 backdrop-blur-sm sm:px-6">
          <MapPinSolidIcon className="h-4 w-4 shrink-0 text-[var(--vibe-blue)]" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Pinned{pinnedMessages.length > 1 ? ` · ${pinnedMessages.length}` : ''}
            </p>
            <p className="truncate text-xs text-gray-600">{previewText(latestPinned.text)}</p>
          </div>
          <button
            type="button"
            aria-label="Unpin message"
            onClick={() => onTogglePin(latestPinned)}
            className="flex shrink-0 items-center justify-center rounded-full p-1.5 text-gray-400 transition-colors hover:bg-black/[0.05] hover:text-gray-600">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Scrolling message region — the only scrollable area. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-gray-500">
              No messages yet. Say hello — messages are encrypted on your device
              before they&apos;re sent.
            </p>
          )}

          {messages.map((message, index) => {
            const isMine = message.senderId === myUserId;
            const prev = messages[index - 1];
            // A centered date chip precedes the first message and any message
            // that starts a new calendar day.
            const showDay = !prev || !isSameDay(prev.timestamp, message.timestamp);

            return (
              <Fragment key={message.id}>
                {showDay && (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm">
                      {dayLabel(message.timestamp)}
                    </span>
                  </div>
                )}

                <MessageRow
                  message={message}
                  isMine={isMine}
                  conversation={conversation}
                  actions={actions}
                  menuOpen={openMenuId === message.id}
                  onMenuOpenChange={(open) => setOpenMenuId(open ? message.id : null)}
                  selectMode={selectMode}
                  isSelected={selectedIds.has(message.id)}
                  onToggleSelect={toggleSelect}
                />
              </Fragment>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer — pinned at the bottom, floating pill container. Hidden while
          multi-select is active, since the toolbar owns actions then. */}
      {!selectMode && (
        <div className="shrink-0 px-4 pb-5 pt-2 sm:px-6">
          <div className="mx-auto w-full max-w-3xl">
            {sendError && (
              <p className="mb-2 px-3 text-xs text-red-600 dark:text-red-400">{sendError}</p>
            )}

            {/* Reply preview — sits directly above the input and pushes the
                history up naturally (it's part of the shrink-0 composer, not an
                overlay), so the scroll layout stays intact. */}
            {activeReply && (
              <div className="mb-2 flex items-stretch gap-2 rounded-2xl bg-white/90 p-2 pl-3 shadow-[0_4px_16px_rgba(37,63,132,0.08)] ring-1 ring-black/[0.04]">
                <span className="w-1 shrink-0 rounded-full bg-[var(--vibe-blue)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--vibe-blue)]">
                    Replying to {replyIsMine ? 'yourself' : conversation.peerUsername}
                  </p>
                  <p className="truncate text-xs text-gray-500">{previewText(activeReply.text)}</p>
                </div>
                <button
                  type="button"
                  aria-label="Cancel reply"
                  onClick={() => setReplyingTo(null)}
                  className="flex shrink-0 items-center justify-center rounded-full p-1.5 text-gray-400 transition-colors hover:bg-black/[0.05] hover:text-gray-600">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
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
                ref={inputRef}
                type="text"
                aria-label="Message"
                placeholder={
                  activeReply ? 'Type your reply…' : `Message ${conversation.peerUsername}`
                }
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
      )}
    </div>
  );
}

// VibeNet — renders a shared contact inside a message bubble.
//
// Shows the contact's real name prominently with their @username below, and a
// "Message" button that opens a chat with them (see DashboardShell.openPeer).
// Purely presentational — the payload itself (ContactPayload) already rode
// end-to-end encrypted inside the message envelope, same as file attachments.

'use client';

import { IdentificationIcon } from '@heroicons/react/24/outline';
import type { ContactPayload } from '@/lib/messageStore';

export function ContactMessageCard({
  contact,
  tone,
  onMessage,
}: {
  contact: ContactPayload;
  tone: 'sender' | 'receiver';
  onMessage: () => void;
}) {
  const isSender = tone === 'sender';

  return (
    <div className={`mb-1 flex w-56 flex-col gap-2.5 rounded-xl p-3 ${isSender ? 'bg-white/10' : 'bg-black/5 dark:bg-white/10'}`}>
      <div className="flex items-center gap-2.5">
        <span
          className={[
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            isSender
              ? 'bg-white/15 text-white'
              : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300',
          ].join(' ')}>
          <IdentificationIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${isSender ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
            {contact.real_name}
          </span>
          <span className={`block truncate text-xs ${isSender ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
            @{contact.username}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={onMessage}
        className={[
          'rounded-lg py-1.5 text-center text-xs font-semibold transition-colors',
          isSender
            ? 'bg-white/15 text-white hover:bg-white/25'
            : 'bg-[var(--vibe-blue)]/10 text-[var(--vibe-blue)] hover:bg-[var(--vibe-blue)]/20',
        ].join(' ')}>
        Message
      </button>
    </div>
  );
}

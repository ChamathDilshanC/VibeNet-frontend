// VibeNet — renders an event inside a message bubble.
//
// Placeholder card: "Create Event" (see CreateEventDialog) only sends dummy
// title/date/location for now, and this just displays them — no RSVP yet.

'use client';

import { CalendarDaysIcon, MapPinIcon } from '@heroicons/react/24/outline';
import type { EventPayload } from '@/lib/messageStore';

function formatEventDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function EventMessageCard({ event, tone }: { event: EventPayload; tone: 'sender' | 'receiver' }) {
  const isSender = tone === 'sender';

  return (
    <div className={`mb-1 flex w-56 flex-col gap-2 rounded-xl p-3 ${isSender ? 'bg-white/10' : 'bg-black/5 dark:bg-white/10'}`}>
      <div className="flex items-center gap-1.5">
        <CalendarDaysIcon
          className={`h-4 w-4 ${isSender ? 'text-white/80' : 'text-red-600 dark:text-red-400'}`}
          aria-hidden="true"
        />
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${isSender ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
          Event
        </span>
      </div>
      <p className={`text-sm font-medium ${isSender ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
        {event.title}
      </p>
      <p className={`text-xs ${isSender ? 'text-white/80' : 'text-gray-600 dark:text-gray-300'}`}>
        {formatEventDate(event.date)}
      </p>
      {event.location && (
        <p className={`flex items-center gap-1 text-xs ${isSender ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
          <MapPinIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{event.location}</span>
        </p>
      )}
      <span className={`text-[11px] ${isSender ? 'text-white/60' : 'text-gray-400 dark:text-gray-500'}`}>
        RSVP is coming soon
      </span>
    </div>
  );
}

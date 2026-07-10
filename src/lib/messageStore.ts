// Local message cache, keyed by chat room.
//
// The WebSocket hub only delivers to a recipient who's connected at the exact
// moment a message is sent — there's no queue, so anything sent while you
// were offline would otherwise be lost. GET /api/messages/{chatRoomId} lets a
// client catch up on reconnect (see mergeMessages); this cache is what makes
// that — and a plain page reload — survive locally, the same way the E2EE
// private key itself is only ever local. Only decrypted text is cached here,
// never ciphertext.

const STORAGE_PREFIX = 'vibenet:messages:';

// Delivery lifecycle of a message we sent, WhatsApp-style:
//   sent      — left this device / reached the server (single tick)
//   delivered — the recipient is online and received it (grey double tick)
//   read      — the recipient has opened the chat (blue double tick)
// Received messages carry no status (ticks only render on our own bubbles).
export type MessageStatus = 'sent' | 'delivered' | 'read';

const STATUS_RANK: Record<MessageStatus, number> = { sent: 0, delivered: 1, read: 2 };

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  status?: MessageStatus;
}

function storageKey(chatRoomId: string): string {
  return `${STORAGE_PREFIX}${chatRoomId}`;
}

// Status only ever moves forward (sent → delivered → read); a later frame that
// carries a lower or missing status must never regress a message.
function mergeStatus(a?: MessageStatus, b?: MessageStatus): MessageStatus | undefined {
  if (!a) return b;
  if (!b) return a;
  return STATUS_RANK[b] > STATUS_RANK[a] ? b : a;
}

export function getMessages(chatRoomId: string): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(chatRoomId));
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return parsed.sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

// mergeMessages folds freshly-decrypted history (e.g. from GET /api/messages)
// into the local cache, de-duplicating by id against what's already there —
// the same message can otherwise arrive twice: once live over the WebSocket,
// once again from history on the next reconnect.
export function mergeMessages(chatRoomId: string, incoming: ChatMessage[]): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  const existing = getMessages(chatRoomId);
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const message of incoming) {
    const prev = byId.get(message.id);
    byId.set(message.id, prev ? { ...message, status: mergeStatus(prev.status, message.status) } : message);
  }
  const next = Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
  window.localStorage.setItem(storageKey(chatRoomId), JSON.stringify(next));
  return next;
}

// setMessageStatus advances a single message's delivery state in the cache
// (e.g. on a delivery ack), never regressing it. Returns the updated list.
export function setMessageStatus(
  chatRoomId: string,
  messageId: string,
  status: MessageStatus,
): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  const messages = getMessages(chatRoomId).map((m) =>
    m.id === messageId ? { ...m, status: mergeStatus(m.status, status) } : m,
  );
  window.localStorage.setItem(storageKey(chatRoomId), JSON.stringify(messages));
  return messages;
}

// markOwnMessagesRead flips every message we sent in a room to "read" (blue
// double tick) when the recipient signals they've opened the chat. Only our
// own messages are touched — identified by senderId === myUserId.
export function markOwnMessagesRead(chatRoomId: string, myUserId: string): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  const messages = getMessages(chatRoomId).map((m) =>
    m.senderId === myUserId ? { ...m, status: mergeStatus(m.status, 'read') } : m,
  );
  window.localStorage.setItem(storageKey(chatRoomId), JSON.stringify(messages));
  return messages;
}

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

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
}

function storageKey(chatRoomId: string): string {
  return `${STORAGE_PREFIX}${chatRoomId}`;
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

export function appendMessage(chatRoomId: string, message: ChatMessage): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  const next = [...getMessages(chatRoomId), message];
  window.localStorage.setItem(storageKey(chatRoomId), JSON.stringify(next));
  return next;
}

// mergeMessages folds freshly-decrypted history (e.g. from GET /api/messages)
// into the local cache, de-duplicating by id against what's already there —
// the same message can otherwise arrive twice: once live over the WebSocket,
// once again from history on the next reconnect.
export function mergeMessages(chatRoomId: string, incoming: ChatMessage[]): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  const existing = getMessages(chatRoomId);
  const byId = new Map(existing.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  const next = Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
  window.localStorage.setItem(storageKey(chatRoomId), JSON.stringify(next));
  return next;
}

// Local message cache, keyed by chat room.
//
// The backend persists encrypted messages to DynamoDB but exposes no REST
// endpoint to fetch history — delivery is WebSocket-only, and only while both
// parties are connected. Caching decrypted messages locally (never the
// ciphertext) is what lets a conversation survive a page reload on this
// device, the same way the E2EE private key itself is only ever local.

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

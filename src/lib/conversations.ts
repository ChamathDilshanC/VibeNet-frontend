// Client-side conversation registry.
//
// The backend has no "contacts" or "conversations" endpoint — a DM is just two
// user IDs. Starting a chat (see NewChatDialog) fetches the peer's public key
// once and caches everything needed to resume the conversation — including
// after a reload — as a small localStorage table, namespaced per signed-in
// account since a device may hold sessions for more than one user over time.

const STORAGE_PREFIX = 'vibenet:conversations:';

export interface Conversation {
  peerId: string;
  peerUsername: string;
  /** base64 SPKI — cached from GET /api/users/{id}/key so we don't re-fetch on every reload. */
  peerPublicKey: string;
  /** Deterministic room id both peers derive independently — see chatRoomIdFor. */
  chatRoomId: string;
  createdAt: number;
}

// chatRoomIdFor derives the same room id regardless of which side computes it,
// since there's no backend "create room" call to hand one out.
export function chatRoomIdFor(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':');
}

function storageKey(ownerId: string): string {
  return `${STORAGE_PREFIX}${ownerId}`;
}

export function listConversations(ownerId: string): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(ownerId));
    const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
    return parsed.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

// upsertConversation adds a new conversation or refreshes an existing peer's
// cached public key (keys can rotate), keyed by peerId.
export function upsertConversation(ownerId: string, conversation: Conversation): Conversation[] {
  if (typeof window === 'undefined') return [];
  const existing = listConversations(ownerId).filter((c) => c.peerId !== conversation.peerId);
  const next = [conversation, ...existing];
  window.localStorage.setItem(storageKey(ownerId), JSON.stringify(next));
  return next;
}

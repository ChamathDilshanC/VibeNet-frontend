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

// A compact snapshot of the message being replied to, embedded in the reply so
// the quoted block renders without having to look the original up (it may have
// scrolled off, been deleted, or never synced to this device). Carried inside
// the E2EE payload, so the server never sees any of it in the clear.
export interface ReplyPreview {
  /** Id of the quoted message — lets the UI scroll/highlight it if still present. */
  messageId: string;
  /** Display name to show above the quote ("You" for our own messages). */
  senderName: string;
  /** One-line, already-truncated preview of the quoted message's text. */
  textPreview: string;
}

// MessageFileMeta describes an E2EE file/image attachment. The AES key and IV
// are the raw material needed to decrypt the ciphertext stored at `key` in
// S3 — safe to carry here in the clear (as far as this interface is
// concerned) only because the whole envelope this lives inside is itself
// encrypted under the conversation/group's shared key before it ever leaves
// the device (see encodeMessageBody/encryptText). `key` is an S3 object key,
// not a URL: fetching it requires exchanging it for a fresh presigned GET via
// lib/upload.ts's requestDownloadUrl every time it's rendered.
export interface MessageFileMeta {
  key: string;
  keyB64: string;
  ivB64: string;
  name: string;
  mimeType: string;
  size: number;
}

// A shared contact's identity, sent as a 'contact' message so the recipient
// can open a chat with them directly (see ContactMessageCard). Field names
// mirror the wire-style DTOs elsewhere in this codebase (snake_case, e.g.
// RemoteMessageDTO) rather than this module's usual camelCase, since this is
// literally the payload the "type: 'contact'" message carries end-to-end.
export interface ContactPayload {
  user_id: string;
  real_name: string;
  username: string;
}

// Poll content — "Create Poll" (see CreatePollDialog) collects question +
// options for real; voting itself rides a separate 'poll_vote' message (see
// PollVotePayload/applyPollVote below) rather than an edit to this message,
// since the poll-creation envelope is immutable once sent like any other
// message. `votes`/`voteOrder` are the local mirror of every vote applied so
// far — never present in the envelope that *creates* the poll, only ever
// patched in afterwards by applyPollVote (see mergeMessages, which takes
// care to preserve them across a history re-sync of the same poll).
export interface PollPayload {
  question: string;
  options: string[];
  /** Voter user id -> chosen option index. One vote per voter; voting again
   *  changes their existing choice rather than adding a second one. */
  votes?: Record<string, number>;
  /** Voter ids in the order they (most recently) voted — a plain `votes`
   *  object doesn't reorder on re-assignment, so this is what lets the
   *  "latest voters" avatar strip reflect who voted/changed most recently. */
  voteOrder?: string[];
}

// A single vote cast on an existing poll message — sent as its own message
// (type: 'poll_vote') through the identical E2EE 'message' pipeline as
// everything else, but never rendered as a bubble: the recipient (and the
// voter's own other devices) apply it as a patch onto the referenced poll's
// `votes`/`voteOrder` instead (see DashboardShell's applyPollVote calls).
export interface PollVotePayload {
  pollMessageId: string;
  optionIndex: number;
}

// Placeholder event content — "Create Event" (see CreateEventDialog) is a
// stub for now.
export interface EventPayload {
  title: string;
  date: string;
  location?: string;
}

// "Delete for everyone" notice — sent as its own message (type:
// 'delete_notice') through the identical E2EE 'message' pipeline as
// everything else, same as PollVotePayload above. The backend has no
// `delete_message` WebSocket frame type (it was only ever handled — silently
// dropped, in fact — as a malformed chat message), so this rides the one
// frame type the backend genuinely relays/persists instead of needing a
// backend change at all. Never rendered as a bubble: the recipient (and the
// deleter's own other devices) apply it as a patch that erases the
// referenced message's content — see DashboardShell's setMessageDeleted calls.
export interface DeleteNoticePayload {
  deletedMessageId: string;
}

// Discriminates a rich-content message from a plain text one. 'audio' reuses
// `file` (the same E2EE upload path as image/document — see DashboardShell's
// handleSendFile) but tags it so bubbles render an <audio> player instead of
// a download card; 'contact'/'poll'/'event' carry their own payload instead
// of `file`. 'poll_vote'/'delete_notice' are special: neither is ever
// recorded as a visible message (see DashboardShell) — they only ever patch
// an existing message (a poll's tally, or erase a deleted message's content).
// Absent means plain text, or an image/document file (existing mimeType-based
// rendering in MessageAttachment).
export type MessageKind = 'audio' | 'contact' | 'poll' | 'event' | 'poll_vote' | 'delete_notice';

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: number;
  status?: MessageStatus;
  /** Set when this message is a reply — drives the in-bubble quoted block. */
  replyTo?: ReplyPreview;
  /** Set when this message carries an encrypted file/image attachment instead
   *  of (or alongside) plain text — see MessageAttachment.tsx. */
  file?: MessageFileMeta;
  /** See MessageKind. */
  type?: MessageKind;
  /** Set when type === 'contact'. */
  contact?: ContactPayload;
  /** Set when type === 'poll'. */
  poll?: PollPayload;
  /** Set when type === 'event'. */
  event?: EventPayload;
  /** Pinned for the whole room (see pin_message over the WebSocket). Local mirror
   *  of the shared pin state so the bubble + pinned banner render without a refetch. */
  pinned?: boolean;
  /** "Kept"/starred by this user for quick access — a purely local flag, never
   *  sent over the wire. Persisted here so it survives a reload like the message. */
  kept?: boolean;
  /** True when this message was forwarded from another conversation. Renders a
   *  "Forwarded" label at the top of the bubble, WhatsApp/Messenger-style. */
  isForwarded?: boolean;
  /** True for a group activity notice ("X made Y an admin", "X joined the
   *  group") rather than a message someone typed. Sent through the same
   *  encrypted pipeline as a normal message (so it's persisted and visible to
   *  every member) but rendered as a centered system pill instead of a bubble
   *  — see ChatView. senderId is still whoever's client generated it. */
  isSystem?: boolean;
  /** "Delete for everyone" — see setMessageDeleted. Content fields are wiped
   *  when this is set; the bubble renders a "This message was deleted"
   *  placeholder instead (see ChatView's MessageBody). Distinct from "delete
   *  for me" (deleteMessage), which removes the message from view entirely
   *  rather than leaving a placeholder in its place. */
  isDeleted?: boolean;
}

// ── Encrypted message body envelope ────────────────────────────────────────
// The plaintext we encrypt used to be the raw message string. To carry reply
// metadata end-to-end (without ever exposing it to the server) we now wrap the
// body in a small versioned JSON envelope *before* encryption, and unwrap it
// after decryption. `v` tags the format; legacy messages predate the envelope
// and decrypt to a bare string, which decodeMessageBody treats as plain text.
interface MessageEnvelope {
  v: 1;
  text: string;
  replyTo?: ReplyPreview;
  isForwarded?: boolean;
  isSystem?: boolean;
  // File attachments (see MessageFileMeta) ride inside the same encrypted
  // envelope as text: the AES file key/IV need E2EE protection exactly like
  // a message body does, and this envelope's own encryptText call under the
  // conversation/group's shared key is "the existing E2EE logic" that gives
  // them it — no separate encryption pass needed.
  file?: MessageFileMeta;
  // See MessageKind — rides in the envelope (not the WebSocket frame) for the
  // same reason `file` does: the backend is a blind router with a fixed frame
  // shape, so any per-message-kind data has to travel inside the ciphertext.
  type?: MessageKind;
  contact?: ContactPayload;
  poll?: PollPayload;
  event?: EventPayload;
  vote?: PollVotePayload;
  deleteNotice?: DeleteNoticePayload;
}

// Metadata that rides inside the encrypted envelope alongside the text. Carried
// here (not in the WebSocket frame) precisely so it reaches the recipient: the
// backend is a blind router with a fixed frame shape and would drop any extra
// top-level fields, but it never touches the ciphertext, so envelope metadata
// survives end-to-end.
export interface MessageMeta {
  replyTo?: ReplyPreview;
  isForwarded?: boolean;
  isSystem?: boolean;
  file?: MessageFileMeta;
  type?: MessageKind;
  contact?: ContactPayload;
  poll?: PollPayload;
  event?: EventPayload;
  vote?: PollVotePayload;
  deleteNotice?: DeleteNoticePayload;
}

// encodeMessageBody produces the string handed to encryptText — a JSON envelope
// so the reply context and forwarded flag travel inside the ciphertext with the
// text. Falsy metadata is omitted to keep the payload compact.
export function encodeMessageBody(text: string, meta: MessageMeta = {}): string {
  const envelope: MessageEnvelope = { v: 1, text };
  if (meta.replyTo) envelope.replyTo = meta.replyTo;
  if (meta.isForwarded) envelope.isForwarded = true;
  if (meta.isSystem) envelope.isSystem = true;
  if (meta.file) envelope.file = meta.file;
  if (meta.type) envelope.type = meta.type;
  if (meta.contact) envelope.contact = meta.contact;
  if (meta.poll) envelope.poll = meta.poll;
  if (meta.event) envelope.event = meta.event;
  if (meta.vote) envelope.vote = meta.vote;
  if (meta.deleteNotice) envelope.deleteNotice = meta.deleteNotice;
  return JSON.stringify(envelope);
}

// decodeMessageBody reverses encodeMessageBody on the decrypted string. Anything
// that isn't a v1 envelope (a pre-envelope plain-text message, or a peer on an
// older build) falls back to being treated as the whole body — so old and new
// messages both render correctly.
export function decodeMessageBody(raw: string): {
  text: string;
  replyTo?: ReplyPreview;
  isForwarded?: boolean;
  isSystem?: boolean;
  file?: MessageFileMeta;
  type?: MessageKind;
  contact?: ContactPayload;
  poll?: PollPayload;
  event?: EventPayload;
  vote?: PollVotePayload;
  deleteNotice?: DeleteNoticePayload;
} {
  try {
    const parsed = JSON.parse(raw) as Partial<MessageEnvelope>;
    if (parsed && parsed.v === 1 && typeof parsed.text === 'string') {
      return {
        text: parsed.text,
        replyTo: parsed.replyTo,
        isForwarded: parsed.isForwarded,
        isSystem: parsed.isSystem,
        file: parsed.file,
        type: parsed.type,
        contact: parsed.contact,
        poll: parsed.poll,
        event: parsed.event,
        vote: parsed.vote,
        deleteNotice: parsed.deleteNotice,
      };
    }
  } catch {
    // Not JSON — a legacy plain-text body from before the envelope existed.
  }
  return { text: raw };
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
    // Fold in the incoming copy but never lose the local-only flags: history/live
    // frames carry neither `pinned` nor `kept`, so a naive overwrite would clear a
    // message the user had just pinned or kept. Status still only moves forward.
    // A poll's `votes`/`voteOrder` are never part of the envelope that *creates*
    // it either — they're only ever patched on afterwards by applyPollVote — so
    // a poll re-synced from history needs the same treatment or every vote so
    // far would vanish the moment its creation message gets merged again.
    byId.set(
      message.id,
      prev
        ? {
            ...message,
            status: mergeStatus(prev.status, message.status),
            pinned: message.pinned ?? prev.pinned,
            kept: message.kept ?? prev.kept,
            isForwarded: message.isForwarded ?? prev.isForwarded,
            isSystem: message.isSystem ?? prev.isSystem,
            replyTo: message.replyTo ?? prev.replyTo,
            poll: message.poll
              ? {
                  ...message.poll,
                  votes: prev.poll?.votes ?? message.poll.votes,
                  voteOrder: prev.poll?.voteOrder ?? message.poll.voteOrder,
                }
              : message.poll,
            // Once "delete for everyone" has erased a message, it must stay
            // erased — a duplicate/late delivery of the original content
            // (network fluke, not the normal path) must never resurrect it.
            ...(prev.isDeleted
              ? {
                  isDeleted: true,
                  text: '',
                  file: undefined,
                  type: undefined,
                  contact: undefined,
                  poll: undefined,
                  event: undefined,
                  replyTo: undefined,
                }
              : {}),
          }
        : message,
    );
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

function writeMessages(chatRoomId: string, messages: ChatMessage[]): ChatMessage[] {
  if (typeof window === 'undefined') return messages;
  window.localStorage.setItem(storageKey(chatRoomId), JSON.stringify(messages));
  return messages;
}

// deleteMessage drops a message from the local cache entirely. Used by both
// "delete for me" (local only) and "delete for everyone" (local + a
// delete_message broadcast) — the WebSocket side is the caller's concern; this
// only touches what's stored on this device. Returns the remaining messages.
export function deleteMessage(chatRoomId: string, messageId: string): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  return writeMessages(
    chatRoomId,
    getMessages(chatRoomId).filter((m) => m.id !== messageId),
  );
}

// setMessageDeleted implements "delete for everyone": unlike deleteMessage
// (which removes the row from view entirely, only for this device), this
// keeps the message's id/senderId/timestamp/status in place — so it still
// occupies its slot in the timeline — but wipes every content field and
// flags isDeleted, so the bubble renders a "This message was deleted"
// placeholder instead (see ChatView's MessageBody). Applied both
// optimistically on the deleter's own device and on receipt of the
// corresponding 'delete_notice' message (see DashboardShell), so every
// device converges on the same erased content regardless of who deleted it.
// A no-op if the message isn't known on this device.
export function setMessageDeleted(chatRoomId: string, messageId: string): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  return writeMessages(
    chatRoomId,
    getMessages(chatRoomId).map((m) =>
      m.id === messageId
        ? { id: m.id, senderId: m.senderId, text: '', timestamp: m.timestamp, status: m.status, isDeleted: true }
        : m,
    ),
  );
}

// clearMessages wipes a room's entire local cache — "Clear chat" from the
// header menu. Local only, like "delete for me": it doesn't touch history on
// the server, so a reconnect/history sync can still repopulate anything the
// backend still has. Returns the (now empty) list for the caller to mirror.
export function clearMessages(chatRoomId: string): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  return writeMessages(chatRoomId, []);
}

// setMessagePinned toggles a message's room-wide pinned flag in the local cache.
// Pinning is shared (broadcast over the socket); this keeps the local mirror in
// step so the bubble and the pinned banner update immediately.
export function setMessagePinned(
  chatRoomId: string,
  messageId: string,
  pinned: boolean,
): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  return writeMessages(
    chatRoomId,
    getMessages(chatRoomId).map((m) => (m.id === messageId ? { ...m, pinned } : m)),
  );
}

// setMessageKept toggles this user's local "kept"/starred flag for a message.
// Purely local — never leaves the device — but persisted so it survives reloads.
export function setMessageKept(
  chatRoomId: string,
  messageId: string,
  kept: boolean,
): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  return writeMessages(
    chatRoomId,
    getMessages(chatRoomId).map((m) => (m.id === messageId ? { ...m, kept } : m)),
  );
}

// applyPollVote patches a voter's choice onto an existing poll message —
// called both optimistically (the voter's own device, the instant they tap
// an option) and on receipt of someone else's 'poll_vote' message (see
// DashboardShell), so every device converges on the same tally regardless of
// who cast the vote or in what order the frames arrive. One vote per voter:
// voting again just moves their entry to a new option instead of adding a
// second one. A no-op (returns the list unchanged) if the poll message isn't
// known on this device yet, or optionIndex is out of range.
export function applyPollVote(
  chatRoomId: string,
  pollMessageId: string,
  voterId: string,
  optionIndex: number,
): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  return writeMessages(
    chatRoomId,
    getMessages(chatRoomId).map((m) => {
      if (m.id !== pollMessageId || !m.poll) return m;
      if (optionIndex < 0 || optionIndex >= m.poll.options.length) return m;
      return {
        ...m,
        poll: {
          ...m.poll,
          votes: { ...m.poll.votes, [voterId]: optionIndex },
          voteOrder: [...(m.poll.voteOrder ?? []).filter((id) => id !== voterId), voterId],
        },
      };
    }),
  );
}

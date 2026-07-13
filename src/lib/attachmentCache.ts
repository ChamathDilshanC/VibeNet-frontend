// In-memory cache of decrypted E2EE attachment blob: URLs, keyed by the
// file's S3 object key (see MessageFileMeta.key — stable and unique per
// ciphertext regardless of which message/conversation references it).
//
// Without this, MessageAttachment redecrypts from scratch (fetch the
// ciphertext, run AES-GCM, flash "Decrypting…") on every mount — which
// happens far more often than "the first time you see this image": switching
// conversations and back remounts the whole message list, and so does any
// other reason React recreates the component tree. This cache lets a second
// mount for the same file skip straight to the already-decrypted blob: URL.
//
// Capped and LRU-evicted (revoking the evicted URL) rather than kept forever
// — attachments can be up to MAX_ATTACHMENT_BYTES (25MB) each, so an
// unbounded cache would grow for the lifetime of the session.

const MAX_ENTRIES = 40;

// Map iteration order is insertion order, which this exploits for a simple
// LRU: touching an entry deletes + re-inserts it so it's no longer the
// oldest, and eviction just drops whatever's first.
const cache = new Map<string, string>();

export function getCachedAttachmentUrl(fileKey: string): string | undefined {
  const url = cache.get(fileKey);
  if (url) {
    cache.delete(fileKey);
    cache.set(fileKey, url);
  }
  return url;
}

export function setCachedAttachmentUrl(fileKey: string, objectUrl: string): void {
  if (cache.has(fileKey)) {
    cache.delete(fileKey);
  } else if (cache.size >= MAX_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      const oldestUrl = cache.get(oldestKey);
      cache.delete(oldestKey);
      if (oldestUrl) URL.revokeObjectURL(oldestUrl);
    }
  }
  cache.set(fileKey, objectUrl);
}

// Client-side E2EE key handling.
//
// The backend's /api/auth/register requires a `public_key`: VibeNet is
// end-to-end encrypted, so the keypair is generated here in the browser and the
// private key never leaves the device. We generate an ECDH P-256 keypair (the
// same primitive used for key agreement), export the public key as base64 DER
// (SPKI) to send to the server, and keep the private key locally as JWK.
//
// Two accounts' ECDH keypairs let both sides independently derive the same
// AES-256-GCM symmetric key (see deriveSharedKey) — that key encrypts message
// bodies before they ever reach the WebSocket. The server only ever sees
// ciphertext + nonce.

const PRIVATE_KEY_STORAGE = 'vibenet:e2ee:privateKey';
const ECDH_PARAMS = { name: 'ECDH', namedCurve: 'P-256' } as const;

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface GeneratedKeys {
  /** base64-encoded SPKI public key — sent to the backend. */
  publicKey: string;
  /** the private key as JWK — persisted locally, never sent. */
  privateKeyJwk: JsonWebKey;
}

// generateKeyPair creates a fresh ECDH P-256 keypair for the account.
export async function generateKeyPair(): Promise<GeneratedKeys> {
  const pair = await crypto.subtle.generateKey(ECDH_PARAMS, true, [
    'deriveKey',
    'deriveBits',
  ]);

  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);

  return { publicKey: bufferToBase64(spki), privateKeyJwk };
}

// storePrivateKey persists the private key locally, namespaced by username so a
// device can hold keys for more than one account.
export function storePrivateKey(username: string, jwk: JsonWebKey): void {
  if (typeof window === 'undefined') return;
  const store = readStore();
  store[username] = jwk;
  window.localStorage.setItem(PRIVATE_KEY_STORAGE, JSON.stringify(store));
}

// getPrivateKeyJwk returns the locally stored private key for an account, or
// null if this device has never generated (or has lost) one.
export function getPrivateKeyJwk(username: string): JsonWebKey | null {
  return readStore()[username] ?? null;
}

function readStore(): Record<string, JsonWebKey> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(PRIVATE_KEY_STORAGE) ?? '{}');
  } catch {
    return {};
  }
}

// importPrivateKey turns a stored JWK back into a usable CryptoKey.
export function importPrivateKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, ECDH_PARAMS, false, ['deriveKey']);
}

// importPublicKey turns a peer's base64 SPKI public key (as returned by
// GET /api/users/{id}/key) into a usable CryptoKey.
export function importPublicKey(base64Spki: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', base64ToBuffer(base64Spki), ECDH_PARAMS, true, []);
}

// publicKeyB64FromPrivateJwk reconstructs the base64 SPKI public key that
// corresponds to a stored private JWK. We only persist the private key
// locally, but an EC private JWK already carries the public coordinates
// (x, y) — dropping the private scalar (d) leaves exactly the public key.
// This lets us re-publish the public half that matches whatever private key
// this device currently holds, keeping the server's copy in lockstep: if the
// two ever diverge, every message a peer encrypts to us becomes undecryptable.
export async function publicKeyB64FromPrivateJwk(jwk: JsonWebKey): Promise<string> {
  const publicJwk: JsonWebKey = {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    ext: true,
    key_ops: [],
  };
  const publicKey = await crypto.subtle.importKey('jwk', publicJwk, ECDH_PARAMS, true, []);
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return bufferToBase64(spki);
}

// deriveSharedKey computes the AES-256-GCM key both ends of a conversation
// arrive at independently via ECDH — my private key + their public key gives
// the same result as their private key + my public key.
export function deriveSharedKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
}

// encryptText encrypts a plaintext message body under the conversation's
// shared key. A fresh random nonce is generated per message — AES-GCM nonces
// must never repeat under the same key.
export async function encryptText(
  sharedKey: CryptoKey,
  plaintext: string,
): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    sharedKey,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: bufferToBase64(ciphertext), nonce: bufferToBase64(iv.buffer) };
}

// decryptText reverses encryptText. Throws if the ciphertext/nonce/key don't
// match (tampered payload or wrong shared key).
//
// ciphertextB64/nonceB64 arrive as base64 over the wire and are decoded to
// ArrayBuffers *before* crypto.subtle.decrypt ever sees them — passing a raw
// string here would throw a TypeError at the WebCrypto API boundary, not the
// OperationError this throws on a bad tag/key, so the two failure modes are
// easy to tell apart from the error name alone.
export async function decryptText(
  sharedKey: CryptoKey,
  ciphertextB64: string,
  nonceB64: string,
): Promise<string> {
  const ivBuffer = base64ToBuffer(nonceB64);
  const ciphertextBuffer = base64ToBuffer(ciphertextB64);

  console.log('[vibenet:e2ee] decryptText inputs', {
    keyAlgorithm: sharedKey.algorithm,
    keyUsages: sharedKey.usages,
    keyExtractable: sharedKey.extractable,
    ivByteLength: ivBuffer.byteLength,
    ciphertextByteLength: ciphertextBuffer.byteLength,
  });

  if (ivBuffer.byteLength !== 12) {
    console.error(
      '[vibenet:e2ee] nonce is',
      ivBuffer.byteLength,
      'bytes — AES-GCM requires exactly 12. This frame is malformed, not a key problem.',
    );
  }
  if (ciphertextBuffer.byteLength < 16) {
    console.error(
      '[vibenet:e2ee] ciphertext is only',
      ciphertextBuffer.byteLength,
      'bytes — shorter than the 16-byte GCM auth tag, so it is truncated/corrupt, not a key problem.',
    );
  }

  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      sharedKey,
      ciphertextBuffer,
    );
    return new TextDecoder().decode(plainBuf);
  } catch (err) {
    // Buffer lengths above were sane, so an OperationError here means the GCM
    // auth tag didn't verify under this key — i.e. the wrong shared key was
    // derived (most commonly: the peer's cached public key is stale because
    // they rotated/regenerated their keypair since we last fetched it). It is
    // not a base64/buffer formatting bug.
    console.error('[vibenet:e2ee] crypto.subtle.decrypt failed — wrong shared key, not malformed input', err);
    throw err;
  }
}

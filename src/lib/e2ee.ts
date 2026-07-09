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
export async function decryptText(
  sharedKey: CryptoKey,
  ciphertextB64: string,
  nonceB64: string,
): Promise<string> {
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuffer(nonceB64) },
    sharedKey,
    base64ToBuffer(ciphertextB64),
  );
  return new TextDecoder().decode(plainBuf);
}

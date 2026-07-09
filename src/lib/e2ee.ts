// Client-side E2EE key handling.
//
// The backend's /api/auth/register requires a `public_key`: VibeNet is
// end-to-end encrypted, so the keypair is generated here in the browser and the
// private key never leaves the device. We generate an ECDH P-256 keypair (the
// same primitive used for key agreement), export the public key as base64 DER
// (SPKI) to send to the server, and keep the private key locally as JWK.

const PRIVATE_KEY_STORAGE = 'vibenet:e2ee:privateKey';

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export interface GeneratedKeys {
  /** base64-encoded SPKI public key — sent to the backend. */
  publicKey: string;
  /** the private key as JWK — persisted locally, never sent. */
  privateKeyJwk: JsonWebKey;
}

// generateKeyPair creates a fresh ECDH P-256 keypair for the account.
export async function generateKeyPair(): Promise<GeneratedKeys> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits'],
  );

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

function readStore(): Record<string, JsonWebKey> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(PRIVATE_KEY_STORAGE) ?? '{}');
  } catch {
    return {};
  }
}

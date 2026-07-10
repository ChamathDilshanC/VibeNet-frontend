// Ensures the signed-in account has a usable E2EE keypair on this device.
//
// Password accounts always have one — register generates it before the
// account even exists. Google OAuth accounts don't (the backend comment on
// models.User spells this out: they "initially omit a public key until the
// client generates E2EE keys"), and any account can lose its local private
// key if browser storage is cleared. Either way, this hook makes the
// dashboard self-healing: generate a fresh keypair, store the private half
// locally, and PUT the public half so other users can discover it.
//
// Losing the old private key means old ciphertext becomes permanently
// unreadable on this device — that's inherent to E2EE key loss, not a bug.

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/apiClient';
import {
  generateKeyPair,
  getPrivateKeyJwk,
  importPrivateKey,
  publicKeyB64FromPrivateJwk,
  storePrivateKey,
} from '@/lib/e2ee';
import type { AuthUser } from '@/lib/api';

type KeyState =
  | { status: 'pending' }
  | { status: 'ready'; privateKey: CryptoKey }
  | { status: 'error'; message: string };

export function useE2EEKeys(user: AuthUser | null) {
  const [state, setState] = useState<KeyState>({ status: 'pending' });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        let jwk = getPrivateKeyJwk(user.username);
        if (!jwk) {
          const keys = await generateKeyPair();
          storePrivateKey(user.username, keys.privateKeyJwk);
          await apiClient.put('/api/user/public-key', { public_key: keys.publicKey });
          jwk = keys.privateKeyJwk;
        } else {
          // A local private key already exists — but the server's copy of our
          // *public* key can still be stale: the very first upload may have
          // failed after the private key was already stored (we'd then skip
          // this whole block forever), or another device overwrote it. If the
          // server advertises a public key that doesn't match this private
          // key, every message peers encrypt to us is undecryptable. Re-derive
          // and re-publish the matching public key to keep the two in lockstep.
          // Best-effort: a transient failure here must not block the dashboard,
          // and it self-heals on the next load.
          try {
            const publicKey = await publicKeyB64FromPrivateJwk(jwk);
            await apiClient.put('/api/user/public-key', { public_key: publicKey });
            console.log('[vibenet:e2ee] re-published public key matching the local private key');
          } catch (err) {
            console.warn('[vibenet:e2ee] could not re-publish public key (will retry next load)', err);
          }
        }
        const privateKey = await importPrivateKey(jwk);
        if (!cancelled) setState({ status: 'ready', privateKey });
      } catch {
        if (!cancelled) {
          setState({
            status: 'error',
            message: 'Could not set up encryption keys for this device.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return state;
}

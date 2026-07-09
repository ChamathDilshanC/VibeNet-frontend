// Client-side auth guard for pages that require a signed-in session.
//
// Reads the session saved at login/OAuth time (see lib/session.ts) — the
// user record there already came from the backend's auth response or was
// decoded from the issued JWT, so this avoids a redundant round trip.
// The backend doesn't expose a live `/api/user/me` endpoint yet; once it
// does, this is the place to refresh `user` from `apiClient.get(...)`.
//
// Redirects to /login when no token is present. `ready` stays false until
// the guard has resolved, so callers can avoid flashing protected content.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { gooeyToast } from 'goey-toast';
import { getToken, getUser, clearSession } from '@/lib/session';
import type { AuthUser } from '@/lib/api';

type AuthState =
  | { ready: false; user: null }
  | { ready: true; user: AuthUser | null };

const PENDING: AuthState = { ready: false, user: null };

export function useAuth() {
  const router = useRouter();
  const [state, setState] = useState<AuthState>(PENDING);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setState({ ready: true, user: getUser() });
  }, [router]);

  function logout() {
    clearSession();
    gooeyToast('Signed out.', { description: 'Your session on this device was cleared.' });
    router.replace('/');
  }

  return { ...state, logout };
}

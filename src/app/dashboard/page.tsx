// VibeNet — Dashboard (route: "/dashboard").
//
// The post-auth landing spot. It's a client-guarded page: without a stored JWT
// it redirects to /login. For now it's an intentionally minimal shell (header +
// welcome + empty state) that later becomes the chat workspace.

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { getToken, getUser, clearSession } from '@/lib/session';
import type { AuthUser } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  // Guard: no token → back to login. Runs client-side since the session lives
  // in localStorage.
  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setUser(getUser());
    setReady(true);
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  // Avoid a flash of protected content before the guard resolves.
  if (!ready) return null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-16 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <img
          src="/logo/vibenet-logo.png"
          alt="VibeNet"
          width={1787}
          height={521}
          className="h-auto w-28"
        />
        <div className="flex items-center gap-4">
          {user && (
            <Text type="supporting" color="secondary">
              Signed in as{' '}
              <span className="vibe-gradient-text font-semibold">{user.username}</span>
            </Text>
          )}
          <div className="vibe-cta">
            <Button label="Log out" variant="secondary" size="md" onClick={handleLogout} />
          </div>
        </div>
      </header>

      <section className="mt-14 flex flex-col gap-2">
        <Heading level={1} type="display-3">
          Welcome{user ? `, ${user.username}` : ''}
        </Heading>
        <Text type="body" color="secondary">
          Your end-to-end encrypted workspace is ready. This is where your
          conversations will live.
        </Text>
      </section>

      <div className="vibe-empty mt-10">
        <Text type="large" weight="bold">
          No conversations yet
        </Text>
        <Text type="supporting" color="secondary">
          Start a new chat to send your first encrypted message.
        </Text>
      </div>
    </main>
  );
}

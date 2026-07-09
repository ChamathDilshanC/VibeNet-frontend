// VibeNet — Dashboard app shell: fixed sidebar + main content area.
//
// Thin composition layer over Astryx's AppShell — Sidebar owns the nav/DM
// list/account utilities, EmptyState owns the "no conversation" card. The
// welcome heading lives here since it's specific to this page.

'use client';

import { AppShell } from '@astryxdesign/core/AppShell';
import { Heading } from '@astryxdesign/core/Heading';
import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { AuthUser } from '@/lib/api';
import { EmptyState } from './EmptyState';
import { Sidebar } from './Sidebar';

export function DashboardShell({
  user,
  onLogout,
}: {
  user: AuthUser | null;
  onLogout: () => void;
}) {
  return (
    <AppShell
      contentPadding={0}
      height="fill"
      sideNav={<Sidebar user={user} onLogout={onLogout} />}>
      <Layout
        height="fill"
        contentWidth={768}
        content={
          <LayoutContent padding={6}>
            <VStack gap={2}>
              <Heading level={1} type="display-3">
                Welcome{user ? `, ${user.username}` : ''}
              </Heading>
              <Text type="body" color="secondary">
                Your end-to-end encrypted workspace is ready. Pick a
                conversation from the sidebar or start a new chat.
              </Text>
              <EmptyState />
            </VStack>
          </LayoutContent>
        }
      />
    </AppShell>
  );
}

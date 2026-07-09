// VibeNet — Dashboard (route: "/dashboard").
//
// The post-auth landing spot. useAuth() guards the page (redirects to /login
// without a stored JWT) and supplies the signed-in user + logout action. The
// UI itself is the DashboardShell app shell — side nav (brand, chat
// navigation, DM list, account actions) plus the chat workspace pane.

'use client';

import { DashboardShell } from '@/components/DashboardShell';
import { useAuth } from '@/hooks/useAuth';

export default function DashboardPage() {
  const { user, ready, logout } = useAuth();

  // Avoid a flash of protected content before the guard resolves.
  if (!ready) return null;

  return <DashboardShell user={user} onLogout={logout} />;
}

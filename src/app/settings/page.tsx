// VibeNet — Settings (route: "/settings").
//
// Guarded by useAuth like /dashboard. The tab strip is the home for account
// configuration; Profile is the first tab and owns everything tied to how the
// account presents itself: the avatar and the username (which doubles as the
// display name everywhere in the client).

'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import { gooeyToast } from 'goey-toast';
import { ApiError, type AuthUser } from '@/lib/api';
import { updateProfile } from '@/lib/user';
import { useAuth } from '@/hooks/useAuth';

// Mirrors validateUsername in the backend's internal/api/handler.go, so the
// obvious mistakes are caught inline instead of via a 400. Mixed case is
// allowed; the backend enforces uniqueness case-insensitively, so "taken" is
// still reported from the server (a 409) rather than guessed at here.
const USERNAME_PATTERN = /^[A-Za-z0-9._]+$/;
const USERNAME_MIN = 3;
const USERNAME_MAX = 48;
// Mirrors validateDisplayName in the backend — a free-form human name, only
// bounded by the column width. Empty is allowed and defaults to the username.
const DISPLAY_NAME_MAX = 64;

function usernameError(username: string): string | null {
  if (username.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (username.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`;
  if (!USERNAME_PATTERN.test(username)) {
    return 'Letters, numbers, dots, and underscores only.';
  }
  return null;
}

function displayNameError(displayName: string): string | null {
  if (displayName.length > DISPLAY_NAME_MAX) return `At most ${DISPLAY_NAME_MAX} characters.`;
  return null;
}

function ProfilePanel({
  user,
  onUpdated,
}: {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
}) {
  // Existing accounts created before display_name existed may arrive without one;
  // seed the field from the username so it's never blank in the editor.
  const currentDisplayName = user.display_name || user.username;
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(currentDisplayName);
  const [saving, setSaving] = useState(false);

  const trimmedUsername = username.trim();
  const trimmedDisplayName = displayName.trim();
  const isGoogleAccount = Boolean(user.avatar_url);

  // Only nag once they've actually changed a field to something invalid.
  const usernameErr = trimmedUsername === user.username ? null : usernameError(trimmedUsername);
  const displayNameErr = displayNameError(trimmedDisplayName);
  const usernameChanged = trimmedUsername !== user.username;
  const displayNameChanged = trimmedDisplayName !== currentDisplayName;
  const canSave =
    (usernameChanged || displayNameChanged) && usernameErr === null && displayNameErr === null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;

    setSaving(true);
    try {
      // A blank real name defaults to the username (matches the backend).
      const updated = await updateProfile(trimmedUsername, trimmedDisplayName || trimmedUsername);
      onUpdated(updated);
      gooeyToast.success('Profile updated.');
    } catch (err) {
      gooeyToast.error(
        err instanceof ApiError ? err.message : 'Could not update your profile.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <VStack gap={6}>
      <VStack gap={3}>
        <Heading level={2}>
          Profile picture
        </Heading>
        <div className="flex items-center gap-4">
          <Avatar
            src={user.avatar_url}
            name={currentDisplayName}
            size="large"
            alt={currentDisplayName}
          />
          <Text type="supporting" color="secondary">
            {isGoogleAccount
              ? 'Synced from your Google account. Change it in Google and sign in again to update it here.'
              : 'Password accounts show initials. Sign in with Google to use your Google photo.'}
          </Text>
        </div>
      </VStack>

      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <VStack gap={3}>
          <Heading level={2}>
            Name &amp; username
          </Heading>
          <TextInput
            type="text"
            label="Real name"
            description="Your display name — this is what people see across VibeNet."
            value={displayName}
            onChange={setDisplayName}
            htmlName="display_name"
            size="lg"
            status={
              displayNameErr ? ({ type: 'error', message: displayNameErr } as const) : undefined
            }
          />
          <TextInput
            type="text"
            label="Username"
            description="Your unique handle — how people find you in search."
            value={username}
            onChange={setUsername}
            htmlName="username"
            size="lg"
            isRequired
            status={
              usernameErr ? ({ type: 'error', message: usernameErr } as const) : undefined
            }
          />
        </VStack>

        {user.email && (
          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              Email
            </Text>
            <Text type="body">{user.email}</Text>
          </VStack>
        )}

        <div>
          <Button
            label={saving ? 'Saving…' : 'Save changes'}
            type="submit"
            variant="primary"
            size="lg"
            isLoading={saving}
            isDisabled={!canSave}
          />
        </div>
      </form>
    </VStack>
  );
}

export default function SettingsPage() {
  const { user, ready, updateUser } = useAuth();
  const [tab, setTab] = useState('profile');

  // Avoid a flash of protected content before the guard resolves.
  if (!ready) return null;

  return (
    <Layout
      contentWidth={768}
      content={
        <LayoutContent padding={6}>
          <VStack gap={6}>
            <VStack gap={2}>
              <Link href="/dashboard" className="vibe-link">
                ← Back to dashboard
              </Link>
              <Heading level={1} type="display-3">
                Settings
              </Heading>
            </VStack>

            <TabList value={tab} onChange={setTab} hasDivider>
              <Tab value="profile" label="Profile" icon={<UserCircleIcon />} />
            </TabList>

            {/* Keyed on username + real name so the form reseeds after a save, or
                after useAuth's background refresh reports a change from elsewhere,
                instead of holding a stale value in local state. */}
            {user && tab === 'profile' && (
              <ProfilePanel
                key={`${user.username}:${user.display_name}`}
                user={user}
                onUpdated={updateUser}
              />
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}

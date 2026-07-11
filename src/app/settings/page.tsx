// VibeNet — Settings (route: "/settings").
//
// Guarded by useAuth like /dashboard. The tab strip is the home for account
// configuration; Profile is the first tab and owns everything tied to how the
// account presents itself: the avatar, the real name / username, and the
// (read-only) email + phone captured at sign-up.
//
// The panel is laid out as frosted-glass cards on top of the app's ambient brand
// glow. The avatar sits in its own card with a hover-to-change uploader; saving
// uploads a newly-picked image first, then persists the name/username edits.

'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { CameraIcon } from '@heroicons/react/24/solid';
import { UserCircleIcon } from '@heroicons/react/24/outline';
import { gooeyToast } from 'goey-toast';
import { ApiError, type AuthUser } from '@/lib/api';
import { updateProfile, uploadAvatar } from '@/lib/user';
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
// Mirrors maxAvatarBytes on the backend (5 MiB) so we reject an oversized file
// before spending a round trip on it.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

// Shared frosted-glass surface — subtle border, translucent fill, and blur so the
// ambient brand glow shows through. Applied to each settings card.
const GLASS_CARD =
  'rounded-2xl border border-white/50 bg-white/70 shadow-xl shadow-slate-900/5 ' +
  'backdrop-blur-md transition-all duration-300';

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

// AvatarUploader renders the large circular avatar with a hover/focus overlay that
// reveals a camera icon, and a hidden file input behind it. Picking a file hands it
// back to the parent (which shows an immediate local preview and defers the upload
// until Save). The whole control is a <label> so clicking or keyboard-activating it
// opens the native file picker.
function AvatarUploader({
  src,
  name,
  onSelect,
  disabled,
}: {
  src?: string;
  name: string;
  onSelect: (file: File) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <label
      className={
        'group relative inline-flex cursor-pointer rounded-full outline-none ' +
        'ring-offset-2 ring-offset-white/60 focus-within:ring-2 focus-within:ring-[color:var(--vibe-blue)] ' +
        (disabled ? 'pointer-events-none opacity-70' : '')
      }
      aria-label="Change profile picture"
    >
      {/* Gradient halo behind the avatar for a bit of polish. */}
      <span
        aria-hidden
        className="absolute -inset-1 rounded-full opacity-70 blur-md transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'var(--vibe-gradient)' }}
      />
      <span className="relative rounded-full ring-4 ring-white/80">
        <Avatar src={src} name={name} size={128} alt={name} />
        {/* Dark overlay + camera icon, revealed on hover or keyboard focus. */}
        <span
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
          aria-hidden
        >
          <CameraIcon className="h-7 w-7" />
          <span className="text-xs font-medium">Change</span>
        </span>
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so re-picking the same file still fires onChange.
          e.target.value = '';
          if (file) onSelect(file);
        }}
      />
    </label>
  );
}

// ReadOnlyField shows a sign-up-time value (email / phone) that isn't editable
// here, styled to match the editable TextInputs so the grid stays visually even.
function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <TextInput
      type="text"
      label={label}
      value={value ?? ''}
      onChange={() => {}}
      placeholder="Not set"
      size="lg"
      isDisabled
      disabledMessage="Set when you registered and can't be changed here."
    />
  );
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

  // A locally-picked avatar plus its object-URL preview, shown immediately and
  // only uploaded on Save. previewUrl is revoked when it changes or on unmount.
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const trimmedUsername = username.trim();
  const trimmedDisplayName = displayName.trim();

  // Only nag once they've actually changed a field to something invalid.
  const usernameErr = trimmedUsername === user.username ? null : usernameError(trimmedUsername);
  const displayNameErr = displayNameError(trimmedDisplayName);
  const usernameChanged = trimmedUsername !== user.username;
  const displayNameChanged = trimmedDisplayName !== currentDisplayName;
  const avatarChanged = avatarFile !== null;
  const textValid = usernameErr === null && displayNameErr === null;
  const canSave = (usernameChanged || displayNameChanged || avatarChanged) && textValid;

  function handleSelectAvatar(file: File) {
    if (!file.type.startsWith('image/')) {
      gooeyToast.warning('Please choose an image file.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      gooeyToast.warning('That image is over 5 MB — please pick a smaller one.');
      return;
    }
    setAvatarFile(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;

    setSaving(true);
    try {
      let updated: AuthUser = user;
      // 1. Upload the picture first (if changed) so the profile write below reads
      //    back the fresh avatar_url too.
      if (avatarFile) {
        updated = await uploadAvatar(avatarFile);
      }
      // 2. Persist name/username edits. A blank real name defaults to the username
      //    (matches the backend). Returns the full profile, including the new avatar.
      if (usernameChanged || displayNameChanged) {
        updated = await updateProfile(trimmedUsername, trimmedDisplayName || trimmedUsername);
      }
      onUpdated(updated);
      // Clear the pending picture now it's saved; the avatar renders from the
      // updated user prop from here on.
      setAvatarFile(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
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
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      {/* Avatar card */}
      <div className={`${GLASS_CARD} flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left sm:p-8`}>
        <AvatarUploader
          src={previewUrl ?? user.avatar_url}
          name={currentDisplayName}
          onSelect={handleSelectAvatar}
          disabled={saving}
        />
        <VStack gap={1}>
          <Heading level={2}>Profile picture</Heading>
          <Text type="supporting" color="secondary">
            Click your avatar to upload a new photo. A square image of at least
            200×200 looks best. PNG, JPG, WebP, or GIF up to 5&nbsp;MB.
          </Text>
          {avatarChanged && (
            <Text type="supporting" color="secondary">
              New photo ready — click <strong>Save changes</strong> to apply it.
            </Text>
          )}
        </VStack>
      </div>

      {/* Details card */}
      <div className={`${GLASS_CARD} p-6 sm:p-8`}>
        <VStack gap={5}>
          <Heading level={2}>Account details</Heading>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextInput
              type="text"
              label="Real name"
              description="What people see across VibeNet."
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
              description="Your unique handle in search."
              value={username}
              onChange={setUsername}
              htmlName="username"
              size="lg"
              isRequired
              status={usernameErr ? ({ type: 'error', message: usernameErr } as const) : undefined}
            />
            <ReadOnlyField label="Email" value={user.email} />
            <ReadOnlyField label="Phone number" value={user.phone_number} />
          </div>

          <div className="flex justify-end pt-1">
            <Button
              label={saving ? 'Saving…' : 'Save changes'}
              type="submit"
              variant="primary"
              size="lg"
              isLoading={saving}
              isDisabled={!canSave}
            />
          </div>
        </VStack>
      </div>
    </form>
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
                instead of holding a stale value in local state. An avatar-only save
                keeps the key stable; ProfilePanel clears its own preview state. */}
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

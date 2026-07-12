// VibeNet — Settings panel.
//
// Rendered inside the dashboard's main content area (see DashboardShell), Discord /
// Telegram style, rather than on a route of its own: clicking "Settings" in the app
// sidebar swaps this in beside it, so the chat shell — socket, conversation registry,
// derived E2EE keys — is never torn down.
//
// Internally it's the Astryx settings-sidebar layout: its own left nav selects one of
// three sections — My Profile, Privacy & Security, Appearance — rendered in the pane
// to its right. That makes two nested rails on desktop (app nav, then settings nav),
// which is exactly the Discord arrangement. On narrow viewports the inner rail
// collapses to a master→detail drill-down with a back button.
//
// The section is controlled by the parent so the sidebar's "Chat PIN" shortcut can
// open straight onto Privacy & Security.
//
// Section panels are frosted-glass cards floating on the app's ambient brand glow.
// Every surface reads its colors from the tokens in globals.css, so the whole panel
// repaints when the Appearance tab switches scheme (see .vibe-settings there).

'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { useMediaQuery } from '@astryxdesign/core/hooks';
import { VStack } from '@astryxdesign/core/Layout';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import {
  ArrowLeft,
  AtSign,
  Camera,
  Check,
  ChevronRight,
  Cloud,
  LogOut,
  Mail,
  Moon,
  Palette,
  Phone,
  ShieldCheck,
  Star,
  Sun,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { gooeyToast } from 'goey-toast';
import { ApiError, resolveAvatarUrl, type AuthUser } from '@/lib/api';
import { fetchMyPin, updateProfile, updatePinSettings, uploadAvatar, type PinStatus } from '@/lib/user';
import { PinInput } from '@/components/PinInput';

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

// The three sections, in nav order.
const NAV_ITEMS = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'security', label: 'Privacy & Security', icon: ShieldCheck },
  { id: 'appearance', label: 'Appearance', icon: Palette },
] as const;

/** Which settings section is showing. The dashboard owns this so its sidebar can
 *  deep-link — "Chat PIN" opens straight onto Privacy & Security. */
export type SettingsSection = (typeof NAV_ITEMS)[number]['id'];

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

// SettingsCard is the frosted-glass surface every section is built from: translucent
// fill, hairline border, and a blur that lets the ambient brand glow through. Crisp
// white in light mode (not the old off-white wash), deep slate in dark.
const GLASS =
  'rounded-2xl border backdrop-blur-xl transition-colors duration-300 ease-in-out ' +
  'border-gray-200 bg-white/80 shadow-xl shadow-gray-900/5 ' +
  'dark:border-gray-800 dark:bg-gray-900/60 dark:shadow-black/30';

// The settings nav rail — frosted glass that follows the theme: near-white over the
// light canvas, deep slate in dark. (It used to be dark in both, which only worked
// while the surrounding app was permanently light.)
const RAIL =
  'border backdrop-blur-xl transition-colors duration-300 ease-in-out ' +
  'border-gray-200 bg-gray-50/80 shadow-xl shadow-gray-900/5 ' +
  'dark:border-gray-800 dark:bg-gray-900/60 dark:shadow-black/30';

function SettingsCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`${GLASS} p-6 sm:p-8 ${className}`}>{children}</div>;
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
        'ring-offset-2 ring-offset-transparent focus-within:ring-2 focus-within:ring-[color:var(--vibe-blue)] ' +
        (disabled ? 'pointer-events-none opacity-70' : '')
      }
      aria-label="Change profile picture"
    >
      {/* Gradient halo behind the avatar, intensified on hover. */}
      <span
        aria-hidden
        className="absolute -inset-1 rounded-full opacity-70 blur-md transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: 'var(--vibe-gradient)' }}
      />
      <span className="relative rounded-full ring-4 ring-white transition-colors duration-300 dark:ring-gray-900">
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

// ProfilePanel — the avatar (centered, hover-to-change) above the account fields.
// Saving uploads a newly-picked image first, then persists the name/username edits.
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
      {/* Identity card — avatar centered above the name it belongs to. */}
      <SettingsCard className="text-center">
        <VStack gap={4} hAlign="center">
          <AvatarUploader
            src={previewUrl ?? resolveAvatarUrl(user.avatar_url)}
            name={currentDisplayName}
            onSelect={handleSelectAvatar}
            disabled={saving}
          />
          <VStack gap={1} hAlign="center">
            <Heading level={2}>{currentDisplayName}</Heading>
            <Text type="supporting" color="secondary">
              @{user.username}
            </Text>
            <Text type="supporting" color="secondary">
              {avatarChanged
                ? 'New photo ready — click Save changes to apply it.'
                : 'Click your avatar to upload a new photo. PNG, JPG, WebP, or GIF up to 5 MB.'}
            </Text>
          </VStack>
        </VStack>
      </SettingsCard>

      {/* Account details card. */}
      <SettingsCard>
        <VStack gap={5}>
          <VStack gap={1}>
            <Heading level={2}>Account details</Heading>
            <Text type="supporting" color="secondary">
              How your account presents itself across VibeNet.
            </Text>
          </VStack>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <TextInput
              type="text"
              label="Real Name (Display Name)"
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
            <ReadOnlyField label="Phone Number" value={user.phone_number} />
          </div>

          <div className="flex justify-end pt-1">
            <div className="vibe-cta">
              <Button
                label={saving ? 'Saving…' : 'Save Changes'}
                type="submit"
                variant="primary"
                size="lg"
                isLoading={saving}
                isDisabled={!canSave}
              />
            </div>
          </div>
        </VStack>
      </SettingsCard>
    </form>
  );
}

// mmss formats a whole number of seconds as "M:SS" for the rotating-PIN countdown.
function mmss(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

// SecurityPanel configures the anti-spam chat PIN: a master toggle, a rotating vs.
// static choice, and — for static — a 6-digit custom PIN. It also shows the code the
// owner should share right now (with a live countdown for the rotating code).
function SecurityPanel({
  user,
  onUpdated,
}: {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
}) {
  const wasEnabled = user.chat_pin_enabled ?? true;
  const wasType = user.chat_pin_type ?? 'rotating';

  const [enabled, setEnabled] = useState(wasEnabled);
  const [type, setType] = useState<'rotating' | 'static'>(wasType);
  const [customPin, setCustomPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<PinStatus | null>(null);
  // Wall clock, advanced once a second while a rotating code is on screen. The
  // countdown is derived from it during render rather than stored, so there's no
  // second copy of the same truth to drift.
  const [now, setNow] = useState(() => Date.now());

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await fetchMyPin());
    } catch {
      // Non-fatal: the settings still work without the live code preview.
    }
  }, []);

  // loadStatus only reaches setStatus after awaiting the network, so it can't cascade
  // renders the way the set-state-in-effect rule guards against — the rule just can't
  // see through the async boundary. Same reasoning for the refetch effect below.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState is post-await
    void loadStatus();
  }, [loadStatus]);

  const expiry = status?.expires_at ? new Date(status.expires_at).getTime() : 0;
  const remaining = expiry ? Math.max(0, Math.round((expiry - now) / 1000)) : 0;

  // Tick only while a rotating code with an expiry is on screen.
  useEffect(() => {
    if (!expiry) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiry]);

  // Once the code lapses, pull the fresh one.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState is post-await
    if (expiry && remaining <= 0) void loadStatus();
  }, [expiry, remaining, loadStatus]);

  // Switching *into* static requires a fresh 6-digit PIN; staying on static lets you
  // keep the existing one (leave the field blank) or replace it (enter a new one).
  const wasStatic = wasType === 'static';
  const settingsChanged = enabled !== wasEnabled || type !== wasType;
  const customPinValid = customPin.length === 6;
  let canSave = false;
  if (!enabled) canSave = settingsChanged;
  else if (type === 'rotating') canSave = settingsChanged;
  else canSave = wasStatic ? settingsChanged || customPinValid : customPinValid;

  async function handleSave() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const next = await updatePinSettings({
        enabled,
        type,
        customPin: type === 'static' && customPinValid ? customPin : undefined,
      });
      setStatus(next);
      setCustomPin('');
      onUpdated({ ...user, chat_pin_enabled: next.enabled, chat_pin_type: next.type });
      gooeyToast.success('Security settings saved.');
    } catch (err) {
      gooeyToast.error(err instanceof ApiError ? err.message : 'Could not save your PIN settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <VStack gap={6}>
      {/* Master toggle card. */}
      <SettingsCard>
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color:var(--vibe-blue)]/10 text-[color:var(--vibe-blue)]">
            <ShieldCheckIcon className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <Switch
              label="Enable Chat PIN Verification"
              description="Strangers must enter your current PIN before they can message you — your defence against spam."
              value={enabled}
              onChange={setEnabled}
            />
          </div>
        </div>
      </SettingsCard>

      {/* Configuration card — only meaningful while enabled. */}
      {enabled && (
        <SettingsCard>
          <VStack gap={5}>
            <VStack gap={1}>
              <Heading level={2}>PIN mode</Heading>
              <Text type="supporting" color="secondary">
                Choose how your PIN is generated.
              </Text>
            </VStack>

            <SegmentedControl
              value={type}
              onChange={(v) => setType(v as 'rotating' | 'static')}
              label="PIN mode"
            >
              <SegmentedControlItem value="rotating" label="5-Minute Rotating PIN" />
              <SegmentedControlItem value="static" label="Custom Static PIN" />
            </SegmentedControl>

            {type === 'rotating' ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-center transition-colors duration-300 ease-in-out dark:border-gray-800 dark:bg-gray-950/50">
                <Text type="supporting" color="secondary">
                  Your current code — it changes every 5 minutes.
                </Text>
                <div className="mt-2 font-mono text-3xl font-semibold tracking-[0.3em] text-gray-900 dark:text-white">
                  {status?.pin ?? '••••••'}
                </div>
                {remaining > 0 && (
                  <Text type="supporting" color="secondary">
                    Refreshes in {mmss(remaining)}
                  </Text>
                )}
              </div>
            ) : (
              <VStack gap={3}>
                <Text type="supporting" color="secondary">
                  {wasStatic
                    ? 'Enter a new 6-digit PIN to change it, or leave blank to keep your current one.'
                    : 'Set a 6-digit PIN you can share with people you want to reach you.'}
                </Text>
                <PinInput
                  value={customPin}
                  onChange={setCustomPin}
                  masked
                  length={6}
                  ariaLabel="Custom PIN"
                />
              </VStack>
            )}
          </VStack>
        </SettingsCard>
      )}

      <div className="flex justify-end">
        <div className="vibe-cta">
          <Button
            label={saving ? 'Saving…' : 'Save Security Settings'}
            variant="primary"
            size="lg"
            isLoading={saving}
            isDisabled={!canSave}
            onClick={() => void handleSave()}
          />
        </div>
      </div>
    </VStack>
  );
}

// ThemeCard — one of the two illustrated scheme choices. The artwork is built from
// absolutely-positioned lucide glyphs over a gradient rather than an image, so it
// scales cleanly and costs no network round-trip. Motion is kept to a lift on hover
// and a spring on the check; the illustration itself doesn't animate, which would
// pull attention away from the form beside it.
//
// `isActive` is the *committed* choice; `isResolved` marks the card the OS is
// currently resolving to while "Match system" is on, so the preview still shows what
// you're looking at without claiming you picked it.
function ThemeCard({
  scheme,
  isActive,
  isResolved,
  onSelect,
}: {
  scheme: 'light' | 'dark';
  isActive: boolean;
  isResolved: boolean;
  onSelect: () => void;
}) {
  const isDark = scheme === 'dark';
  const label = isDark ? 'Dark' : 'Light';

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      aria-label={`${label} theme`}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={[
        'group relative block w-full overflow-hidden rounded-3xl text-left',
        'border transition-shadow duration-300 outline-none',
        'focus-visible:ring-2 focus-visible:ring-blue-500',
        isActive
          ? 'border-blue-500/60 ring-2 ring-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
          : isResolved
            ? 'border-blue-500/30 ring-1 ring-blue-500/30'
            : 'border-white/10 hover:border-white/25',
      ].join(' ')}
    >
      {/* Illustration */}
      <div
        className={[
          'relative h-40 w-full overflow-hidden',
          isDark
            ? 'bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#0b1220]'
            : 'bg-gradient-to-br from-sky-300 via-sky-200 to-amber-100',
        ].join(' ')}
      >
        {isDark ? (
          <>
            <Moon
              className="absolute right-6 top-5 h-10 w-10 text-indigo-100 drop-shadow-[0_0_10px_rgba(199,210,254,0.55)]"
              strokeWidth={1.5}
            />
            <Star className="absolute left-6 top-6 h-3 w-3 fill-current text-indigo-200/90" strokeWidth={0} />
            <Star className="absolute left-16 top-12 h-2 w-2 fill-current text-indigo-200/70" strokeWidth={0} />
            <Star className="absolute left-28 top-5 h-2.5 w-2.5 fill-current text-indigo-200/80" strokeWidth={0} />
            <Star className="absolute right-24 top-14 h-2 w-2 fill-current text-indigo-200/60" strokeWidth={0} />
            <Cloud
              className="absolute bottom-5 left-5 h-12 w-12 fill-indigo-400/15 text-indigo-300/35"
              strokeWidth={1.25}
            />
            <Cloud
              className="absolute bottom-8 right-8 h-9 w-9 text-indigo-300/25"
              strokeWidth={1.25}
            />
          </>
        ) : (
          <>
            <Sun
              className="absolute right-6 top-5 h-11 w-11 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]"
              strokeWidth={1.5}
            />
            <Cloud
              className="absolute bottom-6 left-5 h-12 w-12 fill-white text-white drop-shadow-sm"
              strokeWidth={1.25}
            />
            <Cloud
              className="absolute bottom-10 right-10 h-8 w-8 fill-white/90 text-white/90"
              strokeWidth={1.25}
            />
            <Cloud
              className="absolute left-24 top-8 h-7 w-7 fill-white/70 text-white/70"
              strokeWidth={1.25}
            />
          </>
        )}

        {/* Selected check — springs in rather than popping. */}
        <AnimatePresence>
          {isActive && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="absolute left-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-500/40"
            >
              <Check className="h-4 w-4" strokeWidth={3} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Caption */}
      <div className="flex items-center justify-between gap-2 bg-gray-50 px-4 py-3 transition-colors duration-300 ease-in-out dark:bg-gray-900/70">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</span>
        {isActive ? (
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Selected</span>
        ) : isResolved ? (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Current</span>
        ) : null}
      </div>
    </motion.button>
  );
}

// AppearancePanel drives next-themes, which writes the .dark class onto <html> — that
// one class flips both the Tailwind `dark:` variants and (via color-scheme) every
// Astryx component in the app. See components/ThemeProvider.tsx.
//
// The two cards cover the explicit choices; "Match system" is kept as a separate switch
// rather than a third card, because it isn't a look you can illustrate — it's a rule
// about which of the other two applies. Turning it on leaves the resolved card marked
// "Current"; picking a card turns it back off.
function AppearancePanel() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  // next-themes can't know the active theme until it has read the DOM on the client, so
  // `theme` is undefined on the server and during the first render. Rendering the
  // selection state before then would mark the wrong card and mismatch on hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration flag
    setMounted(true);
  }, []);

  const followsSystem = theme === 'system';
  const resolved = resolvedTheme === 'dark' ? 'dark' : 'light';

  return (
    <SettingsCard>
      <VStack gap={5}>
        <VStack gap={1}>
          <Heading level={2}>Theme</Heading>
          <Text type="supporting" color="secondary">
            Pick how VibeNet looks, or follow your device.
          </Text>
        </VStack>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {(['light', 'dark'] as const).map((option) => (
            <ThemeCard
              key={option}
              scheme={option}
              isActive={mounted && !followsSystem && theme === option}
              isResolved={mounted && followsSystem && resolved === option}
              onSelect={() => setTheme(option)}
            />
          ))}
        </div>

        <Switch
          label="Match my system setting"
          description="Follows your device's light/dark preference automatically."
          value={mounted && followsSystem}
          onChange={(on) => setTheme(on ? 'system' : resolved)}
        />
      </VStack>
    </SettingsCard>
  );
}

export function SettingsPanel({
  user,
  section,
  onSectionChange,
  onUserUpdated,
  onLogout,
}: {
  user: AuthUser | null;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onUserUpdated: (user: AuthUser) => void;
  onLogout: () => void;
}) {
  const isNarrow = useMediaQuery('(max-width: 768px)');

  // Mobile is a master→detail drill-down: 'nav' shows the menu, 'detail' shows the
  // selected section behind a back button. Desktop shows both side-by-side.
  // Opening settings from the app sidebar lands on the menu; picking a section (or
  // arriving via the "Chat PIN" shortcut) drills in.
  const [mobileView, setMobileView] = useState<'nav' | 'detail'>('nav');

  // Selecting a nav item also drills into the detail view on mobile.
  const selectSection = (id: SettingsSection) => {
    onSectionChange(id);
    setMobileView('detail');
  };

  const activeItem = NAV_ITEMS.find((item) => item.id === section) ?? NAV_ITEMS[0];

  // The nav rail. Deliberately NOT Astryx's List — plain buttons let the rail own its
  // own selected/hover treatment (a tinted pill) rather than the design system's.
  const nav = (
    <nav className="flex h-full min-h-0 flex-1 flex-col gap-1 p-3" aria-label="Settings sections">
      <h2 className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Settings
      </h2>

      {NAV_ITEMS.map((item) => {
        const isSelected = section === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => selectSection(item.id)}
            aria-current={isSelected ? 'page' : undefined}
            className={[
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium',
              'outline-none transition-colors duration-200 ease-in-out',
              'focus-visible:ring-2 focus-visible:ring-blue-500',
              isSelected
                ? 'bg-gray-200/80 text-gray-900 dark:bg-gray-800/80 dark:text-white'
                : 'text-gray-600 hover:bg-gray-200/50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800/40 dark:hover:text-gray-100',
            ].join(' ')}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
            <span className="flex-1 truncate">{item.label}</span>
            {isNarrow && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 dark:text-gray-500" />}
          </button>
        );
      })}

      {/* Log Out sits at the very bottom, quiet until reached for — then red. */}
      <div className="mt-auto pt-3">
        <div className="mb-2 h-px bg-gray-200 dark:bg-gray-800" />
        <button
          type="button"
          onClick={onLogout}
          className={[
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium',
            'text-gray-600 outline-none transition-colors duration-200 ease-in-out dark:text-gray-400',
            'hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400',
            'focus-visible:ring-2 focus-visible:ring-red-500',
          ].join(' ')}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
          <span>Log Out</span>
        </button>
      </div>
    </nav>
  );

  const content = (
    <VStack gap={6}>
      {/* Mobile detail view: a back button above the section title. */}
      {isNarrow && (
        <button
          type="button"
          onClick={() => setMobileView('nav')}
          className="-ml-1 flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-gray-600 outline-none transition-colors duration-200 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:text-gray-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Settings
        </button>
      )}

      <Heading level={1} type={isNarrow ? undefined : 'display-3'}>
        {activeItem.label}
      </Heading>

      {/* Panels are keyed on the persisted values they seed from, so they reseed after
          a save — or after useAuth's background refresh reports a change from another
          device — instead of holding stale local state. */}
      {user && section === 'profile' && (
        <ProfilePanel
          key={`${user.username}:${user.display_name}`}
          user={user}
          onUpdated={onUserUpdated}
        />
      )}

      {user && section === 'security' && (
        <SecurityPanel
          key={`${user.chat_pin_enabled}:${user.chat_pin_type}`}
          user={user}
          onUpdated={onUserUpdated}
        />
      )}

      {section === 'appearance' && <AppearancePanel />}
    </VStack>
  );

  // Mobile, nav view: the rail owns the pane (no split).
  if (isNarrow && mobileView === 'nav') {
    return (
      <div className="vibe-settings h-full p-4">
        <div className={`${RAIL} h-full rounded-3xl`}>{nav}</div>
      </div>
    );
  }

  // Desktop: a left-aligned split — fixed nav rail, then the forms taking the rest.
  // Both are inset from the app sidebar (and each other) so the rail reads as its own
  // floating surface rather than a second column welded to the main nav.
  return (
    <div className="vibe-settings flex h-full gap-4 p-4 md:gap-6 md:p-6">
      {/* Full height, so Log Out pins to the bottom of the rail rather than floating
          under the last section, and the rail reads as a column instead of a stub. */}
      {!isNarrow && (
        <aside
          className={`${RAIL} flex h-full w-72 shrink-0 flex-col overflow-y-auto rounded-3xl`}
        >
          {nav}
        </aside>
      )}

      {/* Left-aligned, not centred: the column is capped and pinned to the start, so it
          doesn't drift into the middle of a wide window. */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="w-full max-w-3xl">{content}</div>
      </main>
    </div>
  );
}

// VibeNet — Register (route: "/register").
//
// Because VibeNet is end-to-end encrypted, registration generates the account's
// E2EE keypair in the browser first (private key stays on the device), then
// posts { username, password, public_key } to POST /api/auth/register. On
// success it stores the JWT + user and the private key, then sends the person
// home. Google sign-up is a full-page redirect to the backend.

'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gooeyToast } from 'goey-toast';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { AuthShell } from '@/components/AuthShell';
import { GoogleButton } from '@/components/GoogleButton';
import { register, ApiError } from '@/lib/api';
import { saveSession } from '@/lib/session';
import { generateKeyPair, storePrivateKey } from '@/lib/e2ee';

const MIN_PASSWORD = 8;

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Field-level validation shown inline under the password inputs.
  const passwordStatus =
    password.length > 0 && password.length < MIN_PASSWORD
      ? ({ type: 'error', message: `At least ${MIN_PASSWORD} characters.` } as const)
      : undefined;
  const confirmStatus =
    confirm.length > 0 && confirm !== password
      ? ({ type: 'error', message: 'Passwords do not match.' } as const)
      : undefined;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const name = username.trim();
    if (!name || !password || !confirm) {
      gooeyToast.warning('Fill in every field to continue.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      gooeyToast.warning(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      gooeyToast.warning('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Generate the E2EE keypair locally — the private key never leaves here.
      const keys = await generateKeyPair();
      // 2. Register with the public key.
      const result = await register({ username: name, password, publicKey: keys.publicKey });
      // 3. Persist the private key and the new session, then continue.
      storePrivateKey(result.user.username, keys.privateKeyJwk);
      saveSession(result);
      gooeyToast.success('Account created — your keys are on this device.');
      router.push('/dashboard');
    } catch (err) {
      gooeyToast.error(
        err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Your encryption keys are generated on this device and never leave it."
      footer={
        <Text type="supporting" color="secondary">
          Already have an account?{' '}
          <Link href="/login" className="vibe-link">
            Log in
          </Link>
        </Text>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        <TextInput
          type="text"
          label="Username"
          placeholder="pick-a-username"
          value={username}
          onChange={setUsername}
          htmlName="username"
          size="lg"
          isRequired
        />

        <TextInput
          type="password"
          label="Password"
          description="Use at least 8 characters."
          placeholder="••••••••"
          value={password}
          onChange={setPassword}
          htmlName="password"
          size="lg"
          isRequired
          status={passwordStatus}
        />

        <TextInput
          type="password"
          label="Confirm password"
          placeholder="••••••••"
          value={confirm}
          onChange={setConfirm}
          htmlName="confirm_password"
          size="lg"
          isRequired
          status={confirmStatus}
        />

        <div className="vibe-cta vibe-cta--stack flex flex-col gap-3">
          <Button
            label={submitting ? 'Creating account…' : 'Register'}
            type="submit"
            variant="primary"
            size="lg"
            isLoading={submitting}
          />
          <GoogleButton />
        </div>
      </form>
    </AuthShell>
  );
}

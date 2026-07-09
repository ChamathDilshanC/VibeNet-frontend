// VibeNet — Login (route: "/login").
//
// Posts { username, password } to the backend's POST /api/auth/login and, on
// success, stores the returned JWT + user and sends the person home. Also
// offers Google sign-in, which is a full-page redirect to the backend.

'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { AuthShell } from '@/components/AuthShell';
import { login, googleLoginUrl, ApiError } from '@/lib/api';
import { saveSession } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await login({ username: username.trim(), password });
      saveSession(result);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your encrypted VibeNet workspace."
      footer={
        <Text type="supporting" color="secondary">
          New to VibeNet?{' '}
          <Link href="/register" className="vibe-link">
            Create an account
          </Link>
        </Text>
      }
    >
      <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        {error && (
          <div className="vibe-alert" role="alert">
            {error}
          </div>
        )}

        <TextInput
          type="text"
          label="Username"
          placeholder="your-username"
          value={username}
          onChange={setUsername}
          htmlName="username"
          size="lg"
          isRequired
        />

        <TextInput
          type="password"
          label="Password"
          placeholder="••••••••"
          value={password}
          onChange={setPassword}
          htmlName="password"
          size="lg"
          isRequired
        />

        <div className="vibe-cta vibe-cta--stack flex flex-col gap-3">
          <Button
            label={submitting ? 'Logging in…' : 'Login'}
            type="submit"
            variant="primary"
            size="lg"
            isLoading={submitting}
          />
          <a href={googleLoginUrl()} className="vibe-google-btn">
            Continue with Google
          </a>
        </div>
      </form>
    </AuthShell>
  );
}

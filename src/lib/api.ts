// Thin client for the VibeNet backend REST API.
//
// The base URL is read from NEXT_PUBLIC_API_BASE_URL and falls back to the
// backend's local default (:8080). The backend's CORS allow-list already
// includes http://localhost:3000, so the dev front-end can call it directly.

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080'
).replace(/\/$/, '');

// Shape of the user object returned by the auth endpoints (see backend
// userSummary / authResponse in internal/api/handler.go).
export interface AuthUser {
  user_id: string;
  username: string;
  email?: string;
  public_key?: string;
  /** Google account photo, re-synced by the backend on each Google sign-in.
   *  Absent for password accounts, which render initials instead. */
  avatar_url?: string;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

export interface RegisterInput {
  username: string;
  password: string;
  publicKey: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

// ApiError carries the HTTP status plus the backend's { "error": "..." } message.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (e.g. a proxy error page); fall through to status handling.
  }

  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ??
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return data as T;
}

// POST /api/auth/register — creates a password account with an E2EE public key.
export function register(input: RegisterInput): Promise<AuthResult> {
  return postJSON<AuthResult>('/api/auth/register', {
    username: input.username,
    password: input.password,
    public_key: input.publicKey,
  });
}

// POST /api/auth/login — authenticates a password account.
export function login(input: LoginInput): Promise<AuthResult> {
  return postJSON<AuthResult>('/api/auth/login', {
    username: input.username,
    password: input.password,
  });
}

// GET /api/auth/google/login — server redirects the browser to Google's consent screen.
export function googleLoginUrl(): string {
  return `${API_BASE_URL}/api/auth/google/login`;
}

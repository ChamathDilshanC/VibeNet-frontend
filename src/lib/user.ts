// Authenticated calls for the signed-in user's own profile.
//
// The JWT only carries `user_id` and `username`, so anything that can change
// after the token was issued — the Google `avatar_url`, or a username edited in
// settings — has to come from the server. Both calls return the backend's
// `userSummary`, which is the same shape as `AuthUser`.

import { API_BASE_URL, ApiError, type AuthUser } from './api';
import { apiClient } from './apiClient';
import { getToken } from './session';

// GET /api/user/me — the authenticated user's current profile.
export function fetchMe(): Promise<AuthUser> {
  return apiClient.get<AuthUser>('/api/user/me');
}

// PUT /api/user/profile — updates the account's username and display name (real
// name). Rejects with an ApiError carrying status 409 when another account
// already holds the username. A blank display name is defaulted to the username
// server-side.
export function updateProfile(username: string, displayName: string): Promise<AuthUser> {
  return apiClient.put<AuthUser>('/api/user/profile', {
    username,
    display_name: displayName,
  });
}

// POST /api/user/avatar — uploads a new profile picture as multipart/form-data and
// returns the updated profile (with the new absolute avatar_url). The backend also
// broadcasts a user_update so peers refresh the picture live.
//
// This bypasses apiClient because that helper forces a JSON Content-Type; for a
// multipart body the browser must set Content-Type itself (with the boundary), so
// we call fetch directly and attach the bearer token by hand.
export async function uploadAvatar(file: File): Promise<AuthUser> {
  const token = getToken();
  const form = new FormData();
  form.append('avatar', file);

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/user/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running?');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // No/!JSON body; fall through to status handling.
  }

  if (!res.ok) {
    const message =
      (data as { error?: string } | null)?.error ?? `Upload failed (${res.status})`;
    throw new ApiError(res.status, message);
  }

  return data as AuthUser;
}

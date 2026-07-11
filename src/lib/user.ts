// Authenticated calls for the signed-in user's own profile.
//
// The JWT only carries `user_id` and `username`, so anything that can change
// after the token was issued — the Google `avatar_url`, or a username edited in
// settings — has to come from the server. Both calls return the backend's
// `userSummary`, which is the same shape as `AuthUser`.

import type { AuthUser } from './api';
import { apiClient } from './apiClient';

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

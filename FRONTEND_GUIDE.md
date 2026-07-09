# VibeNet Frontend Architecture Guide

A tour of how the VibeNet Next.js client is put together: the stack, how a session
is held and guarded, how end-to-end encryption keys are generated and stored, and
where things live on disk. For install/run commands, see [README.md](README.md).

## Tech Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | **Next.js 16** (App Router) | File-based routing under `src/app/`; every interactive page is a Client Component (`'use client'`) — there's no server-rendered data fetching yet |
| Language | **TypeScript** | `tsc --noEmit` is the source of truth for types; no `any` in app code |
| Styling | **Tailwind CSS v4** | CSS-first config (no `tailwind.config.js`) — see `src/app/globals.css` |
| Components | **[Astryx Design System](https://github.com/facebook/astryx)** (`@astryxdesign/core`), **neutral** theme | Activated via `data-astryx-theme="neutral"` on `<html>` in `src/app/layout.tsx` |
| Icons | `@heroicons/react` (24px outline set) | |
| Toasts | `goey-toast` | Mounted once via `<Toaster />` in the root layout |
| Backend | Go REST API + WebSocket | Base URL from `NEXT_PUBLIC_API_BASE_URL` (see `src/lib/api.ts`), defaults to `http://localhost:8080` |

There is no client-side state management library (no Redux/Zustand/React Query).
State is either component-local (`useState`) or lives in `localStorage`, read
through small typed accessor modules — see below.

## State Management: the auth session

The signed session is two `localStorage` keys, written and read exclusively
through [`src/lib/session.ts`](src/lib/session.ts) — nothing else should touch
`localStorage` directly:

| Key | Contents |
| --- | --- |
| `vibenet:auth:token` | The signed JWT returned by the backend (`/api/auth/login`, `/api/auth/register`, or the Google OAuth callback) |
| `vibenet:auth:user` | The `AuthUser` JSON the backend returned alongside the token (`user_id`, `username`, optional `email`/`public_key`) |

```ts
saveSession({ token, user })   // called once, right after a successful auth response
getToken(): string | null      // read anywhere a request needs Authorization: Bearer <token>
getUser(): AuthUser | null     // read for display (username, etc.) — no network call
clearSession(): void           // logout
```

**Why localStorage and not a cookie:** the backend issues one bearer JWT per
login with no refresh/rotation (see the code comment in `session.ts`); a
future iteration that needs server-side session checks (middleware, RSC data
fetching) will likely move this to an `httpOnly` cookie instead.

### The `useAuth` hook

[`src/hooks/useAuth.ts`](src/hooks/useAuth.ts) is the single guard for every
protected page (currently `/dashboard`):

- On mount, checks `getToken()`. No token → `router.replace('/login')`.
- With a token, hydrates `{ ready: true, user: getUser() }` from the saved
  session (no network round trip — the user record already came from the
  auth response or was decoded from the JWT at OAuth callback time).
- Exposes `logout()`, which clears the session and sends the user to `/`
  (the marketing/landing page, which carries the Login/Register CTAs).

```tsx
const { user, ready, logout } = useAuth();
if (!ready) return null; // avoid a flash of protected content pre-hydration
```

The read happens in a `useEffect`, not during render — `localStorage` doesn't
exist during server-side rendering, so deferring the read until after mount
avoids a hydration mismatch.

### Authenticated requests: `apiClient`

[`src/lib/apiClient.ts`](src/lib/apiClient.ts) wraps `fetch` and automatically
attaches `Authorization: Bearer <token>` when a session exists:

```ts
apiClient.get<Contact[]>('/api/users/search?q=sarah')
apiClient.put('/api/user/settings/pin-toggle', { enabled: true })
```

It's the intended home for every authenticated call going forward (contacts,
search, PIN settings, the eventual `/api/user/me`). The plain, unauthenticated
`register`/`login`/`googleLoginUrl` calls in `src/lib/api.ts` are unaffected.

## E2EE Security Flow

> **Note:** the backend's `public_key` field and this flow are built on the
> **WebCrypto API** (`ECDH P-256`), not TweetNaCl — there is no `tweetnacl`
> dependency in this project. If TweetNaCl-specific key formats or box
> encryption are required for wire compatibility with another client, that's
> a deliberate follow-up, not something already in place.

Key generation and storage lives in [`src/lib/e2ee.ts`](src/lib/e2ee.ts):

1. **Registration** (`src/app/register/page.tsx`) generates a fresh **ECDH
   P-256** keypair client-side via `crypto.subtle.generateKey`, *before*
   calling `POST /api/auth/register`.
2. The **public key** is exported as SPKI, base64-encoded, and sent to the
   backend as `public_key` — this is what other users fetch (`GET
   /api/users/{id}/key`) to encrypt messages to this account.
3. The **private key** is exported as a JWK and stored locally via
   `storePrivateKey(username, jwk)`, namespaced per-username under the
   `vibenet:e2ee:privateKey` localStorage key. **It never leaves the device.**

```
Register ──▶ generateKeyPair() ──▶ POST /api/auth/register { public_key }
                    │
                    └──▶ storePrivateKey(username, privateKeyJwk)   [local only]
```

What's not built yet: deriving a shared secret (`crypto.subtle.deriveKey`)
between two users' ECDH keypairs and actually encrypting/decrypting message
payloads over the WebSocket. `e2ee.ts` is currently key-management only.

## Auth Entry Points

Three ways a session gets created, all converging on `saveSession()`:

| Route | Flow |
| --- | --- |
| `/login`, `/register` | Direct `POST` via `src/lib/api.ts` → `AuthResult` → `saveSession()` |
| `/auth/callback` | Legacy Google OAuth landing — reads `#token=&user=` from the URL **fragment** (never sent to a server) |
| `/auth/google-success` | Current Google OAuth landing — reads `?token=` from the query string, decodes the JWT payload client-side for `user_id`/`username` |

Both OAuth pages redirect to `/dashboard` on success and `/login` on failure,
stripping the token out of `window.location` immediately after reading it so
it isn't left in browser history.

## Folder Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout: fonts, Astryx theme, <Footer/>, <Toaster/>
│   ├── page.tsx                # Landing page (/) — brand, pitch, Login/Register CTAs
│   ├── globals.css             # Tailwind + Astryx reset/core/theme imports
│   ├── login/page.tsx          # Password login form
│   ├── register/page.tsx       # Password registration — generates the E2EE keypair
│   ├── dashboard/page.tsx      # Protected: useAuth() guard + <DashboardShell/>
│   └── auth/
│       ├── callback/page.tsx        # Legacy Google OAuth landing (fragment-based)
│       └── google-success/page.tsx  # Current Google OAuth landing (query-based)
│
├── components/
│   ├── AuthShell.tsx            # Shared chrome for /login and /register
│   ├── DashboardShell.tsx       # AppShell composition: <Sidebar/> + welcome + <EmptyState/>
│   ├── Sidebar.tsx              # Nav, DM list (mock data), Chat PIN/Settings/profile/logout
│   ├── EmptyState.tsx           # "No conversation selected" card
│   ├── GoogleButton.tsx         # "Continue with Google" — full-page nav to the OAuth endpoint
│   ├── Footer.tsx                # Site-wide footer
│   └── Toaster.tsx              # goey-toast mount point
│
├── hooks/
│   └── useAuth.ts               # Session guard + user + logout, for protected pages
│
└── lib/
    ├── api.ts                   # Unauthenticated REST calls (register, login, googleLoginUrl)
    ├── apiClient.ts             # Bearer-token-attached fetch wrapper for authenticated calls
    ├── session.ts                # localStorage accessors for the JWT + user (single source of truth)
    └── e2ee.ts                   # WebCrypto ECDH P-256 keypair generation + local private-key storage
```

### Conventions worth knowing

- **One `'use client'` per interactive page/component** — there's no server
  data fetching yet, so nearly everything is a Client Component.
- **`localStorage` access is centralized.** `session.ts` and `e2ee.ts` are the
  only modules that call `window.localStorage` directly; every accessor
  guards with `typeof window === 'undefined'` so it's safe to import from
  code that might render during SSR.
- **No component reaches into `localStorage` for the token to build headers
  itself** — that's `apiClient`'s job.
- Components are named after what they render (`Sidebar`, `EmptyState`), not
  the page they happen to be used on, so they stay reusable if the dashboard
  layout grows additional routes.

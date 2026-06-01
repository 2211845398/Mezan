# `web/` — Security notes

Authoritative security design lives in [`../WEB_FRONTEND_PLAN.md`](../WEB_FRONTEND_PLAN.md)
§9. This file tracks the **runtime** security posture of the shipped
frontend and calls out deliberate deviations.

---

## Token storage (v1)

| Token | Location | Rationale |
|---|---|---|
| Access token | **In-memory** Zustand slice, non-persisted | Plan §9.1 — unchanged. |
| Refresh token | **`localStorage`** under `VITE_SESSION_STORAGE_KEY_REFRESH` (default `mezan.auth.refresh`) | Shared across tabs so new tabs can boot via `/auth/refresh`; cleared on explicit logout. Temporary until httpOnly cookies — see [`../DIVERGENCES.md`](../DIVERGENCES.md) D-1. |

### Why `localStorage` for refresh only (not access)?

Access tokens stay **in-memory** only. The refresh JWT uses `localStorage` so
SPA links opened in a new tab on the same origin reuse the session. That
persists across browser restarts until logout and is readable to any script in
scope (XSS risk). We still refuse `localStorage` for access tokens.

### Why not an httpOnly cookie yet?

The FastAPI backend currently returns the refresh token in the JSON body
(`POST /auth/login`, `POST /auth/refresh`) and does not set a cookie. Plan
§9.1 specifies the cookie path; Epic 15.3 (backend) migrates the backend to
issue the cookie, at which point this file and the auth store drop
`localStorage` for refresh entirely.

### What lives in `localStorage` today?

- `mezan.auth.refresh` — the refresh JWT. Survives new tabs on the same
  origin; wiped on logout and on refresh failure. Legacy `sessionStorage`
  copies are migrated once on read. Other tabs listen for the `storage` event
  and clear in-memory auth when this key is removed (cross-tab logout).

### What never lives in client storage?

- Access tokens (memory-only).
- Any user PII beyond `/auth/me`'s response shape — the TanStack Query
  cache holds a copy while the tab is open; `QueryClient` is re-created on
  boot and dropped on logout.

---

## Redirect safety

`?next=` is validated against a small allow-list in
[`src/lib/nextPath.ts`](./src/lib/nextPath.ts). Rejected inputs fall back
to `/dashboard`:

- Absolute URLs, protocol-relative URLs (`//evil`), and non-HTTPish schemes.
- Anything containing `@`, whitespace, or a newline.
- Paths whose first segment is not a known Mezan route (e.g. `/wat`).

This is enforced on login and on any guard that preserves `next`.

---

## Deferrals

The items below are **planned but not in Epic W-2**. They will land in W-7
(Security hardening) unless noted otherwise:

- Idle timeout with auto-logout.
- `BroadcastChannel('mezan-auth')` multi-tab logout.
- `DOMPurify` wiring around anything that renders backend strings as HTML
  (today we render via React text nodes; the moment we need `innerHTML`
  we add the sanitizer).
- CSP and other security headers at the Nginx layer (W-8.1 / §9.3).

---

## Reporting issues

Security issues: do **not** open a public GitHub issue. Contact the Mezan
maintainers through the channel documented in the monorepo root's main
`README.md`. Every finding should include a `request_id` (the frontend
attaches `X-Request-ID` to every call, surfaced in error envelopes).

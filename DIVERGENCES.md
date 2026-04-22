# Mezan — Plan divergences

Pragmatic deviations from the authoritative design docs. Each entry names the
affected epic, the reason, and the follow-up ticket that returns us to the
canonical plan. Reconcile this file and the plan in the same PR that changes
behaviour.

---

## D-1 — Refresh token lives in `sessionStorage`, not an httpOnly cookie (W-2)

**Plan §9.1 says:** access in memory + refresh in an httpOnly + Secure + SameSite
cookie with `X-CSRF-Token` on the refresh call.

**We ship instead (Epic W-2, v1):** access in memory (unchanged) + refresh in
`sessionStorage` keyed by `VITE_SESSION_STORAGE_KEY_REFRESH`
(default `mezan.auth.refresh`).

**Why:** the current backend (`app/api/v1/auth.py`) returns the refresh token
in the JSON body of `POST /auth/login` and `POST /auth/refresh`, and the
logout endpoint consumes a refresh token in the request body. It never sets
a cookie and never reads one, so the plan's cookie-path is not implementable
without a backend change.

**Trade-off accepted:**

- `sessionStorage` is cleared when the tab closes, so the risk window is
  shorter than `localStorage` (which is what we are explicitly rejecting).
- Refresh theft via XSS is possible in principle; Plan §9.4 (DOMPurify,
  `innerHTML` lint ban) remains authoritative and reduces the XSS surface.
- An idle-timeout and multi-tab logout broadcast (Plan §9.7) land with
  Epic W-7 — they additionally mitigate the window.

**Closing this divergence — backend follow-up (Epic 15.3):**

- Issue the refresh token as an httpOnly + Secure + SameSite=Lax cookie on
  `POST /auth/login`.
- Read the cookie on `POST /auth/refresh` and `POST /auth/logout` instead of
  the JSON body (keep the body path behind a deprecation warning for the
  Flutter app until Epic M-2 migrates).
- Set and verify an `X-CSRF-Token` that the frontend mirrors from a
  non-httpOnly `XSRF-TOKEN` sibling cookie.

When Epic 15.3 ships, `web/src/features/auth/stores/authStore.ts` drops the
`refreshToken` state, and `AuthBoundary` replaces its boot call with a
credentialed `POST /auth/refresh` that reads the cookie set by the backend.

**Scope of this file's authority:** anything listed here overrides the plan
**only** until its "closing" row is done; any further drift requires a new
entry.

---

## D-2 — Frontend dashboard permission is `analytics:read`, not `bi:read` (W-2)

**Plan §4.1 originally said:** `/dashboard` requires `bi:read`.

**We ship instead:** `/dashboard` and the sidebar `bi` group require
`analytics:read`.

**Why:** `bi:read` is not seeded by `app/services/seed_service.py` and the
actual backend BI endpoint (`GET /api/v1/bi/executive-kpis` in
`app/api/v1/executive_bi.py`) is already gated by `require_permission("analytics", "read")`.
Using `bi:read` in the frontend would hard-bounce every admin to `/403` even
with full seeded permissions.

**Closing this divergence:** none required — this is a correction. The plan
text in `WEB_FRONTEND_PLAN.md §4.1` has been updated to match, so the contract
and the code now agree.

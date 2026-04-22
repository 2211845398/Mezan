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

---

## D-3 — Backups admin UI shows the last run from status, not a full run history (W-5.9)

**Some product sketches assume:** a sortable table of many historical backup
runs (or S3 object keys per row).

**We ship instead (Epic W-5.9):** `BackupsList` renders at most one primary row
built from `GET /api/v1/admin/backups/status` (`BackupStatusRead`: last
`started_at` / `finished_at`, `success`, `output_file`, `s3_uploaded` boolean).
The “S3” column is yes/no from `s3_uploaded`, not an object key.

**Why:** the backend persists a single status snapshot (see
`app/services/backup_service.py`), not a queryable history table exposed as a
list endpoint.

**Closing this divergence:** add a read-only `GET /admin/backups/history` (or
similar) if the product requires multi-row audit; until then the UI matches the
available API.

---

## D-4 — Branch admin form fields match the `Branch` model only (W-5.9)

**Some UI wireframes add:** per-branch currency, rich contact blocks, or other
columns not on the core branch entity.

**We ship instead:** create/edit forms only send fields that exist on
`BranchUpdate` / `BranchRead` in the OpenAPI schema (e.g. `name`, `address`,
`timezone`, `is_active`, and `unarchive` where applicable).

**Why:** there are no `currency` or structured `contact` columns on the current
`Branch` model; shipping them would be inventing data the API cannot store.

**Closing this divergence:** extend the model + schema + migration, then widen
the admin forms.

---

## D-5 — “Effective permissions” preview in the admin drawer is client-computed (W-5.9)

**UX expectation:** the permission overrides drawer may show what the user
“effectively” has after roles and overrides.

**We ship instead:** the drawer composes an **indicative** effective set in the
browser (roles + global overrides + `list_permissions`), mirroring the merge
intent of `get_current_user_permissions` in `app/api/deps.py`. Branch-scoped
override rows still come from `GET /users/{id}/permission-overrides` for
display/editing.

**Why:** there is no `GET /users/{id}/effective-permissions` endpoint; the
authoritative permission set for authorization remains server-side on each
request.

**Closing this divergence:** optional read-only effective-permissions endpoint
for exact parity, or keep treating the drawer as a UX aid only.

---

## D-6 — Admin-initiated password reset uses the gated user route (W-5.9)

**Earlier notes considered:** calling the public
`POST /auth/password-reset/request` with the user’s email from the admin UI.

**We ship instead:** `POST /api/v1/users/{user_id}/password-reset-request`
(permission-gated, audit-friendly), wired from `UserEdit` / `UsersList`.

**Why:** aligns reset actions with RBAC and audit expectations for admin tools.

**Closing this divergence:** none required if the backend route remains the
contract for admin-triggered resets.

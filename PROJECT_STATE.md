# Mezan — Project State

Single source of truth for what Mezan is, what is built, what is missing, what is planned, and what is wished-for. Update this file whenever the project's scope, status, or direction changes.

---

## 1. Project overview

**Mezan** is a cloud-ready ERP and retail backend built around a first-class **Point-of-Sale** engine and a **double-entry accounting** core. The stack is:

- **Language & runtime:** Python 3.12.
- **Framework:** FastAPI with async SQLAlchemy 2.0.
- **Database:** PostgreSQL 15+ with Alembic-managed migrations.
- **Packaging:** `uv`.
- **Deployment:** Docker Compose (dev / staging / prod files).
- **CI:** GitHub Actions (lint, tests, Docker build, deploy).

**Architectural layering (enforced):**

- `app/api/v1/` — HTTP routes only: request validation, dependency injection, response shaping. No business logic.
- `app/services/` — business rules, transactional orchestration, external-provider adapters (payments, OCR, LLM, FCM, backups).
- `app/models/` — SQLAlchemy ORM definitions.
- `app/schemas/` — Pydantic request/response contracts.
- `app/core/` — cross-cutting: configuration, error types, rate limiting.
- `app/db/` — engine and session factory.
- `app/utils/` — pure helpers (money, security, date).

**Clients planned around this backend:**

- `web/` — a React + Vite + TypeScript SPA (Arabic-first, RTL) that will live alongside the backend in this monorepo. See §5.
- `mobile/` — a Flutter POS and field-operations app that will also live in this monorepo.

**Domain coverage today:** identity and RBAC, branches and terminals, catalog and inventory, purchase orders and goods receipts, POS shifts and carts and payments and returns, HR profiles and payroll, double-entry accounting with fiscal periods and AR/AP subledgers, CRM loyalty and discounts, OCR invoice scanning, AI marketing advisory, executive BI, and scheduled backups.

---

## 2. Completed epics

### Epic 0 — Infrastructure and DevOps
- [x] **0.1** FastAPI app and `uv` dependency management.
- [x] **0.2** Docker and Compose files for dev, staging, production.
- [x] **0.3** PostgreSQL plus Alembic migrations.
- [x] **0.4** CI/CD workflows (lint, tests, deploy pipeline).

### Epic 1 — Identity, access, auditing
- [x] **1.1** Schema: users, branches, roles, permissions, terminals, etc.
- [x] **1.2** Auth API (JWT access/refresh; SSO hooks in place).
- [x] **1.3** RBAC permission checks on routes (`app/api/deps.py`).
- [x] **1.4** Audit logging service.
- [x] **1.5** Global config, branches, POS terminal CRUD and authorization.

### Epic 2 — Master catalog and inventory engine
- [x] **2.1** Hierarchical categories and dynamic attributes.
- [x] **2.2** Product catalog CRUD, barcode domain support.
- [x] **2.3** Purchase orders (draft/sent/tracked flow).
- [x] **2.4** Invoice scan pipeline (basic OCR provider).
- [x] **2.5** Manual override / validation for scanned invoices.
- [x] **2.6** Warehouse–store transfers with stock movements.

### Epic 3 — Point of sale
- [x] **3.1** Shifts: open float, cash events, close / Z-style variance.
- [x] **3.2** Temporary customer and QR / completion flow.
- [x] **3.3** Cart: lines, discounts, park / resume / state machine.
- [x] **3.4** Payment intents and capture (`in_store` and `mock` providers).
- [x] **3.5** Finalize paid cart → immutable sales invoice.
- [x] **3.6** Returns / exchanges (barcode, credit note path).

### Epic 4 — HR and payroll
- [x] **4.1** Employee profiles and weekly schedule CRUD.
- [x] **4.2** Clock in/out and leave request workflows.
- [x] **4.3** Payroll calculation (hours, rates, deductions).
- [x] **4.4** Bank-ready salary CSV export.

### Epic 5 — Accounting and executive BI
- [x] **5.1** Chart of accounts, journal entries/lines with mandatory `branch_id`, idempotent posting.
- [x] **5.2** Double-entry validation in `accounting_service.post_journal_entry`.
- [x] **5.3** Automated GL posting from POS sales, returns, goods receipts, approved payslips.
- [x] **5.4** Weighted-average inventory cost + product `standard_cost` fallback.
- [x] **5.5** Financial report APIs: trial balance, general ledger, income statement, balance sheet.
- [x] **5.6** Executive BI KPI endpoint (`/api/v1/bi/executive-kpis`).

### Epic 6 — CRM and marketing
- [x] **6.1** Loyalty points engine (accrual rules, manual adjustments).
- [x] **6.2** Discount rule engine (percentage, fixed, buy-X-get-Y).

### Epic 7 — Identity lifecycle, fixed roles, security
- [x] **7.1** IT→HR user onboarding workflow.
- [x] **7.2** Fixed base role catalog with codes and system-seeded permissions.
- [x] **7.3** Per-user permission overrides (allow/deny).
- [x] **7.4** Session idle timeout on refresh token lifecycle.
- [x] **7.5** Native password reset hardening (single-use token).

### Epic 8 — OCR provider and deterministic invoice parsing
- [x] **8.1** Provider registry with configurable default OCR provider.
- [x] **8.2** `BasicOcrProvider` (QR JSON / key-value parsing + optional Tesseract).
- [x] **8.3** Deterministic `parse_extracted_invoice` normalization.

### Epic 9 — In-store payment recording
- [x] **9.1** Internal `InStoreLedgerProvider` (no external gateway dependency).
- [x] **9.2** Strict payment method validation (`cash` / `card` / `other`) with card redaction.
- [x] **9.3** Configurable default payment provider.

### Epic 10 — Fiscal controls and subledger accounting
- [x] **10.1** Fiscal periods with open/close controls and posting guard.
- [x] **10.2** Journal reversal workflow with source linkage.
- [x] **10.3** AR/AP open items and payment application subledgers.
- [x] **10.4** Extended accounting APIs for period lock, reversals, AR/AP operations.

### Epic 11 — AI advisory and automated backups
- [x] **11.1** Deterministic-facts marketing advisory service (SQL facts → prompt → validated JSON).
- [x] **11.2** Advisory API endpoint with RBAC.
- [x] **11.3** Automated backup service (`pg_dump`, retention, optional S3) with admin APIs.
- [x] **11.4** App startup background scheduler hook.

### Hardening — Fix 14 — Branch soft delete
- [x] `branches.archived_at` migration `d8f1a2c3e4b5`.
- [x] List endpoint excludes archived by default (`include_archived` override).
- [x] `DELETE /branches/{id}` is idempotent soft delete with audit `branch.archived`.
- [x] `app/services/branch_scope` rejects archived branches for new operational entries.

---

## 3. Gaps and technical debt

| Area | Status |
|------|--------|
| **POS → GL on-account handling** | Addressed: on-account sales accrue AR only at finalize; walk-in uses cash / card / other clearing; AR cash receipts post when `apply_ar_payment` runs; returns mirror settlement. (`f0a1b2c3d4e5` migration + `document_posting_service` / `subledger_service` / `invoice_service`.) |
| **POS → GL output VAT** | Addressed: `products.output_vat_rate`; cart/invoice `tax_total`, per-line `tax_rate` + `line_tax_amount`; GL posts Output VAT Payable; returns reverse proportionally. (`c3d4e5f6a7b8` migration.) |
| **SSO** | JWT + refresh exist. OIDC / SAML implementation pending business sign-off. |
| **Loyalty vs GL** | Addressed: manual accruals post Dr/Cr loyalty expense vs liability; redemption/expiry releases liability to sales revenue; shift close variance posts cash over/short. (`e7f8a9b0c1d2` migration.) |
| **FIFO / LIFO** | Only weighted-average + standard cost; no cost layers. |
| **Inter-branch transfer GL + WAVG** | Addressed: destination `BranchProductCost` updated via source unit cost; GL posts Dr/Cr `default_inventory_account_id` by branch. |
| **Multi-currency GL** | Currencies + supplier currency exist; no FX revaluation or translated statements. |
| **Cash flow statement** | Not built as a dedicated report (balance sheet + income statement APIs exist). |

---

## 4. Planned epics (backend)

These epics are ordered by dependency and operational priority. Each ends with a clear acceptance signal and a check-box here.

### Epic 12 — Offline POS sync (source of truth: `OFFLINE_POS.md`)

Pattern: offline queue with idempotent server reconciliation. The full engineering plan lives in **[`OFFLINE_POS.md`](OFFLINE_POS.md)**; this file tracks progress only.

- [ ] **12.1** Catalog bundle endpoint with ETag (`POST /api/v1/pos/offline/bundle/download`).
- [ ] **12.2** Envelope store + replay shell (`PosSyncSubmission`, `PosSyncOperation`, sync POST/GET, no-op dispatcher).
- [ ] **12.3** Dispatchers for `cart_finalize` and `return` (adds `client_uuid` to `sales_invoices`, `sales_returns`).
- [ ] **12.4** Dispatchers for `shift_open`, `shift_close`, `cash_event` (adds `client_uuid` to `pos_shifts`).
- [ ] **12.5** Conflict surface and resolver endpoints.
- [ ] **12.6** Observability: audit breadcrumbs, BI metrics (pending ops, conflict rate, p95 sync latency).

### Epic 13 — Notification scheduling and delivery

Scheduled and event-driven notifications for roles and individuals, ready to plug into FCM for web + Flutter without coupling to Firestore or Firebase Auth.

- [x] **13.1** Models: `DeviceToken`, `NotificationTemplate`, `NotificationSchedule`, `NotificationRun`, `NotificationDelivery`.
- [x] **13.2** Provider registry with `MockPushProvider` (dev default) and `FcmPushProvider` (configurable via `PUSH_PROVIDER`, `FCM_CREDENTIALS_PATH` / `FCM_CREDENTIALS_JSON`).
- [x] **13.3** Scheduling engine (APScheduler-style loop reusing the `backup_scheduler_loop` pattern) executing active schedules.
- [x] **13.4** Built-in schedule types: low-stock, expiring inventory, closed fiscal period, backup failure, payroll approval pending, shift close reminder.
- [x] **13.5** API: register device token, list/read/resolve user preferences, admin template / schedule / run endpoints.
- [ ] **13.6** FCM integration hardening (production credentials, stale-token pruning) — requires `firebase-admin` dependency and credentials; manual smoke test in staging.
- [ ] **13.7** Web + Flutter client wiring (see §5).

### Epic 14 — AI advisory expansion

All new advisors follow the established `marketing_advisory_service` pattern: deterministic SQL facts → fixed system prompt → `response_format=json_object` → Pydantic validation → deterministic fallback.

- [x] **14.1** Purchase reorder advisor: per-branch velocity × lead time vs current on-hand, recommends PO quantities.
- [x] **14.2** HR anomaly advisor: detects unusual clock-in/out patterns and overtime using attendance and schedule data.
- [x] **14.3** Targeted marketing campaign advisor: customer segmentation from purchase history.
- [x] **14.4** Invoice-to-catalog product matcher (post-confirmation): matches OCR items to catalog products with human approval required before any mutation.
- [ ] **14.5** AI usage log and cost tracker (tokens in/out, dollar cost, model, endpoint, p95 latency).
- [ ] **14.6** Rate limiting on AI endpoints via `slowapi` (per-user + per-tenant buckets).
- [ ] **14.7** Response cache by facts-hash with TTL (DB-backed to avoid Redis dependency on small deployments).

### Epic 15 — Security hardening (ongoing)

- [ ] **15.1** CSP / security headers middleware.
- [ ] **15.2** Refresh token rotation with replay detection (basic rotation already present; add detection).
- [ ] **15.3** httpOnly cookie option for refresh tokens (alongside existing Bearer flow for Flutter).
- [ ] **15.4** Per-IP adaptive rate limits for authentication endpoints.

### Epic 16 — Multi-currency accounting

- [ ] **16.1** FX revaluation at period close (AR/AP/bank).
- [ ] **16.2** Translated income statement and balance sheet.

### Epic 17 — Cash flow statement

- [ ] **17.1** Indirect cash flow report from GL movements with configurable mapping.

---

## 5. Planned epics (frontend — `web/`)

The frontend is a new, first-class deliverable that lives in this monorepo under `web/`. The authoritative engineering plan — stack, routing, API layer, design system, dashboard components, code quality, security, build/deploy, folder layout, delivery order, risks, and open questions — lives in **[`WEB_FRONTEND_PLAN.md`](WEB_FRONTEND_PLAN.md)**. This file tracks epic progress only.

Summary of the stack direction (see `WEB_FRONTEND_PLAN.md` §2 for the full table):

- React 18 + Vite 7 + TypeScript strict.
- Tailwind CSS 3 + shadcn/ui + Radix + lucide-react + next-themes.
- React Router v6/v7 (file-based layout, nested routes).
- **Single server-state layer: TanStack Query 5** — no direct Axios + Zustand duplication.
- React Hook Form 7 + Zod 3.
- Zustand 5 for UI state only (no `persist` for JWTs).
- Axios with interceptors covering 401 / 403 / 419 / 5xx plus refresh-token rotation.
- `openapi-typescript` or `orval` wired to `http://localhost:8000/openapi.json` so types regenerate on backend changes.
- PWA via `vite-plugin-pwa` + Dexie for offline POS (see `OFFLINE_POS.md` §6).
- `i18next` + `react-i18next` from day one (Arabic default, English stub), Tajawal + IBM Plex Sans Arabic.
- Prettier + ESLint 9 flat + Husky + lint-staged + Commitlint.
- Vitest + @testing-library + Playwright.
- Sentry + PostHog (optional).

### Epic W-1 — Foundations and layout
- [x] **W-1.1** Scaffold `web/` with Vite + TS strict, Tailwind, shadcn init, `next-themes`, Tajawal.
- [x] **W-1.2** `pnpm` workspaces at repo root (or npm workspaces if pnpm is rejected). *(v1 uses a standalone `web/package.json` per `WEB_FRONTEND_PLAN.md` §3.2; workspace tooling lands only if/when shared TS packages appear.)*
- [x] **W-1.3** `openapi-typescript` script wired to backend OpenAPI.
- [x] **W-1.4** Husky + lint-staged + Prettier + Commitlint + EditorConfig + `.nvmrc`.
- [x] **W-1.5** Axios wrapper with full interceptors and toast surface.
- [x] **W-1.6** `i18next` bootstrap with ar + en namespaces per feature. *(`common` namespace is seeded in W-1; per-feature namespaces are added as each feature lands.)*
- [x] **W-1.7** `AdminLayout`, `AuthLayout`, sidebar driven by a `navigation.ts` config.

### Epic W-2 — Routing and RBAC
- [x] **W-2.1** React Router with declarative nested routes + per-route lazy chunks.
- [x] **W-2.2** `ProtectedRoute` + `<Can resource action />` component wired to `/api/v1/auth/me`. *(Shipped as `<RequireAuth />`, `<RequirePermission />`, `<RequireBranchContext />`, plus `<Can />` and `usePermission()` — backed by the new `GET /api/v1/auth/me/permissions` endpoint.)*
- [x] **W-2.3** 401/403/404/offline routes and boundaries.
- [x] **W-2.4** RBAC-driven sidebar trimming (hide inaccessible links; still enforced server-side).

> **Divergence tracked in [`DIVERGENCES.md`](DIVERGENCES.md):**
> - **D-1 (Epic 15.3):** refresh token lives in `sessionStorage` (key `VITE_SESSION_STORAGE_KEY_REFRESH`, default `mezan.auth.refresh`) until the backend issues an httpOnly cookie per `WEB_FRONTEND_PLAN.md §9.1`. See also [`web/SECURITY.md`](web/SECURITY.md).
> - **D-2:** dashboard permission is `analytics:read` (what the seeded backend actually grants for `/api/v1/bi/executive-kpis`), not `bi:read`.

### Epic W-3 — Design system
- [x] **W-3.1** Full shadcn/ui install. *(36 primitives copied into `web/src/components/ui/` via the shadcn CLI, RTL-normalised — see [`WEB_FRONTEND_PLAN.md`](WEB_FRONTEND_PLAN.md) §6.2.)*
- [x] **W-3.2** Light / dark tokens, design-token file, RTL logical utilities everywhere. *(Custom ESLint rule `mezan/no-physical-rtl` blocks new physical utilities in `src/**`; shadcn copy-ins are grandfathered with `// TODO(rtl)` markers. Western digits (0–9) are enforced via `web/src/lib/format.ts` + `web/src/lib/i18n-numbers.ts` with `numberingSystem: 'latn'`.)*
- [x] **W-3.3** `DataTable` component built on **TanStack Table v8** (fixes Bonyan's weak table story). *(URL-driven server mode + opt-in client mode, density/visibility persisted per route, `@tanstack/react-virtual` auto-enables past 200 rows, first-class skeleton/empty/error states.)*
- [x] **W-3.4** Shared `Form`, `Select`, `DateField`, `MoneyInput` components. *(+ `AsyncSelect` on `cmdk` and an `UnsavedChangesPrompt` built on React Router v7's `useBlocker`; `MoneyInput` rounds via `decimal.js` to backend `q2`.)*

### Epic W-4 — API layer and types
- [x] **W-4.1** Generated `schema.ts` plus stable re-exports in `web/src/api/types.ts`; CI codegen drift job.
- [x] **W-4.2** Thin per-feature `api.ts` modules using generated types; never `any`.
- [x] **W-4.3** Query keys and cache policies centralized in `web/src/features/<feature>/queries.ts`.
- [x] **W-4.4** Mutation helpers (`createOptimisticMutation`) + idempotency keys; `useUpdateProfile` optimistic example; POS TODO for OFFLINE_POS §4.8.

### Epic W-5 — Feature modules (map 1:1 to backend epics)

Each feature module sits at `web/src/features/<domain>/{api,components,hooks,pages,types}`.

- [ ] **W-5.1** Auth (login, forgot, reset, onboarding completion).
- [x] **W-5.2** POS web (W-5.1 plan): `/pos` shell + `ShiftGate` / `PosRegister` / `ShiftClose` / `InvoiceLookup`; detailed `CartRead` + invoice read/list + return lookup on backend; `react-to-print` thermal 58/80 + credit note; `localStorage` offline queue + flush on reconnect (Dexie/service worker → W-9); i18n `pos` namespace; MSW + Vitest smoke/RBAC/offline-queue tests.
- [x] **W-5.3** Inventory and catalog: stock-on-hand + invoice-scan list + minimal price lists (backend); catalog/inventory feature modules (products, categories, price lists, stock, adjustments, transfers, scans); shared `FileDrop`, `AttributeFieldset`, `BarcodeRepeater`, `BranchStockFilterBar`; i18n `catalog` + `inventory`; Vitest/MSW smoke; routes under `/catalog/*` and `/inventory/*`.
- [x] **W-5.4** Purchase orders + goods receipts + invoice scans.
- [x] **W-5.5** HR (employees, attendance, leave) + Payroll.
- [x] **W-5.6** Accounting (journals, trial balance, financial reports) + Fiscal periods.
- [x] **W-5.7** CRM (loyalty, discounts) + Marketing advisory.
- [ ] **W-5.8** Executive BI dashboard.
- [x] **W-5.9** Admin (users, roles, permissions, branches, terminals, backups, notifications).

### Epic W-6 — Code quality and DX
- [ ] **W-6.1** ESLint 9 flat with `typescript-eslint`, `jsx-a11y`, `simple-import-sort`.
- [ ] **W-6.2** Prettier with Tailwind plugin.
- [ ] **W-6.3** Bundle analyzer; chunk budgets in CI.
- [ ] **W-6.4** 60% statement coverage target on `features/*/hooks` and `features/*/api`.

### Epic W-7 — Security
- [ ] **W-7.1** Access token in memory only.
- [ ] **W-7.2** Refresh token in httpOnly cookie; CSRF protection on state-changing requests.
- [ ] **W-7.3** CSP and standard security headers via Nginx config.
- [ ] **W-7.4** DOMPurify for any HTML rendered from backend strings.

### Epic W-8 — Build and deploy
- [ ] **W-8.1** Dockerfile multi-stage (build → Nginx) with immutable asset hashing.
- [ ] **W-8.2** `docker-compose.web.yml` for opt-in local run; main compose stays backend + DB only.
- [ ] **W-8.3** GitHub Actions: lint, typecheck, vitest, playwright, build, bundle-size check.
- [ ] **W-8.4** Deployment targets documented (Nginx beside backend, or Cloudflare Pages for static).

### Epic W-9 — PWA + offline POS client
- [ ] **W-9.1** `vite-plugin-pwa` registerType autoUpdate; service worker.
- [ ] **W-9.2** Dexie schema mirroring `OFFLINE_POS.md` §6.1.
- [ ] **W-9.3** Sync worker honoring §6.4.
- [ ] **W-9.4** Conflict resolver UI per `OFFLINE_POS.md` §6.5.
- [ ] **W-9.5** Offline-only rendering rules for POS; online-required for reports.

### Epic W-10 — Notifications client
- [ ] **W-10.1** Firebase web SDK wiring behind a feature flag.
- [ ] **W-10.2** Device token registration on login; revocation on logout.
- [ ] **W-10.3** In-app notification center reading from backend as a fallback channel.

---

## 6. Planned epics (mobile — `mobile/`)

Mobile lives in the same monorepo under `mobile/`. It is not built in Docker; Flutter tooling runs on the developer machine.

- [ ] **M-1** Flutter scaffold + FCM wiring via `firebase_messaging` only (no Firestore, no Firebase Auth).
- [ ] **M-2** Auth (JWT stored in secure enclave; refresh rotation).
- [ ] **M-3** POS offline client (SQLite queue mirroring Dexie contract).
- [ ] **M-4** Attendance clock in / out, leave requests.
- [ ] **M-5** Field inventory (stock counts, transfer receive).

---

## 7. Wishlist (not scheduled)

Items worth keeping on the radar but not committed to a release.

- Kitchen display for food-service branches.
- Multi-warehouse bin locations with pick paths.
- Supplier portal (self-service PO confirmation, ASN).
- Customer-facing web store with Mezan as backend-of-record.
- Full AI co-pilot embedded in BI (natural language → SQL facts → validated answer).
- Webhooks for GL postings (for external BI ingestion).
- SOC2-style evidence export package.
- Per-branch language packs beyond ar / en.

---

## 8. Conventions for updating this file

- When a planned task ships, flip its `[ ]` to `[x]` in the same PR that introduces the code.
- When an epic is fully completed, move it from §4 or §5 to §2 (Completed epics) with the same numbering preserved.
- When debt is paid down, move it from §3 to the relevant completed epic as a Hardening entry.
- When a wish graduates to a plan, move it from §7 to §4/§5/§6 with a numbered ID.
- Never silently delete planned items — mark them cancelled with a one-line reason if they are dropped.

---

## 9. Verification checklist (for PRs touching the backend)

- `uv run ruff check . --fix`
- `uv run pytest -q` (requires `TEST_DATABASE_URL` / PostgreSQL test DB)
- `uv run alembic upgrade head` on a throwaway DB to confirm migrations apply cleanly.
- `PROJECT_STATE.md` updated (tick boxes, move completed epics, update gaps).
- If the PR adds an endpoint, confirm it appears under `/docs` and has a `require_permission` dependency.

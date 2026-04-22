# `web/` Frontend — Engineering Plan

**Status:** Planning. No code in this iteration.
**Owner:** Future `web/` SPA, Arabic-first, built alongside the Mezan backend in this monorepo.
**Pair documents:**
- [`PROJECT_STATE.md`](PROJECT_STATE.md) §5 — tracks Epic W-1..W-10 progress boxes.
- [`OFFLINE_POS.md`](OFFLINE_POS.md) — binds §6 of that plan (frontend contracts) to the POS feature in this document.

This document is authoritative for everything inside `web/`. Progress is tracked in `PROJECT_STATE.md`; any drift between the two must be reconciled in the same PR.

---

## 1. Product context

- **Shape:** Single-page application (SPA), Arabic-first, RTL-first, consumed by internal operators (cashier, warehouse, HR, accountant, marketing, IT admin, owner). No public marketing surface here.
- **Backend:** FastAPI at `/api/v1/*` with OpenAPI at `/openapi.json`, JWT access + refresh, RBAC enforced server-side, domain coverage per `PROJECT_STATE.md` §2.
- **Why SPA and not Next.js:** every screen is behind authentication; SEO is irrelevant; an SSR server is operational weight we do not want to pay for. Vite dev server is also ~2–3× lighter on RAM than a Next.js dev server, which matters on the target 8 GB developer machine.
- **Why monorepo:** `web/`, future `mobile/`, and `backend/` share one repo so `openapi.json` changes, API contracts, and `PROJECT_STATE.md` stay atomic in a single PR.
- **Priority use cases (pick Feature order from these):** POS checkout, catalog + inventory, purchase orders + goods receipts, HR + payroll, accounting + fiscal reports, BI dashboard, admin (users/roles/branches/backups/notifications).

---

## 2. Technology stack (frozen for v1)

Each choice has a one-line justification. Swapping any of these later is a conscious decision, not a drift.

| Layer | Choice | Why (vs alternatives) |
|-------|--------|-----------------------|
| Language | **TypeScript 5.8+** `strict: true` | Catches bugs before runtime; audits flagged weak typing as Bonyan's biggest debt. |
| Framework | **React 18.3+** | Largest ERP component ecosystem; audit confirmed the same choice worked well for Bonyan. |
| Build | **Vite 7+ with SWC** | Fastest dev server; `manualChunks` was already proven useful in Bonyan's `vite.config.ts`. |
| Package manager | **pnpm 9+** | Correct hoisting + disk savings; Bonyan used npm which is fine, but pnpm avoids the `@types/uuid` misplacement class of bug. |
| Node engine | **22 LTS**, pinned via `package.json` `engines` and `.nvmrc` | Bonyan had no pin — a concrete Bonyan debt item we are not repeating. |
| Routing | **React Router v7** (data router) | v7 has stable data loaders + `redirect()` in actions, which maps cleanly onto our 401/403 handling. v6 is acceptable but v7 removes a lot of wrapper code. |
| Server state | **TanStack Query 5** | Only server-state layer; no hand-rolled Axios calls outside of `lib/api`. Bonyan underused this and mixed it with Zustand — we will not. |
| Client state | **Zustand 5** (UI-only) | No `persist` on auth. Used strictly for local UI state (open drawers, current POS lane, etc.). |
| Forms | **React Hook Form 7 + Zod 3** | Every non-trivial form, no exceptions. `@hookform/resolvers` wires Zod schemas directly. |
| Styling | **Tailwind CSS 3.4 + `tailwindcss-animate` + `@tailwindcss/typography`** | Tailwind's logical utilities (`ms-*`, `me-*`, `ps-*`) are the cleanest RTL path. |
| Component library | **shadcn/ui** (copy-in) on **Radix UI** primitives | Owned source, no black-box dependencies. |
| Icons | **lucide-react** | Already proven in Bonyan; free, tree-shakable. |
| Theming | **next-themes** + CSS variables | Light/dark tokens as CSS vars consumed by Tailwind via `hsl(var(--...))`. |
| Tables | **TanStack Table v8** | Bonyan used raw `<table>` — weak for accounting grids. v8 is headless and composes with shadcn. |
| Charts | **Recharts** (default) with room for **Tremor** wrappers on dashboards | Recharts is enough for BI; Tremor on top if we need faster dashboard authoring. |
| Date / time | **date-fns 3** + `Intl` for locale formatting | No `moment`, no `dayjs` to avoid a second time library. |
| Money | **`decimal.js`** | Mirrors backend `Decimal` arithmetic; prevents floating-point drift on cart totals. |
| API types | **`openapi-typescript`** regenerated from backend's `/openapi.json` | Kills the `any`-in-accountingApi class of bug dead. |
| HTTP | **Axios** with interceptor layer | Standard, familiar; or `ky` if we later want smaller. Axios chosen because its interceptor ergonomics match our refresh-token story. |
| i18n | **`i18next` + `react-i18next`** | Installed on day one even if only `ar` is populated. Bonyan's "no i18n" path is a migration debt we refuse to inherit. |
| Fonts | **Tajawal** + **IBM Plex Sans Arabic** (fallback) + **Inter** for Latin digits | Self-host under `/public/fonts/` with `font-display: swap`. |
| PWA | **`vite-plugin-pwa`** + **Workbox** runtime caching | Specified in `OFFLINE_POS.md` §6.4. |
| Offline store | **Dexie 4** in `dependencies` (not `devDependencies`) | Bonyan misclassified this; we will not. |
| Testing | **Vitest**, **@testing-library/react**, **MSW** (mock service worker), **Playwright** | MSW is the missing piece in Bonyan; it lets us test feature hooks without a live backend. |
| Lint | **ESLint 9 flat config** with `typescript-eslint`, `eslint-plugin-jsx-a11y`, `react-hooks`, `react-refresh`, `simple-import-sort` | Same flat config Bonyan uses, plus a Prettier bridge. |
| Format | **Prettier** + `prettier-plugin-tailwindcss` | Bonyan had none — dev UX debt we refuse to inherit. |
| Commit hygiene | **Husky + lint-staged + Commitlint** (Conventional Commits) | Enforced at commit time, not just in CI. |
| Error tracking | **Sentry** (frontend + source maps) | Wired from day one; Bonyan had none, which is painful in production. |
| Analytics | **PostHog** (self-hosted allowed) with a feature flag kill-switch | Optional; useful for product decisions once real users are in. |

Rejections worth naming:
- **Next.js:** no SEO need, and SSR cost does not pay off for authenticated dashboards.
- **Vue / Nuxt:** smaller ERP ecosystem (Bonyan's audit reinforces the React choice).
- **Redux Toolkit:** overkill next to TanStack Query + Zustand for our shape.
- **MUI / Ant Design:** heavy, opinionated theming; Arabic + RTL styling is cleaner on Radix + Tailwind.
- **Firebase Auth / Firestore** on the frontend: explicitly rejected in `PROJECT_STATE.md` §1; we keep identity on our JWT + Postgres.

---

## 3. Repository integration

### 3.1 Folder at repository root

```
mezan/                              ← this repo, do not split
├── app/                            ← FastAPI backend, unchanged
├── alembic/
├── docker/
├── tests/                          ← backend tests
├── web/                            ← THIS PLAN
│   ├── public/
│   │   ├── fonts/
│   │   ├── favicon.ico
│   │   └── robots.txt
│   ├── src/
│   │   ├── api/                    ← generated OpenAPI types + thin http wrapper
│   │   │   ├── generated/
│   │   │   │   └── schema.ts       ← produced by openapi-typescript, never hand-edited
│   │   │   ├── client.ts           ← Axios instance + interceptors
│   │   │   ├── queryClient.ts      ← TanStack QueryClient with shared defaults
│   │   │   └── errors.ts           ← maps backend AppError envelope → UI errors
│   │   ├── components/
│   │   │   ├── ui/                 ← shadcn primitives (owned source)
│   │   │   ├── layout/
│   │   │   └── shared/
│   │   ├── config/
│   │   │   ├── env.ts              ← typed import.meta.env access
│   │   │   └── navigation.ts       ← RBAC-aware sidebar items
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   ├── api.ts
│   │   │   │   ├── queries.ts
│   │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   ├── pages/
│   │   │   │   └── types.ts
│   │   │   ├── pos/
│   │   │   │   ├── offline/        ← Dexie schema + sync worker (see OFFLINE_POS.md §6)
│   │   │   │   └── …
│   │   │   ├── catalog/
│   │   │   ├── inventory/
│   │   │   ├── purchase_orders/
│   │   │   ├── invoice_scans/
│   │   │   ├── hr/
│   │   │   ├── payroll/
│   │   │   ├── accounting/
│   │   │   ├── fiscal/
│   │   │   ├── loyalty/
│   │   │   ├── discounts/
│   │   │   ├── marketing/
│   │   │   ├── ai_advisory/
│   │   │   ├── bi/
│   │   │   ├── admin/              ← users, roles, branches, terminals, backups, notifications
│   │   │   └── notifications/      ← user-facing inbox + device token registration
│   │   ├── hooks/                  ← cross-cutting only (usePermission, useDomain, useOnline)
│   │   ├── i18n/
│   │   │   ├── index.ts
│   │   │   └── locales/
│   │   │       ├── ar/
│   │   │       └── en/
│   │   ├── lib/                    ← utils, money, date, rtl helpers
│   │   ├── providers/              ← ThemeProvider, QueryProvider, I18nProvider, AuthBoundary
│   │   ├── routes/
│   │   │   ├── router.tsx
│   │   │   └── guards.tsx
│   │   ├── stores/                 ← Zustand (UI-only)
│   │   ├── styles/
│   │   ├── test/
│   │   │   ├── setup.ts
│   │   │   ├── msw/
│   │   │   │   ├── server.ts
│   │   │   │   └── handlers/
│   │   │   └── utils.tsx
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── e2e/                        ← Playwright specs
│   ├── .env.example
│   ├── .nvmrc
│   ├── .prettierrc
│   ├── commitlint.config.cjs
│   ├── eslint.config.js
│   ├── index.html
│   ├── package.json
│   ├── postcss.config.cjs
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   ├── tsconfig.node.json
│   ├── vite.config.ts
│   └── Dockerfile
├── mobile/                         ← later, Flutter
├── docker-compose.yml              ← backend + db only (unchanged by default)
├── docker-compose.web.yml          ← OPT-IN web service for CI/e2e parity
├── OFFLINE_POS.md
├── WEB_FRONTEND_PLAN.md
└── PROJECT_STATE.md
```

### 3.2 Monorepo discipline without workspace tooling (v1) and with it (v2)

- **v1 (now):** `web/` has its own `package.json`. No pnpm workspace. Root repo stays Python-first. This is the same shape Bonyan used and it works.
- **v2 (only if we add shared TS packages between `web/` and a future admin console):** introduce `pnpm-workspace.yaml` at the repo root. Do not do this pre-emptively.

### 3.3 Why this layout is easy to navigate

- **Features 1:1 to backend epics.** Open `PROJECT_STATE.md` §2 and every completed backend epic has a matching `features/<domain>/` directory. Grepping a backend service name (e.g. `invoice_service`) finds its UI in one jump.
- **Shared layers are flat.** `components/`, `hooks/`, `lib/`, `providers/` each serve a single purpose and are never feature-specific.
- **No cross-feature imports.** A lint rule (`eslint-plugin-boundaries` or a manual ESLint `no-restricted-imports`) prevents `features/pos/*` from importing `features/accounting/*` directly. Cross-feature work goes through `lib/` or `api/`.

---

## 4. Routing

### 4.1 Route tree

```
/login
/forgot-password
/reset-password/:token
/onboarding/complete/:token   (customer onboarding — public)
/                             (AdminLayout)
├── dashboard                 analytics:read
├── pos                       pos_carts:create        (separate, full-screen; no AdminLayout)
├── catalog
│   ├── products              catalog:read
│   ├── categories            catalog:read
│   └── price-lists           catalog:update
├── inventory
│   ├── stock                 inventory:read
│   ├── adjustments           stock_adjustments:read
│   ├── transfers             inventory:read
│   └── scans                 invoice_scans:read
├── purchasing
│   ├── orders                purchase_orders:read
│   ├── suppliers             suppliers:read
│   └── goods-receipts        invoice_scans:validate
├── hr
│   ├── employees             employees:read
│   ├── attendance            employees:read
│   └── leave                 employees:read
├── payroll
│   ├── runs                  payroll:read
│   └── approvals             payroll:approve
├── accounting
│   ├── journal               accounting:read
│   ├── trial-balance         accounting:read
│   ├── income-statement      accounting:read
│   ├── balance-sheet         accounting:read
│   ├── general-ledger        accounting:read
│   ├── ar                    accounting:read
│   ├── ap                    accounting:read
│   └── fiscal-periods        accounting:update
├── crm
│   ├── customers             customers:create
│   ├── loyalty               loyalty:read
│   └── discounts             discounts:read
├── marketing
│   ├── analytics             analytics:read
│   ├── advisory              marketing_advisory:run
│   └── campaigns             ai_advisory:run
├── ai
│   ├── purchase-reorder      ai_advisory:run
│   ├── hr-anomalies          ai_advisory:run
│   └── invoice-match         ai_advisory:run
└── admin
    ├── users                 users:read
    ├── roles                 roles:read
    ├── branches              branches:read
    ├── terminals             terminals:read
    ├── backups               backups:read
    └── notifications         config:read
/403
/404
/offline
```

### 4.2 Router choice and declarations

- **React Router v7 data router** with a single `router.tsx` exporting a `createBrowserRouter(...)` object. No file-based routing — we want the tree visible in one place so the RBAC map above is auditable by eye.
- Layouts nest via `<Outlet />`: `AuthLayout` for `/login /forgot-password /reset-password/:token`, `AdminLayout` for everything authenticated, and a separate `PosLayout` mounted **outside** `AdminLayout` so POS runs full-screen (Bonyan did this correctly — keep it).
- **Lazy loading:** every feature page is `lazy()` + `<Suspense fallback={<RouteLoader />}>`. Route-level code splitting is the single biggest bundle-size win; `manualChunks` in Vite stays for `recharts`, `dexie`, `framer-motion`.

### 4.3 Guards

- `<RequireAuth>` — reads from `AuthBoundary` context (access token in memory + `/auth/me` prefetched by loader). Redirects to `/login?next=<original>` if unauthenticated.
- `<RequirePermission resource="..." action="...">` — reads the user's effective permissions (from `/auth/me`). Failing the check renders `/403`, not a redirect (back-button friendliness).
- `<RequireBranchContext>` — for branch-scoped screens (POS, inventory adjustments). If the user has multiple branch memberships and none is selected, redirects to a branch picker.

### 4.4 Error boundaries

Every route has an `errorElement`. The global boundary classifies the error envelope from the backend:
- `401` → clear auth and redirect to `/login`.
- `403` → `/403`.
- `404` → `/404`.
- `5xx` / network → `/offline` with a "retry" action that re-mounts the subtree.

### 4.5 Deep-link safety

- The `?next=` param is always validated against an allow-list of known internal paths before we redirect on post-login, so a crafted URL cannot bounce to an external site.
- POS deep links (`/pos?cart_client_uuid=...`) are honored only when the user has an open shift for the terminal.

---

## 5. API layer

### 5.1 Type generation

- Source of truth: `http://localhost:8000/openapi.json`.
- Tool: **`openapi-typescript`** (not `orval` initially — orval's runtime is heavier and we already like TanStack Query ergonomics as-is).
- Generated file: `web/src/api/generated/schema.ts`, **committed**, regenerated via `pnpm run codegen` which fails the build if the file is out of date in CI.
- A CI job runs `codegen` against the current backend and fails if `git diff --exit-code` detects drift.

### 5.2 HTTP client

Single file: `web/src/api/client.ts`. One Axios instance, one interceptor module. All feature `api.ts` files import typed helpers from here and **never** call `fetch` or `axios` directly.

Interceptor responsibilities (each has one job):

| Interceptor | Phase | Behavior |
|-------------|-------|----------|
| `attachAccessToken` | request | Reads from in-memory store (never from localStorage); adds `Authorization: Bearer <token>`. |
| `attachRequestId` | request | Generates `X-Request-ID: <uuid>` for correlation with backend audit. |
| `attachLocale` | request | Adds `Accept-Language: ar` or `en` from the i18n store. |
| `handle401Refresh` | response | On 401, calls `/auth/refresh` once with a lock (single-flight) and retries the original request; on second 401 clears auth and redirects to `/login`. |
| `handle403` | response | Never retries; surfaces a typed `PermissionDeniedError` so UI can show a friendly screen. |
| `handleRateLimit` | response | On 429, respects `Retry-After` header and surfaces it to the toast system. |
| `handle5xx` | response | Adds jittered exponential backoff retry **only for idempotent methods** (`GET`, `HEAD`). POST/PUT/DELETE fail fast (backend Idempotency-Key protects us elsewhere). |
| `mapErrorEnvelope` | response | Turns the backend `{error:{code, message, details}, request_id}` envelope into typed `ApiError` subclasses. |

### 5.3 TanStack Query defaults

`web/src/api/queryClient.ts`:

| Setting | Value | Why |
|---------|-------|-----|
| `queries.staleTime` | `30_000` ms | Balance chatter vs freshness. |
| `queries.retry` | `2` with `retry: (count, err) => !is4xx(err)` | Never retry 4xx. |
| `queries.refetchOnWindowFocus` | `true` | Operators alt-tab often; we want fresh data. |
| `queries.networkMode` | `'offlineFirst'` | POS and catalog pages stay usable when the network is flaky. |
| `queries.structuralSharing` | `true` | Already default; re-stated here for discoverability. |
| `mutations.retry` | `0` | Mutations carry Idempotency-Key only when we pass one; do not double-submit. |
| Key factory | `features/<domain>/queries.ts` | No magic strings inside components. |

### 5.4 Idempotency

- Every POST mutation that maps to a backend idempotency-aware endpoint (POS cart finalize, payment capture, invoice scan, sync envelope) carries `Idempotency-Key: <uuid>` minted on first attempt and reused across retries.
- POS deep contract is in `OFFLINE_POS.md` §4.8.

### 5.5 Environment configuration

- `web/.env.development`, `.env.staging`, `.env.production`.
- Only `VITE_*` variables are shipped to the browser. Non-`VITE_*` names are rejected by a Zod parse in `config/env.ts` so a misspelled var fails fast.
- Variables:
  - `VITE_API_BASE_URL` — defaults to `/api/v1` (Nginx proxies on the same origin in prod).
  - `VITE_ENVIRONMENT` — `dev` / `staging` / `prod`.
  - `VITE_SENTRY_DSN` — empty disables Sentry.
  - `VITE_POSTHOG_KEY` — optional.
  - `VITE_ENABLE_MOCK_API` — `true` swaps Axios base to MSW (dev-only).

### 5.6 Error → UI mapping

- `NotAuthenticatedError` → handled by `handle401Refresh`; never surfaces.
- `PermissionDeniedError` → `/403` route or inline `<PermissionGate />` fallback.
- `ValidationError` with `details.errors` (FastAPI RequestValidationError shape) → mapped field-by-field into the active React Hook Form.
- `ConflictError` → toast + optional conflict resolver drawer (used for POS offline sync conflicts).
- `ExternalServiceError` → toast with an "operation will be retried" message if backoff applies.
- `RateLimited` → toast with a countdown.
- Unknown / 5xx → toast + Sentry capture + `/offline` page with retry if persistent.

---

## 6. Design system

### 6.1 Tokens

All design decisions live in **`web/src/styles/tokens.css`** as CSS variables consumed by Tailwind via `theme.extend.colors = { primary: 'hsl(var(--primary))' }`. Tokens, not utility classes, are the stable interface.

Token families:
- **Color:** `--background`, `--foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--ring`, `--success`, `--warning`, sidebar-specific tokens. Each has a `.dark` override.
- **Radius:** `--radius-sm`, `--radius`, `--radius-lg`, `--radius-xl`.
- **Shadow:** `--shadow-sm` … `--shadow-xl` aligned to shadcn defaults.
- **Typography:** `--font-arabic` (Tajawal), `--font-latin` (Inter fallback for numerals).
- **Spacing:** Tailwind defaults (no custom scale) to keep grep-ability.

### 6.2 Component library

- **shadcn/ui components are copied in**, not installed as a package. This matches Bonyan's approach and gives us full ownership. Every component lives under `components/ui/<name>.tsx`.
- **Radix primitives** ship as direct deps; they are the behavioural backbone.
- **Custom components** live under `components/shared/` (e.g. `BranchPicker`, `MoneyInput`, `PermissionGate`, `ConfirmDialog`, `EmptyState`, `OfflineBadge`).
- **Icons:** `lucide-react` only. Other icon sources are banned by ESLint.

### 6.3 RTL support (end-to-end correctness)

- `<html dir="rtl" lang="ar">` by default; `dir` switches via the language toggle.
- **Only logical Tailwind utilities** allowed: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `rounded-s-*`, `rounded-e-*`, `text-start`, `text-end`. A custom ESLint rule bans physical utilities (`ml-*`, `mr-*`, `left-*`, `right-*`, `text-left`, `text-right`) outside of a short allow-list where the directional meaning is intentional (e.g. chart annotations).
- Numbers in the UI use `Intl.NumberFormat('ar-EG')` or `ar-SA` depending on `VITE_LOCALE_NUMBERS` (operator preference). Money formatting is in `lib/money.ts`, single source.
- Icons that imply direction (arrows, chevrons) are mirrored by a utility `<DirectionAwareIcon />` that flips when `dir="rtl"`.
- E2E fixture: every Playwright spec runs once in RTL and once in LTR to catch layout regressions.

### 6.4 Theming

- `next-themes` with `attribute="class"`, `defaultTheme="system"`, `storageKey="mezan-ui-theme"`.
- Dark mode overrides live in the same tokens file under `.dark { … }`.
- Charts consume token-derived colors via `hsl(var(--chart-1))` … `--chart-5` so switching theme does not require re-rendering.

### 6.5 Fonts

- **Tajawal** (400/500/700) as the primary Arabic face; **IBM Plex Sans Arabic** as fallback; **Inter** for Latin numerals inside mixed content.
- All self-hosted under `/public/fonts/` (no Google Fonts runtime fetch — privacy + offline) with `@font-face` in `styles/index.css` and `font-display: swap`.

### 6.6 Accessibility baseline

- `eslint-plugin-jsx-a11y` recommended preset is non-negotiable.
- All interactive elements reachable by keyboard; focus ring uses `--ring` token (never `outline: none` without a replacement).
- Color contrast checked by a Storybook a11y add-on in v2; v1 relies on shadcn tokens which are already compliant at the defaults.

---

## 7. Dashboard components (the heavy lifters)

### 7.1 DataTable

One canonical implementation: `components/shared/DataTable.tsx`, built on **TanStack Table v8** + shadcn primitives.

Features, all opt-in:
- Server-side pagination, sorting, and filtering driven by URL query params (`?page=`, `?sort=`, `?q=`). URL is source of truth so deep links work.
- Column visibility menu persisted per user in `localStorage` keyed by route path (persistence of **UI preference**, not data).
- Row selection (single + multi) with a footer action bar.
- Virtualization via `@tanstack/react-virtual` auto-enabled past 200 rows.
- Dense / compact / comfortable density toggle.
- Export buttons (CSV / XLSX) that call the backend's existing server-driven blob endpoints (we do **not** ship an xlsx builder to the client — matches Bonyan's correct decision).
- Skeleton + empty + error states first-class.
- Arabic column headers via i18n keys.

### 7.2 Charts

- `components/shared/charts/` wraps Recharts primitives with our tokens and Arabic number formatting.
- Chart types in scope for v1: line, area, bar, stacked bar, pie/donut, KPI card, heatmap (optional). Anything more exotic goes in v2.
- A shared `<ChartSkeleton>` and `<ChartError>` for loading / failure states.

### 7.3 Date & time

- `lib/date.ts` wraps `date-fns` with the active locale and timezone (`branch.timezone` when branch-scoped, otherwise user default).
- Date pickers: shadcn `Calendar` + `Popover`. No third-party date picker.
- All date math in the UI goes through `lib/date`; raw `new Date()` is banned by ESLint `no-restricted-syntax`.

### 7.4 Forms

- **React Hook Form + Zod** for every form. Shared `<Form />` wrapper provides field errors, submit pending state, disabled-on-submit, and a single "unsaved changes" prompt.
- **Money input** (`<MoneyInput />`): uses `decimal.js`, mirrors backend `q2` rounding, renders in `Intl.NumberFormat` with a hidden canonical string for RHF.
- **Branch & terminal pickers** come from `/auth/me` so RBAC is respected by construction.

### 7.5 Printing and PDF

- **Receipts (POS):** `react-to-print` + a ThermalReceipt template that honors 58mm and 80mm widths. Watermark `TMP-<uuid8>` while offline, stripped on reprint after sync (matches `OFFLINE_POS.md` §6.2).
- **Fiscal invoices / PO / payslips:** `@react-pdf/renderer`. Templates live under `features/<domain>/pdf/`. We deliberately do **not** embed `printingService.ts`-style untyped blobs (that was the single largest typing debt in Bonyan's audit).

### 7.6 Rich text

- Not required in v1. If we add it, use `tiptap` behind a lazy-loaded chunk so it does not hit first paint.

### 7.7 File upload

- Shared `<FileDrop />` using the native `File` + drag events (no third-party dep). For invoice scans, it calls the existing `POST /api/v1/invoice-scans` multipart endpoint directly.

---

## 8. Code quality & DX

### 8.1 TypeScript

- `strict: true` at the root `tsconfig.json` and every sub-config.
- `noImplicitAny`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` all on.
- `allowJs: false` (Bonyan mixed it on — close that door).
- Path alias `@/*` → `src/*`.

### 8.2 Lint

- ESLint 9 flat config, roughly the same shape as Bonyan's `eslint.config.js` plus:
  - `eslint-config-prettier` to silence formatter conflicts.
  - `eslint-plugin-boundaries` with feature-level rules: `features/*` cannot import `features/other-feature/*` directly.
  - A custom local rule banning physical-direction Tailwind classes outside the allow-list described in §6.3.
  - `no-restricted-imports` forbidding `axios` anywhere except `api/client.ts`.
  - `no-restricted-syntax` forbidding `new Date(` outside `lib/date.ts`.

### 8.3 Format

- Prettier with `prettier-plugin-tailwindcss`.
- Line length 100, same as the backend's Ruff config, so diffs look consistent across the repo.

### 8.4 Commit hygiene

- Husky `pre-commit`: `pnpm run lint:staged` + `pnpm run typecheck:changed`.
- Husky `commit-msg`: Commitlint with Conventional Commits (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `build`, `ci`).
- Husky `pre-push`: `pnpm run test -- --run` on affected packages.

### 8.5 Testing

| Layer | Tool | Target |
|-------|------|--------|
| Unit | Vitest | Pure functions in `lib/`, `api/errors`, tax/money helpers. |
| Hook | Vitest + RTL `renderHook` | Every hook in `features/*/hooks`. |
| Component | RTL + MSW | Every feature page's happy path + one failure path. |
| E2E | Playwright (Chromium + RTL + LTR sweeps) | POS checkout, payroll approval, GL posting visibility, offline-sync conflict resolver, login + refresh. |
| Coverage | Istanbul via Vitest | 60% statement on `features/*/hooks` and `features/*/api`. No artificial global target (Bonyan's ~9 tests across a huge surface is what we are escaping). |
| Mocking | MSW | Generated from `api/generated/schema.ts` so mocks stay type-safe; the same handlers are reused in Storybook (if/when added). |

### 8.6 Bundle discipline

- `rollup-plugin-visualizer` wired behind `pnpm run analyze`.
- CI fails if the main chunk exceeds 250 KB gzipped or any feature chunk exceeds 150 KB gzipped.
- `manualChunks` baseline splits: `recharts`, `dexie`, `framer-motion`, `@react-pdf/renderer`, `i18next`.

### 8.7 Storybook (v2, not v1)

- Introduced only after the `components/ui/` set stabilizes. Not a blocker for shipping features.

---

## 9. Security

All items here are additive guarantees on top of backend RBAC, which stays authoritative.

### 9.1 Token handling

- **Access token:** in memory only (a Zustand slice marked non-persisted). Never in `localStorage` or `sessionStorage`. This is the single most important rule we take from Bonyan's audit.
- **Refresh token:** httpOnly + Secure + SameSite=Lax cookie, set by the backend on login. The frontend never reads it; refresh is a credentialed `POST /auth/refresh` that returns a new access token.
- **CSRF:** for the refresh call (the only cookie-backed endpoint), the backend requires an `X-CSRF-Token` header that the frontend reads from a non-httpOnly sibling cookie named `XSRF-TOKEN`. Backend must set both on login.

> **DIVERGENCE (v1, Epic W-2 → Epic 15.3):** the backend at `app/api/v1/auth.py` currently returns the refresh token in the login/refresh response body and accepts it back in the request body on `/auth/refresh` and `/auth/logout`; it does not set or read a cookie. As a pragmatic pivot we ship the frontend with the refresh token stored in **`sessionStorage`** (key `VITE_SESSION_STORAGE_KEY_REFRESH`, default `mezan.auth.refresh`). Access-in-memory stays unchanged. The `<AuthBoundary />` replays the stored refresh on boot instead of calling a cookie-backed endpoint. Full rationale and the closing criteria live in [`DIVERGENCES.md`](DIVERGENCES.md) §D-1 and [`web/SECURITY.md`](web/SECURITY.md). When Epic 15.3 (backend) lands the cookie path, the frontend store and `AuthBoundary` switch back to the cookie flow in the same PR.

### 9.2 Auth boundary

- `AuthBoundary` provider on top of the tree reads the cookie by calling `POST /auth/refresh` on app boot. If successful, access token goes to memory and `/auth/me` is prefetched; if it fails, we redirect to `/login`.
- Logout calls `POST /auth/logout` (which invalidates the refresh), clears memory, and drops the query cache.

### 9.3 CSP and headers

- Nginx in front of the SPA sets:
  - `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' data:; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.sentry.io https://fcm.googleapis.com; frame-ancestors 'none'; form-action 'self'; base-uri 'self'`.
  - `Referrer-Policy: strict-origin-when-cross-origin`.
  - `X-Content-Type-Options: nosniff`.
  - `X-Frame-Options: DENY`.
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` in production only.
- `'unsafe-inline'` on `style-src` exists solely because Radix primitives inject inline styles; we accept that trade-off.

### 9.4 Input and output hygiene

- **DOMPurify** (added as a dep) sanitizes any backend-sourced HTML before render. In practice, almost nothing is HTML; this is a defense-in-depth.
- `innerHTML` / `dangerouslySetInnerHTML` banned by ESLint outside `lib/sanitize.ts`.
- Form input validation is Zod; ESLint requires a resolver on every `useForm`.

### 9.5 Secrets

- No runtime secret is shipped to the browser. `VITE_*` variables are public by definition; a README section in `web/README.md` says so explicitly.
- Sentry DSN and PostHog key are public by design (they are rate-limited per project).

### 9.6 Dependency hygiene

- `pnpm audit --prod` in CI; high/critical fails the build.
- **Runtime deps never in `devDependencies`.** Bonyan's `dexie` misclassification is called out in `OFFLINE_POS.md` §6.1 as a rule.
- `renovate.json` opens PRs weekly for non-major upgrades.

### 9.7 Logout everywhere

- Broadcast a `logout` event via `BroadcastChannel('mezan-auth')`; every open tab hears it and resets.
- Idle timeout: a Zustand slice listens for mouse/keyboard activity; after N minutes (read from `/auth/me.session_idle_timeout_minutes`), auto-logout.

---

## 10. Build & deploy

### 10.1 npm scripts (`web/package.json`)

| Script | Command | When |
|--------|---------|------|
| `dev` | `vite` | Local dev with HMR. |
| `codegen` | `openapi-typescript http://localhost:8000/openapi.json -o src/api/generated/schema.ts` | After any backend contract change. |
| `build` | `tsc -b && vite build` | CI + prod. |
| `preview` | `vite preview --port 4173` | Smoke-test prod build locally. |
| `lint` | `eslint .` | CI + pre-commit. |
| `format` | `prettier -w .` | Local only. |
| `typecheck` | `tsc -b --noEmit` | CI. |
| `test` | `vitest` | CI + pre-push. |
| `test:e2e` | `playwright test` | CI nightly + pre-release. |
| `analyze` | `vite build --mode analyze && rollup-plugin-visualizer` | On demand. |

### 10.2 Dev experience on the 8 GB target machine

- Recommended pattern: `docker compose up db api` for the backend, and `pnpm --filter web dev` **outside Docker** for the frontend. Vite dev server stays under ~300 MB RSS.
- `docker-compose.web.yml` exists as an **opt-in** file to bring `web` up in a container for CI parity; operators do not need it day-to-day.

### 10.3 Dockerfile (multi-stage)

1. `deps` stage — `node:22-bookworm-slim`, `pnpm install --frozen-lockfile`.
2. `build` stage — `pnpm run typecheck && pnpm run test -- --run && pnpm run build`.
3. `runtime` stage — `nginx:1.27-alpine` with `nginx.conf` that:
   - Serves `/` from `/usr/share/nginx/html`.
   - Sets CSP and security headers per §9.3.
   - Proxies `/api/v1/*` to the backend.
   - Rewrites all unknown GETs to `/index.html` (SPA routing).
   - Gzip/brotli enabled, long cache with hash-busting (`main.[hash].js`).

Target image size ≤ 50 MB (Nginx + static assets).

### 10.4 Environment strategy

| Environment | Frontend origin | Backend origin | Notes |
|-------------|-----------------|----------------|-------|
| dev | `http://localhost:5173` | `http://localhost:8000` | Vite proxy `/api/v1` → backend; no cookies across origins needed because the proxy makes them same-origin. |
| staging | `https://staging.mezan.example` | Same origin `/api/v1` | One container per service behind a single Nginx. |
| prod | `https://app.mezan.example` | Same origin `/api/v1` | Identical to staging; differs only in secrets and HSTS. |

Same-origin in staging/prod is a deliberate choice: it makes httpOnly refresh cookies work without CORS credential gymnastics.

### 10.5 CI/CD

GitHub Actions (`.github/workflows/web.yml`) on every PR touching `web/**` or `app/**/openapi*`:

1. **Install** — cache pnpm store.
2. **Codegen drift** — start backend in a service container, run `pnpm run codegen`, fail on `git diff --exit-code`.
3. **Lint** — `pnpm run lint`.
4. **Typecheck** — `pnpm run typecheck`.
5. **Unit** — `pnpm run test -- --run --coverage`.
6. **Build + bundle-size** — `pnpm run build`, then a size-gate script reads `dist/stats.json` and fails on breach.
7. **E2E (Playwright)** — on `main` pushes and release tags only (skipped on draft PRs to keep PR CI fast).
8. **Publish image** — on main and tags: build the Docker image and push to the project registry.

### 10.6 Hosting target

Primary: **Nginx alongside the backend** in the same Compose/K8s stack; same origin = clean cookie semantics. Secondary fallback for purely static hosting (Cloudflare Pages) is documented but not the default because our refresh-cookie strategy assumes same origin.

---

## 11. Delivery plan (epics keyed to `PROJECT_STATE.md` §5)

Each epic below is independently shippable and ordered so we never block on a dependency we have not built yet. Calendar time is intentionally not quoted here.

### W-1 — Foundations

Scaffold `web/` with every rule in §2–§4 baked in from commit one: Vite + TS strict + Tailwind + shadcn init, `next-themes`, Tajawal, i18next, router shell, Axios interceptor module, `openapi-typescript` wired to the backend, Husky + lint-staged + Commitlint + EditorConfig + `.nvmrc`, `AuthLayout` + `AdminLayout` + `PosLayout` skeletons, RBAC-aware `navigation.ts`, and the GitHub Actions workflow.

Exit: `pnpm dev` renders a login page, `pnpm build` passes, codegen produces real types against the running backend.

### W-2 — Auth and route guards

`login`, `forgot-password`, `reset-password/:token`, `onboarding/complete/:token`. `AuthBoundary`. `RequireAuth`, `RequirePermission`, `RequireBranchContext`. Refresh-token handling with the httpOnly cookie flow. 401/403/404/offline pages.

Exit: a real cashier user can log in, get a scoped sidebar, and be bounced to `/403` if they try to open `/admin/users`.

### W-3 — Design system hardening

`DataTable` built on TanStack Table v8, charts wrappers, `MoneyInput`, `BranchPicker`, `PermissionGate`, `EmptyState`, `ConfirmDialog`, `OfflineBadge`, form stack. Storybook deferred. RTL lint rule enforced and green across the tree.

Exit: a stub "/dashboard" screen uses the shared components and passes the a11y lint gate.

### W-4 — API layer completion

Every feature imports typed helpers; `ESLint no-restricted-imports` for raw `axios` turns on. Shared `queries.ts` key factory per feature. Error mapping tested against fixture responses. MSW handlers seeded so `pnpm test` works offline.

Exit: 100% of network calls go through `api/client.ts`.

### W-5 — Feature modules (ordered by daily-use priority)

Each sub-epic adds routes, pages, forms, queries, and a smoke test. Offline-first rules from `OFFLINE_POS.md` apply to the POS module.

1. **POS** — shift open/close, cart, tender, receipts, offline queue + sync UI. Consumes Epic 12 backend contracts.
2. **Catalog + inventory** — products, categories, price lists, stock, adjustments, transfers, scans.
3. **Purchasing** — POs, suppliers, goods receipts, invoice-match integration (Epic 14.4 UI).
4. **HR + payroll** — employees, attendance, leave, payroll runs, approvals.
5. **Accounting + fiscal** — journal, trial balance, income statement, balance sheet, GL, AR, AP, fiscal periods.
6. **CRM + marketing** — customers, loyalty, discounts, analytics, advisory, campaigns (Epic 14.3).
7. **AI advisory** — purchase reorder (14.1), HR anomalies (14.2), invoice match (14.4).
8. **BI dashboard** — executive KPIs.
9. **Admin** — users, roles, branches, terminals, backups, notifications (templates, schedules, runs).

### W-6 — Code quality gates

Coverage threshold wired in Vitest config; bundle-size gate in CI; `eslint-plugin-boundaries` turned on once directory conventions stabilize.

### W-7 — Security hardening

CSP rolled out in Nginx config, DOMPurify wiring, idle timeout, multi-tab logout broadcast, `pnpm audit` gate.

### W-8 — Build and deploy

Dockerfile + `docker-compose.web.yml` opt-in, Nginx config with CSP, environment switching doc, image publish job.

### W-9 — PWA and offline POS client

`vite-plugin-pwa` autoUpdate + manifest; Dexie schema and sync worker aligned with `OFFLINE_POS.md` §6; conflict resolver drawer; provisional receipt watermark; reprint of fiscal copy on sync completion.

### W-10 — Notifications client

Firebase web SDK wiring **for FCM only** (no Firestore, no Firebase Auth — hard rule from `PROJECT_STATE.md`). Device token registration on login via `POST /api/v1/notifications/device-tokens`; revocation on logout. In-app inbox reading from `GET /api/v1/notifications/deliveries/me` as a fallback channel.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Backend contract drifts from frontend types | CI codegen gate (§10.5 step 2) fails the PR. |
| RTL regressions | Lint rule banning physical utilities + E2E sweep in both directions. |
| Bundle bloat over time | Size gate in CI (§8.6). |
| Offline POS conflicts confuse cashiers | Conflict resolver UI + `OFFLINE_POS.md` §4.5 dispatch codes surfaced with localized messages. |
| Token theft via XSS | Access token in memory, httpOnly refresh, CSP, no `dangerouslySetInnerHTML` outside `lib/sanitize`, DOMPurify. |
| Dev machine RAM pressure (8 GB) | Frontend runs outside Docker in day-to-day dev. |
| New dev joins and cannot find the POS screen | Feature folder names match backend epics; `PROJECT_STATE.md` links both. |

---

## 13. Open questions (to close before starting W-1)

1. **Same-origin hosting** confirmed for staging and prod? If no, we must switch refresh to an Authorization-header rotation scheme and drop the httpOnly cookie path.
2. **Numeric locale** — `ar-SA` (Arabic with Hindu-Arabic numerals) or `ar-EG` (Arabic with Eastern Arabic numerals)? Both are implementable; we want one default per build.
3. **Weighable products at the POS terminal** — is a scale integration in scope for W-5.1 or deferred to a dedicated epic?
4. **Printer landscape** — 58 mm and 80 mm thermal receipts only, or also A4 fiscal invoices from the same screen?
5. **Feature flag source** — PostHog flags, backend-delivered config, or a local YAML? Pick one before building the AI advisor screens so hiding unfinished surfaces is uniform.

---

*This plan is authoritative for `web/`. Any deviation during implementation must update this file in the same PR.*

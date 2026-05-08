# Mezan — Project State

**Single source of truth** for what Mezan is, what is built, what is missing, what is planned, and what must be done next. This document consolidates planning across backend (FastAPI), web (React/TypeScript), and mobile (Flutter).

**Related operational docs** (kept standalone):
- [README.md](README.md) — Quick start and setup instructions
- [web/SECURITY.md](web/SECURITY.md) — Frontend security notes

---

## 1. Project Overview

**Mezan** is a cloud-ready ERP and retail management system built around a first-class **Point-of-Sale** engine and a **double-entry accounting** core. It serves multi-branch retailers with real-time inventory, fiscal-compliant invoicing, HR/payroll, and executive BI.

### Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Backend** | Python 3.12 + FastAPI + async SQLAlchemy 2.0 | Four-layer architecture: `api/` → `services/` → `models/` → `schemas/` |
| **Database** | PostgreSQL 15+ with Alembic migrations | `Numeric(14,4)` for money; UTC timestamps |
| **Packaging** | `uv` | Modern Python package manager |
| **Frontend** | React 18 + Vite 7 + TypeScript strict + Tailwind CSS | Arabic-first, RTL-first SPA |
| **Mobile** | Flutter (planned) | POS offline client + field operations |
| **Deployment** | Docker Compose (dev/staging/prod) | Healthchecks, multi-stage builds |
| **CI/CD** | GitHub Actions | Lint, test, build, deploy pipeline |

### Architecture Boundaries

**Backend layers (enforced):**
- `app/api/v1/` — HTTP routes only: request validation, dependency injection, response shaping. No business logic.
- `app/services/` — Business rules, transactional orchestration, external-provider adapters (payments, OCR, LLM, FCM, backups).
- `app/models/` — SQLAlchemy ORM definitions.
- `app/schemas/` — Pydantic request/response contracts.
- `app/core/` — Cross-cutting: configuration, error types, rate limiting.
- `app/db/` — Engine and session factory.
- `app/utils/` — Pure helpers (money, security, date).

**Frontend structure:**
- `web/src/features/<domain>/` — 1:1 mapping to backend epics
- `web/src/components/layout/` — Shell primitives (sidebar, topbar)
- `web/src/components/shared/` — Reusable page components (DataTable, forms)
- `web/src/styles/tokens.css` — CSS variable design tokens

---

## 2. Current Status Snapshot

### Backend Status
| Epic | Status | Key Deliverables |
|------|--------|------------------|
| 0-11 | Completed | Infrastructure, Identity, Catalog, POS, HR/Payroll, Accounting, CRM, AI Advisory, Backups |
| 12 | In Progress | Offline POS sync (backend contracts defined) |
| 13 | In Progress | Notifications (models complete, FCM hardening pending) |
| 14 | In Progress | AI expansion (4 advisors shipped, logging/rate-limit pending) |
| 15-17 | Planned | Security hardening, multi-currency, cash flow statement |

### Web Frontend Status
| Epic | Status | Key Deliverables |
|------|--------|------------------|
| W-1 to W-5 | Completed | Scaffold, routing, design system, API layer, feature modules (POS, catalog, inventory, purchasing, HR, payroll, accounting, CRM, BI, admin) |
| W-5.1 | Completed | Auth completion: login, forgot password, reset password, onboarding flows with polished UI matching design system |
| W-5 UI Reimplementation | Completed | Visual refresh of all feature modules using shared PageHeader, CreateButton, BackButton, SectionCard, FormContainer, FloatingFormDialog patterns |
| W-6 to W-10 | Planned | Quality gates, security, build/deploy, PWA/offline, notifications |

### Mobile/Flutter Status
| Epic | Status | Key Deliverables |
|------|--------|------------------|
| M-1 to M-5 | Not Started | Scaffold, auth, offline POS, attendance, field inventory |

### Documentation Status
| Document | Status | Action |
|----------|--------|--------|
| This file (PROJECT_STATE.md) | Active | Consolidated source of truth |
| README.md | Standalone | Quick start (operational) |
| web/SECURITY.md | Standalone | Frontend security notes |
| WEB_FRONTEND_PLAN.md | To be stubbed | Consolidated into this file §5 |
| OFFLINE_POS.md | To be stubbed | Consolidated into this file §4 |
| DIVERGENCES.md | To be stubbed | Consolidated into this file §3 |
| SYSTEM_REVIEW.md | To be stubbed | Technical debt merged into §3 |

---

## 3. Completed Work

### Backend Completed Epics (0-11)

#### Epic 0 — Infrastructure and DevOps
- [x] **0.1** FastAPI app and `uv` dependency management.
- [x] **0.2** Docker and Compose files for dev, staging, production.
- [x] **0.3** PostgreSQL plus Alembic migrations.
- [x] **0.4** CI/CD workflows (lint, tests, deploy pipeline).

#### Epic 1 — Identity, Access, Auditing
- [x] **1.1** Schema: users, branches, roles, permissions, terminals.
- [x] **1.2** Auth API (JWT access/refresh; SSO hooks in place).
- [x] **1.3** RBAC permission checks on routes (`app/api/deps.py`).
- [x] **1.4** Audit logging service.
- [x] **1.5** Global config, branches, POS terminal CRUD and authorization.
- [x] **1.6** Self-service profile updates (`PATCH /auth/me`): email uniqueness, `avatar_url`, optional password change with current-password verification.

#### Epic 2 — Master Catalog and Inventory Engine
- [x] **2.1** Hierarchical categories and dynamic attributes.
- [x] **2.2** Product catalog CRUD, barcode domain support.
- [x] **2.3** Purchase orders (draft/sent/tracked flow).
- [x] **2.4** Invoice scan pipeline (basic OCR provider).
- [x] **2.5** Manual override / validation for scanned invoices.
- [x] **2.6** Warehouse–store transfers with stock movements.
- [x] **2.7** Inventory operations: per-branch `inventory_policies` (reorder + preferred supplier), `stock_levels.damaged`, extended movement ledger (`movement_kind`, `reserved_delta`, `damaged_delta`, …), `apply_stock_movement_extended`, human movement service, enriched `GET /inventory/stock-on-hand`, reorder alerts + draft PO creation from alerts, product stock card API.

#### Epic 3 — Point of Sale
- [x] **3.1** Shifts: open float, cash events, close / Z-style variance.
- [x] **3.2** Temporary customer and QR / completion flow.
- [x] **3.3** Cart: lines, discounts, park / resume / state machine.
- [x] **3.4** Payment intents and capture (`in_store` and `mock` providers).
- [x] **3.5** Finalize paid cart → immutable sales invoice.
- [x] **3.6** Returns / exchanges (barcode, credit note path).

#### Epic 4 — HR and Payroll
- [x] **4.1** Employee profiles and weekly schedule CRUD.
- [x] **4.2** Clock in/out and leave request workflows.
- [x] **4.3** Payroll calculation (hours, rates, deductions).
- [x] **4.4** Bank-ready salary CSV export.
- [x] **4.5** User onboarding workflow (pending → HR completion → active).
- [x] **4.6** Pending employee requests page for HR approval.
- [x] **4.7** Per-employee performance, attendance, leave, and schedule tracking pages.
- [x] **4.8** Attendance & payroll SRS: RBAC `AttendancePayrollPolicy`, classified `AttendanceLog` fields, period engine with approved-leave exclusion, payslip breakdown (`base_salary_amount`, automatic/manual deductions, bonus, overtime, `calculation_details`, `paid_at`), payroll overview / approve-and-pay / policy APIs, HR attendance UI summary, payroll overview & deduction policy screens, leave self-service defaults and notification deep links to `/hr/leave`. **Monthly payroll workspace:** calendar-month period APIs (`GET/POST /payroll/periods/...`), batch prepare drafts, configurable approval open day (default 26th) enforced server-side for calendar months, PDF period export, simplified web navigation (overview primary; payslip history secondary).

#### Epic 5 — Accounting and Executive BI
- [x] **5.1** Chart of accounts, journal entries/lines with mandatory `branch_id`.
- [x] **5.2** Double-entry validation in `accounting_service.post_journal_entry`.
- [x] **5.3** Automated GL posting from POS sales, returns, goods receipts, payslips.
- [x] **5.4** Weighted-average inventory cost + product `standard_cost` fallback.
- [x] **5.5** Financial report APIs: trial balance, general ledger, income statement, balance sheet.
- [x] **5.6** Executive BI KPI endpoint (`/api/v1/bi/executive-kpis`).

#### Epic 6 — CRM and Marketing
- [x] **6.1** Loyalty points engine (accrual rules, manual adjustments).
- [x] **6.2** Discount rule engine (percentage, fixed, buy-X-get-Y).

#### Epic 7 — Identity Lifecycle and Security
- [x] **7.1** IT→HR user onboarding workflow.
- [x] **7.2** Fixed base role catalog with codes and system-seeded permissions.
- [x] **7.3** Per-user permission overrides (allow/deny).
- [x] **7.4** Session idle timeout on refresh token lifecycle.
- [x] **7.5** Native password reset hardening (single-use token).

#### Epic 8 — OCR Provider and Invoice Parsing
- [x] **8.1** Provider registry with configurable default OCR provider.
- [x] **8.2** `BasicOcrProvider` (QR JSON / key-value parsing + optional Tesseract).
- [x] **8.3** Deterministic `parse_extracted_invoice` normalization.

#### Epic 9 — In-Store Payment Recording
- [x] **9.1** Internal `InStoreLedgerProvider` (no external gateway dependency).
- [x] **9.2** Strict payment method validation (`cash` / `card` / `other`).
- [x] **9.3** Configurable default payment provider.

#### Epic 10 — Fiscal Controls and Subledger Accounting
- [x] **10.1** Fiscal periods with open/close controls and posting guard.
- [x] **10.2** Journal reversal workflow with source linkage.
- [x] **10.3** AR/AP open items and payment application subledgers.
- [x] **10.4** Extended accounting APIs for period lock, reversals, AR/AP operations.

#### Epic 11 — AI Advisory and Automated Backups
- [x] **11.1** Deterministic-facts marketing advisory service (SQL facts → prompt → validated JSON).
- [x] **11.2** Advisory API endpoint with RBAC.
- [x] **11.3** Automated backup service (`pg_dump`, retention, optional S3) with admin APIs.
- [x] **11.4** App startup background scheduler hook.

#### Hardening — Fix 14 — Branch Soft Delete
- [x] `branches.archived_at` migration `d8f1a2c3e4b5`.
- [x] List endpoint excludes archived by default (`include_archived` override).
- [x] `DELETE /branches/{id}` is idempotent soft delete with audit `branch.archived`.
- [x] `app/services/branch_scope` rejects archived branches for new operational entries.

### Web Frontend Completed Epics

#### Epic W-1 — Foundations and Layout
- [x] **W-1.1** Scaffold `web/` with Vite + TS strict, Tailwind, shadcn init, `next-themes`, Tajawal.
- [x] **W-1.2** `pnpm` setup at `web/package.json` (standalone, no workspace yet).
- [x] **W-1.3** `openapi-typescript` script wired to backend OpenAPI.
- [x] **W-1.4** Husky + lint-staged + Prettier + Commitlint + EditorConfig + `.nvmrc`.
- [x] **W-1.5** Axios wrapper with full interceptors and toast surface.
- [x] **W-1.6** `i18next` bootstrap with ar + en namespaces per feature.
- [x] **W-1.7** `AdminLayout`, `AuthLayout`, sidebar driven by `navigation.ts` config.

#### Epic W-2 — Routing and RBAC
- [x] **W-2.1** React Router with declarative nested routes + per-route lazy chunks.
- [x] **W-2.2** `RequireAuth`, `RequirePermission`, `RequireBranchContext`, `Can` components.
- [x] **W-2.3** 401/403/404/offline routes and boundaries.
- [x] **W-2.4** RBAC-driven sidebar trimming.

#### Epic W-3 — Design System
- [x] **W-3.1** Full shadcn/ui install (36 primitives, RTL-normalized).
- [x] **W-3.2** Light/dark tokens, design-token file, RTL logical utilities.
- [x] **W-3.3** `DataTable` component on TanStack Table v8 (URL-driven, virtualized, skeleton states).
- [x] **W-3.4** Shared `Form`, `Select`, `DateField`, `MoneyInput`, `AsyncSelect`, `UnsavedChangesPrompt`.
- [x] **W-3.5** App shell refresh — collapsible desktop sidebar, mobile Sheet nav, dashboard widget registry.

#### Epic W-4 — API Layer and Types
- [x] **W-4.1** Generated `schema.ts` + stable re-exports in `web/src/api/types.ts`.
- [x] **W-4.2** Thin per-feature `api.ts` modules using generated types.
- [x] **W-4.3** Query keys and cache policies centralized per feature.
- [x] **W-4.4** Mutation helpers + idempotency keys.

#### Epic W-5 — Feature Modules (1:1 to backend)
- [x] **W-5.2** POS web: `/pos` shell, `ShiftGate`, `PosRegister`, thermal receipts, offline queue stub.
- [x] **W-5.3** Inventory and catalog: products, categories, price lists, stock, adjustments, transfers.
- [x] **W-5.3.1** Inventory operations UI: stock workspace (KPI strip, search, reorder-only filter, PO-from-alerts), product stock card page, movement form (transaction types + `ProductSearch`), transfers with branch/product labels, receiving scans labels; manual TS API shapes until OpenAPI regen.

- [x] **W-5.4** Purchase orders + goods receipts + invoice scans.
- [x] **W-5.5** HR (employees, attendance, leave) + Payroll.
- [x] **W-5.5.1** Pending employee onboarding requests page.
- [x] **W-5.5.2** Employee detail pages with performance, attendance, leave, and schedule tracking.
- [x] **W-5.6** Accounting (journals, trial balance, financial reports) + Fiscal periods.
- [x] **W-5.7** CRM (loyalty, discounts) + Marketing advisory.
- [x] **W-5.8** Executive BI dashboard (`/dashboard` + Recharts KPIs + AI advisors).
- [x] **W-5.8.1** Role-specific `/dashboard` home (OWNER/ADMIN executive BI; accountant, marketing, IT, HR, staff surfaces) + `GET /employees/me/schedules` self-service + `/` redirects to `/dashboard`.
- [x] **W-5.9** Admin (users, roles, permissions, branches, terminals, backups, notifications).
- [x] **W-5.9.1** User creation form: always create pending onboarding, simplified field order.
- [x] **W-5.9.2** Enriched pending onboarding list with user details for HR review.
- [x] **W-5.9.3** Frontend error visibility hardening: backend validation and business-rule failures surface as field messages or actionable toasts.

#### Epic W-5 UI Reimplementation — Visual System Refresh
- [x] **W-5.UI.1** Shared UI foundation: `PageHeader`, `CreateButton`, `BackButton`, `FloatingFormDialog`, `ContentSurface`, `SectionCard`, `FormContainer` components.
- [x] **W-5.UI.2** Auth pages refreshed: `LoginPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `OnboardingCompletePage` with consistent card/dialog style, SPA `Link` navigation, error handling, success states.
- [x] **W-5.UI.3** CRUD list pages: `EmployeesList`, `ProductsList`, `CustomersList`, `UsersList`, `OrdersList`, `StockOnHand`, `JournalList` updated with `PageHeader` + `CreateButton` patterns.
- [x] **W-5.UI.4** Form pages: `EmployeeForm` updated with `PageHeader`, `BackButton`, `SectionCard`, `FormContainer` for consistent vertical rhythm.
- [x] **W-5.UI.5** Dashboard polish: `DashboardHomeFallback` updated with `PageHeader` component.
- [x] **W-5.UI.6** Frontend UI correction pass: dashboard chart/card usability, collapsed neutral sidebar, POS screen refresh, and floating dialogs for key product/user/employee actions.

---

## 4. Active Gaps and Technical Debt

### Backend Gaps

| Gap | Status | Risk Level | Resolution Path |
|-----|--------|------------|-----------------|
| **Money: `float` annotations on `Numeric` columns** | Active | High | Change `Mapped[float]` to `Mapped[Decimal]`; update Pydantic schemas; remove `float()` casts in services |
| **Stock movement commits inside loop** | Active | High | Flush movements, commit once at outer service |
| **`datetime.utcnow` defaults (deprecated)** | Active | Medium | Replace with `lambda: datetime.now(UTC)` |
| **CORS `*` with credentials in dev** | Active | Medium | Explicit trusted origins per environment |
| **Default `SECRET_KEY` in Compose** | Active | Medium | Fail-fast in prod if default detected |
| **No FIFO/LIFO cost layers** | Accepted | Low | Weighted-average is sufficient for v1 |
| **No multi-currency GL** | Planned | Medium | Epic 16 |
| **No cash flow statement** | Planned | Low | Epic 17 |

### Web Frontend Gaps

| Gap | Status | Risk Level | Resolution Path |
|-----|--------|------------|-----------------|
| **Auth completion (W-5.1)** | Completed | — | Login, forgot, reset, onboarding flows polished and complete |
| **ESLint 9 flat config full setup** | Open | Medium | W-6.1 |
| **Bundle size gates in CI** | Open | Medium | W-6.3 |
| **Access token in memory only** | Open | High | W-7.1 |
| **Refresh token in httpOnly cookie** | Open | High | W-7.2 (requires backend Epic 15.3) |
| **CSP headers** | Open | Medium | W-7.3 |
| **Dockerfile multi-stage** | Open | Medium | W-8.1 |
| **PWA + Dexie offline** | Open | High | W-9 (requires backend Epic 12) |
| **Notifications client** | Open | Medium | W-10 (in-app center + deep links shipped; FCM wiring pending) |

### Known Divergences (Plan vs Reality)

| ID | Divergence | Closing Action | Owner |
|----|------------|----------------|-------|
| **D-1** | Refresh token in `sessionStorage` not httpOnly cookie | Backend Epic 15.3 + Frontend W-7.2 | Backend |
| **D-2** | Dashboard permission is `analytics:read` not `bi:read` | None — correction applied | Web |
| **D-3** | Backups UI shows last run only, not history | Optional `GET /admin/backups/history` | Backend |
| **D-4** | AI advisory idempotency: client header only | Add Redis/DB idempotency store | Backend |
| **D-5** | Branch admin fields match model only | Extend model + migration if needed | Backend |
| **D-6** | Effective permissions client-computed | Optional read-only endpoint | Backend |

### System Review Risks (from SYSTEM_REVIEW.md)

| Risk | Mitigation |
|------|------------|
| Float arithmetic in money calculations | Urgent: Migrate to `Decimal` throughout |
| Non-atomic stock movement commits | Wrap in single transaction |
| Naive datetime defaults | Update to timezone-aware defaults |
| Dev CORS too permissive | Environment-specific origin lists |
| Hardcoded dev secrets | Production fail-fast validation |

---

## 5. TODO Plan

### Backend Plan (Epics 12-17)

#### Epic 12 — Offline POS Sync
Pattern: offline queue with idempotent server reconciliation.

- [ ] **12.1** Catalog bundle endpoint with ETag (`POST /api/v1/pos/offline/bundle/download`).
- [ ] **12.2** Envelope store + replay shell (`PosSyncSubmission`, `PosSyncOperation`).
- [ ] **12.3** Dispatchers for `cart_finalize` and `return` (adds `client_uuid` to `sales_invoices`, `sales_returns`).
- [ ] **12.4** Dispatchers for `shift_open`, `shift_close`, `cash_event`.
- [ ] **12.5** Conflict surface and resolver endpoints.
- [ ] **12.6** Observability: audit breadcrumbs, BI metrics.

**Models required:**
- `PosSyncSubmission` — envelope for terminal POSTs
- `PosSyncOperation` — individual operations (cart finalize, return, shift events)
- `PosOfflineBundleSnapshot` — immutable catalog bundle identifiers

**Key principles:**
1. Backend is single source of truth; client is durable queue + cache
2. Idempotency via `client_uuid` on every operation
3. Provisional identifiers (`TMP-<uuid>`) on client; official fiscal numbers at sync only
4. Deterministic money using `Decimal` with `ROUND_HALF_UP`
5. Sync order matters (event time, not submission order)

#### Epic 13 — Notification Scheduling and Delivery
- [x] **13.1-13.5** Models, provider registry, scheduling engine, built-in schedules, APIs.
- [ ] **13.6** FCM integration hardening (production credentials, stale-token pruning).
- [ ] **13.7** Web + Flutter client wiring.

#### Epic 14 — AI Advisory Expansion
- [x] **14.1-14.4** Purchase reorder, HR anomalies, marketing campaign, invoice-to-catalog matcher.
- [ ] **14.5** AI usage log and cost tracker.
- [ ] **14.6** Rate limiting on AI endpoints.
- [ ] **14.7** Response cache by facts-hash with TTL.

#### Epic 15 — Security Hardening
- [ ] **15.1** CSP / security headers middleware.
- [ ] **15.2** Refresh token rotation with replay detection.
- [ ] **15.3** httpOnly cookie option for refresh tokens (closes D-1).
- [ ] **15.4** Per-IP adaptive rate limits for authentication.

#### Epic 16 — Multi-Currency Accounting
- [ ] **16.1** FX revaluation at period close (AR/AP/bank).
- [ ] **16.2** Translated income statement and balance sheet.

#### Epic 17 — Cash Flow Statement
- [ ] **17.1** Indirect cash flow report from GL movements.

### Web Frontend Plan (Epics W-5.1, W-6 to W-10)

#### Epic W-5.1 — Auth Completion (Completed)
- [x] **W-5.1.1** Login page with form validation, error classification, token management, permissions fetch, and `next` redirect support.
- [x] **W-5.1.2** Forgot password flow with email submission, uniform backend response handling, success state with "check your inbox" messaging.
- [x] **W-5.1.3** Reset password with token validation, password + confirm fields, mismatch validation, success redirect to login.
- [x] **W-5.1.4** Customer onboarding completion with token-based profile setup.
- [x] **W-5.1.5** Visual polish: All auth screens use consistent centered card style matching UI reference, SPA `Link` navigation, RTL support, focus rings.
- [x] **W-5.1.6** Staff `/profile`: editable email, display name, phone, preferred language, avatar picture URL, optional password change (`PATCH /auth/me`), sidebar avatar preview.

#### Epic W-6 — Code Quality and DX
- [ ] **W-6.1** ESLint 9 flat with `typescript-eslint`, `jsx-a11y`, `simple-import-sort`.
- [ ] **W-6.2** Prettier with Tailwind plugin.
- [ ] **W-6.3** Bundle analyzer; chunk budgets in CI.
- [ ] **W-6.4** 60% statement coverage on `features/*/hooks` and `features/*/api`.

#### Epic W-7 — Security
- [ ] **W-7.1** Access token in memory only (never `localStorage`).
- [ ] **W-7.2** Refresh token in httpOnly cookie; CSRF protection.
- [ ] **W-7.3** CSP and standard security headers via Nginx.
- [ ] **W-7.4** DOMPurify for any HTML from backend.

#### Epic W-8 — Build and Deploy
- [ ] **W-8.1** Dockerfile multi-stage (build → Nginx).
- [ ] **W-8.2** `docker-compose.web.yml` for opt-in local run.
- [ ] **W-8.3** GitHub Actions: lint, typecheck, vitest, playwright, build, bundle-size.
- [ ] **W-8.4** Deployment targets documented.

#### Epic W-9 — PWA + Offline POS Client
- [ ] **W-9.1** `vite-plugin-pwa` with autoUpdate.
- [ ] **W-9.2** Dexie schema mirroring `OFFLINE_POS.md` §6.1.
- [ ] **W-9.3** Sync worker honoring §6.4.
- [ ] **W-9.4** Conflict resolver UI.
- [ ] **W-9.5** Offline-only rendering rules for POS.

#### Epic W-10 — Notifications Client
- [ ] **W-10.1** Firebase web SDK wiring (FCM only, no Firestore).
- [ ] **W-10.2** Device token registration on login; revocation on logout.
- [x] **W-10.3** In-app notification center.

### Flutter/Mobile Plan (Epics M-1 to M-5)

#### Epic M-1 — Flutter Scaffold
- [ ] Project setup with Flutter 3.x
- [ ] Navigation structure (GoRouter)
- [ ] State management (Riverpod or Bloc)
- [ ] Theme system (light/dark, RTL)

#### Epic M-2 — Auth
- [ ] JWT in secure enclave (Flutter Secure Storage)
- [ ] Refresh token rotation
- [ ] Biometric login option

#### Epic M-3 — POS Offline Client
- [ ] SQLite local database schema
- [ ] Offline cart lifecycle (matches web POS)
- [ ] Sync queue mirroring Dexie contract
- [ ] Conflict resolution UI

#### Epic M-4 — Attendance
- [ ] Clock in/out with GPS verification
- [ ] Leave request submission
- [ ] Photo capture for clock events

#### Epic M-5 — Field Inventory
- [ ] Stock count entry
- [ ] Transfer receive confirmation
- [ ] Barcode scanning (camera)

---

## 6. Standards and Operating Rules

### Backend Standards

1. **Four-layer separation:** Routes call services; services use models; schemas validate I/O.
2. **No business logic in `api/`:** Only validation, DI, and response shaping.
3. **Money as `Decimal`:** Never use `float` for monetary values.
4. **Async everywhere:** SQLAlchemy 2.0 async with proper session scoping.
5. **Idempotency keys:** All mutating endpoints accept `Idempotency-Key` header.
6. **RBAC enforcement:** Every route has `require_permission` dependency.
7. **Audit logging:** All changes logged with `request_id` for tracing.

### Frontend Standards

1. **RTL-first:** Use logical Tailwind utilities only (`ms-*`, `me-*`, `ps-*`, `pe-*`).
2. **Feature 1:1 to backend:** `features/<domain>/` mirrors backend epics.
3. **No cross-feature imports:** Shared code goes through `components/shared/` or `lib/`.
4. **Tokens in CSS:** `web/src/styles/tokens.css` is source of truth for colors, spacing, radii.
5. **Server state in TanStack Query:** No hand-rolled Axios outside `api/client.ts`.
6. **UI state in Zustand:** Never persist auth tokens.
7. **Forms with RHF + Zod:** Every non-trivial form uses React Hook Form with Zod resolver.

### Design System and Mockup SOP

When converting UI mockups (PDF/PNG) to implementation:

1. **Inventory (operations redesign):** Routes — `/inventory/stock` (dashboard + browser, URL filters `branch_id`, `category_id`, `q`, `reorder_only`), `/inventory/stock/:productId` (stock card), `/inventory/adjustments` + `/new` (movements ledger + human movement form → `POST /inventory/movements`), `/inventory/transfers` (+ `/new`, `/:id`), `/inventory/scans` (receiving). Backend — `GET /inventory/stock-on-hand` (enriched row), `GET/PATCH /inventory/policies/{branch_id}/{product_id}`, `GET /inventory/reorder-alerts`, `POST /inventory/reorder-alerts/create-purchase-order`, `GET /inventory/products/{id}/stock-card`, `POST /inventory/movements`; models `inventory_policies`, `stock_levels.damaged`, extended `stock_movements` metadata (Alembic `e1f2a3b4c5d6`, `f7a8b9c0d1e2`). Reuse patterns: `PageHeader`, `DataTable`, `ProductSearch`, `BranchStockFilterBar`, payroll-style `queryOptions` in `inventory/queries.ts`.
2. **Pattern identification:** Identify repeated UI patterns before creating new components.
3. **Token extraction:** Compare visual tokens to `tokens.css`; document proposed changes separately.
4. **HCI review:** Check contrast, focus states, empty states, error states, touch targets.
5. **Component mapping:** Map to shared components or justify feature-local ones.
6. **UML update:** Update diagrams only for new reusable boundaries.
7. **Handoff notes:** File ownership, manual commands, unresolved decisions.

### Documentation Ownership Rules

| Document Type | Authority | Update Trigger |
|-----------------|-----------|----------------|
| `PROJECT_STATE.md` (this file) | Single source of truth | Any scope/status change |
| `README.md` | Operational quick start | Setup process changes |
| `web/SECURITY.md` | Frontend security details | Security implementation changes |
| Planning stubs | Pointers to this file | When consolidation changes |
| Inline code comments | Implementation details | Code changes |

---

## 7. Verification Commands

### Backend Commands (Manual Only)

```bash
# Linting
uv run ruff check . --fix

# Testing (requires TEST_DATABASE_URL)
uv run pytest -q

# Migrations
uv run alembic upgrade head

# Type checking (via Ruff or mypy if configured)
uv run ruff check --select ANN
```

### Web Frontend Commands (Manual Only)

```bash
cd web

# Install dependencies
pnpm install

# Development server
pnpm dev

# Linting
pnpm run lint

# Type checking
pnpm run typecheck

# Build
pnpm run build

# Tests
pnpm run test

# Bundle analysis
pnpm run analyze
```

### Flutter/Mobile Commands (Manual Only)

```bash
cd mobile

# Get dependencies
flutter pub get

# Run (with device connected)
flutter run

# Build APK
flutter build apk

# Tests
flutter test

# Lint
flutter analyze
```

---

## 8. Conventions for Updating This File

- **When a task ships:** Flip `[ ]` to `[x]` in the same PR that introduces the code.
- **When an epic completes:** Move from §5 to §3 (Completed) with same numbering.
- **When debt is paid:** Move from §4 to relevant epic as a Hardening entry.
- **When a wish graduates:** Move from wishlist to §5 with numbered ID.
- **Never silently delete:** Mark cancelled with one-line reason if dropped.

---

*Last consolidated: May 2026. See git history for per-section changes.*

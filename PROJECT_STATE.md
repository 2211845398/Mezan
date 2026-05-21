# Mezan — Project State

**Single source of truth** for what Mezan is, what is built, what is missing, what is planned, and what must be done next. This document consolidates planning across backend (FastAPI), web (React/TypeScript), and mobile (Flutter).

**Related operational docs** (kept standalone):
- [README.md](README.md) — Quick start and setup instructions
- [web/SECURITY.md](web/SECURITY.md) — Frontend security notes
- [GAP_REPORT.md](GAP_REPORT.md) — Phase 1 audit findings with numbered gap IDs (`GAP-POS-*`, `GAP-CAT-*`, `GAP-INV-*`, `GAP-PUR-*`, `GAP-ACC-*`, `GAP-CRM-*`, `GAP-AI-*`)
- [.cursor/plans/mezan_system_restructure_ee9ca47f.plan.md](.cursor/plans/mezan_system_restructure_ee9ca47f.plan.md) — Active restructure plan (3 phases + recommendations)

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
| 14 | Completed | AI advisors: usage logging, per-user rate limits, response cache, LLM `usage` tokens |
| 15-17 | Planned | Security hardening, multi-currency statements (16.2 pending), cash flow statement |

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
- [x] **2.2** Product catalog CRUD, barcode domain support, catalog tax definitions and product tax links (parallel rates; POS uses effective rate).
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
- [x] **W-5.3.2** Catalog tax definitions (`/catalog/taxes`), product multi-tax links, effective VAT on POS from definitions.

- [x] **W-5.4** Purchase orders + goods receipts + invoice scans.
- [x] **W-5.5** HR (employees, attendance, leave) + Payroll.
- [x] **W-5.5.1** Pending employee onboarding requests page.
- [x] **W-5.5.2** Employee detail pages with performance, attendance, leave, and schedule tracking.
- [x] **W-5.6** Accounting (journals, trial balance, financial reports) + Fiscal periods.
- [x] **W-5.7** CRM (loyalty, discounts) + Marketing advisory.
- [x] **W-5.8** Executive BI dashboard (`/dashboard` + Recharts KPIs + AI advisors).
- [x] **W-5.8.1** Role-specific `/dashboard` home (OWNER/ADMIN/MARKETING_MANAGER → executive BI; accountant, IT, HR, staff surfaces) + `GET /employees/me/schedules` self-service + `/` redirects to `/dashboard`.
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
| **No multi-currency GL** | Addressed (Epic 20.1–20.2, 24.1–24.2); currency master UI + AR/AP revaluation |
| **No currency / payment-terms admin UI** | Closed (Epic 24) |
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
| **Phase 3 frontend restructure** | Completed | — | POS overhaul, transfer Kanban, price-less purchasing/product forms, customer performance, marketing charts, and accounting operations workspace |

### Known Divergences (Plan vs Reality)

| ID | Divergence | Closing Action | Owner |
|----|------------|----------------|-------|
| **D-1** | Refresh token in `sessionStorage` not httpOnly cookie | Backend Epic 15.3 + Frontend W-7.2 | Backend |
| **D-2** | Dashboard permission is `analytics:read` not `bi:read` | None — correction applied | Web |
| **D-3** | Backups UI shows last run only, not history | Optional `GET /admin/backups/history` | Backend |
| **D-4** | AI advisory idempotency: client header only | Add Redis/DB idempotency store | Backend |
| **D-5** | Branch admin fields match model only | Extend model + migration if needed | Backend |
| **D-6** | Effective permissions client-computed | Optional read-only endpoint | Backend |
| **D-7** | No `product_variants` model — color/size variants conflated under one product | Epic 18 (Variants & Catalog Restructure) | Backend |
| **D-8** | Money type system still has `Mapped[float]` in some models — accounting precision risk | Epic 19.1 (Money → Decimal pass) | Backend |
| **D-9** | Chart of Accounts has no enforced depth limit (spec asks for 5 levels) | Closed via Epic 19.2 posting + tree validation | Backend |
| **D-10** | Branch chart inheritance is implicit via `branch_id` on journal lines; not surfaced in reports | Closed via Epic 19.7 branch TB/IS/BS + snapshot API + CoA-by-branch | Backend + Web |
| **D-11** | `subledger_service._d()` accepts `float` — boundary parsing risk | Epic 19.1 (Money type system) | Backend |

See [GAP_REPORT.md](GAP_REPORT.md) for the full numbered gap list (67 findings across 7 modules).

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
- [x] **14.5** AI usage log and cost tracker.
- [x] **14.6** Rate limiting on AI endpoints.
- [x] **14.7** Response cache by facts-hash with TTL.

#### Epic 15 — Security Hardening
- [ ] **15.1** CSP / security headers middleware.
- [ ] **15.2** Refresh token rotation with replay detection.
- [ ] **15.3** httpOnly cookie option for refresh tokens (closes D-1).
- [ ] **15.4** Per-IP adaptive rate limits for authentication.

#### Epic 16 — Multi-Currency Accounting
- [x] **16.1** FX revaluation at period close (AR/AP) — implemented as Epic **20.2** (`fx_revaluation_service`, `/accounting/fx-revaluation/*`).
- [ ] **16.2** Translated income statement and balance sheet.

#### Epic 17 — Cash Flow Statement
- [ ] **17.1** Indirect cash flow report from GL movements.

#### Epic 18 — Product Variants & Catalog Restructure
Resolves `D-7`, `GAP-CAT-005..007`, `GAP-INV-007`. Blocking dependency for Epic 19 GL accuracy on multi-variant items.

- [x] **18.1** New `product_variants` model: `(id, product_id, sku UNIQUE, barcode, attribute_values JSONB, active, created_at, updated_at)`.
- [x] **18.2** Phased Alembic migration: add nullable `variant_id` to `stock_movement`, `stock_level`, `branch_product_costs`, `pos_cart_line`, `sales_invoice_line`, `purchase_order_line`, `goods_receipt_line`, `transfer_line`, `sales_return_line`.
- [x] **18.3** Backfill script [`backfill_product_variants.py`](app/scripts/backfill_product_variants.py): creates one variant per existing product, points all movement rows to it. Idempotent — safe to run multiple times.
- [x] **18.4** Run backfill script in production; verify counts match (2 variants created for 2 products).
- [x] **18.5** NOT NULL migration created: [`7e8d9f2a3b4c_make_variant_id_not_null.py`](alembic/versions/7e8d9f2a3b4c_make_variant_id_not_null.py). **Apply with:** `uv run alembic upgrade head`
- [x] **18.6** Enforce CoA depth = 4 on categories with `_get_category_depth()` validation in `create_category()` and `update_category()` (`GAP-CAT-001..002`).
- [x] **18.7** Enforce enum/select attribute values server-side in `_validate_product_attributes()` with `select`/`multiselect` type validation (`GAP-CAT-003`).
- [x] **18.8** Attribute-based product filter API: `filter_products_by_attributes()` service + `POST /catalog/products/filter-by-attributes` endpoint (`GAP-CAT-004`).
- [x] **18.9** Remove `standard_cost` and `sell_price` from product form (frontend task); pricing via Purchase Invoice / Price List.
- [x] **18.10** Variant-aware product detail API: `GET /catalog/products/{id}/with-variants` returns product with variants, stock per variant, last cost per variant.
- [x] **18.11** Variant wiring (Phase 2 Workstream B): session-scoped cache in `resolve_default_variant_id`; POS cart lines keyed by `(product_id, variant_id)`; optional `variant_id` on cart upsert / stock adjustment / PO lines; WAVG `apply_receipt_to_weighted_average` and transfer receive use explicit variant; GL (`post_sales_invoice_gl`, `post_sales_return_gl`, `post_transfer_batch_receive_gl`) uses per-line variant for COGS / inventory at source WAVG.
- [x] **18.12** Default variant on product create (`create_product` → `ProductVariant` with `_default` marker); `GET /api/v1/product-variants/search` for purchasing line pickers; `GET /api/v1/products?branch_id=&in_stock_only=` for POS sellable grid; PO service validates explicit `variant_id` matches `product_id`.
- [x] **18.13** Relational variant axes: `attributes`, `attribute_values`, `product_variant_attributes`; `category_attribute_defs.attribute_id` + `use_for_variants` (migration `j3k4l5m6n7o8`).
- [x] **18.14** Catalog attribute master API: `GET/POST /catalog/attributes`, values CRUD, pivot backfill script.
- [x] **18.15** Variant generator: `variant_combinator`, `POST .../variants/preview-generate`, `POST .../variants/sync`; search by `attribute_value_id`.
- [x] **18.16** `ProductFormPage` Odoo-style tabs (product data | attributes): creatable axis lines, auto-generate on save, variants grid on edit; catalog dictionary admin at `/admin/catalog-attributes`; `validate_catalog_axes` + inventory-activity guard on sync.

#### Epic 19 — Accounting Core Hardening
Resolves `D-8..11`, all `GAP-ACC-*`, `GAP-INV-005`, `GAP-AP-payment`. The largest backend epic of Phase 2.

- [x] **19.1** Money → Decimal pass — tighten `subledger_service._d` signature to reject `float`; remove `float(sell_price)` cast in `catalog_service._sync_compat_price`. SQLAlchemy models and Pydantic schemas already use `Decimal`. See commit log for Epic 19.1.
- [x] **19.2** CoA hardening: enforce 5-level depth, parent/child type consistency, account-id existence/active/postable validation in `post_journal_entry` (`GAP-ACC-001..002, 005..006`).
- [x] **19.3** Opening balance GL `post_opening_balance_gl` in [`opening_balance_service.py`](app/services/opening_balance_service.py); APIs `POST /accounting/opening-balance`, `.../capital-injection`, `.../initial-inventory` (`GAP-ACC-007`).
- [x] **19.4** Generic Voucher service [`post_voucher_gl()`](app/services/voucher_service.py) + entity resolution (Customer→AR, Supplier→AP, Cash, Expense) + schemas [`vouchers.py`](app/schemas/vouchers.py). API endpoints and UI forms pending (W-13.2).
- [x] **19.4b** Phase 2 Workstream C (vouchers & GL hygiene): voucher wrappers forward `idempotency_key` / `user_id`; API passes `expense_account_id` and transfer `from_cash_account_id` / `to_cash_account_id`; `post_journal_entry` persists optional `currency_code` / `transaction_amount` / `fx_rate` on lines; `post_voucher_gl` forwards FX fields; POS expenses use `shift_service.add_cash_event`, resolved expense account, no service-level commit; inventory adjustment GL routes shortage/damaged/count_loss and gain via new nullable settings FKs; FX revaluation loss account chain uses `default_other_expenses_account_id` (no invalid `default_other_income` default).
- [x] **19.5** AP payment GL `post_ap_payment_gl` symmetric to AR (`GAP-ACC-009`).
- [x] **19.6** Inventory adjustment GL `post_inventory_adjustment_gl` driven by WAVG/FIFO (`GAP-INV-005`, `GAP-ACC-010`).
- [x] **19.7** Branch-aware reports — surface roll-up/roll-down by branch in trial balance, income statement, balance sheet (`D-10`).
- [x] **19.7a** CoA tree annotated with branch balances: `GET /accounting/chart-accounts/by-branch/{branch_id}` (partial `D-10` surfacing).
- [x] **19.8** Soft-close fiscal period state machine: `open → soft_closed → closed` (and `soft_closed → open`); `ensure_period_open` blocks normal GL in `soft_closed`; journal reversals use `allow_in_soft_close` (`GAP-ACC-013`).
- [x] **19.9** Chart of Accounts admin backend: tree editor API (`/accounting/chart-accounts/tree`), CRUD endpoints, drag-drop move support, depth/type validation (`GAP-ACC-003`).
- [x] **19.10** Frontend AP/AR drawers / accounting operations workspace (frontend task); backend GL posting confirmed working via `voucher_service.py`.

#### Epic 24 — Currencies, Supplier UX, Payment Terms
- [x] **24.1** Currency master API: `GET/POST/PATCH /accounting/currencies`, rate update, `GET/PATCH /accounting/settings` (base currency with AR/AP guards).
- [x] **24.2** Web: `/accounting/currencies`, `CurrencySelect`, navigation + i18n; FX operations link to currency management.
- [x] **24.3** Supplier form: remove manual code field; server `SUP-######` generation; `currency_code` picker; payment terms from master API.
- [x] **24.4** Payment terms master: table `payment_terms`, API, `/accounting/payment-terms` UI; AP `due_date` derived from supplier terms on `create_ap_open_item`.

#### Epic 20 — Multi-Currency, Production Orders, FIFO
- [x] **20.1** Multi-currency journal lines: add `currency_code`, `transaction_amount`, `fx_rate` columns (`GAP-ACC-012`).
- [x] **20.2** FX revaluation service at period close — revalue open AR, AP, bank balances; post Dr/Cr FX Gain/Loss (`GAP-ACC-011`, supersedes original Epic 16.1).
- [ ] **20.3** Bill of Materials + Production Orders module (`GAP-ACC-014`):
  - `bill_of_materials(id, finished_variant_id, revision, name, status, ...)`
  - `bom_component(id, bom_id, component_variant_id, qty_per, scrap_pct, seq)`
  - `production_order(id, bom_id, branch_id, qty, status, posted_at, ...)`
  - Cost rollup: Σ(component_qty × current_cost) → finished `unit_cost`.
  - GL: Dr WIP / Cr Inventory at issue; Dr Finished / Cr WIP at completion.
- [x] **20.3a** BoM REST CRUD: `POST/GET/PATCH/DELETE /production/boms`, `POST .../boms/{id}/lines` ([`bom_service.py`](app/services/bom_service.py), [`production_orders.py`](app/api/v1/production_orders.py)); WIP GL uses `default_wip_account_id` when set.
- [x] **20.4** FIFO cost layers (`GAP-INV-006`): `inventory_cost_layers` + `inventory_valuation_policy` in settings; GR creates layers when policy=`fifo`; POS COGS consumes FIFO layers when policy=`fifo`; WAVG path unchanged.

#### Epic 21 — POS Data & Workflow Hardening
Resolves all `GAP-POS-*` data/contract gaps. Frontend POS overhaul lives in Epic W-11.

- [x] **21.1** `pos_carts.daily_cart_number` column + per-branch-per-day sequence in `create_cart` (`GAP-POS-018..019`).
- [x] **21.2** Validate `shift_id` belongs to terminal and is open in `create_cart` (`GAP-POS-007`).
- [x] **21.3** Record `PosCashEvent` of type `sale` on every cash tender (`GAP-POS-006`).
- [x] **21.4** `pos_expenses` table + API + GL posting (Dr Other Expenses / Cr Cash) for shift expenses (`GAP-POS-016`).
- [x] **21.5** `PATCH /pos/carts/{id}` to set `customer_id` for receivables tracking (`GAP-POS-022`).
- [x] **21.6** New tender method `transfer` + clearing-account routing in `post_sales_invoice_gl` (`GAP-POS-015`).
- [x] **21.7** Parked carts listing endpoint `GET /pos/carts?status=parked&terminal_id=...` (`GAP-POS-003`).
- [x] **21.8** Cart line delete endpoint (or accept `qty=0`) to support minus-at-qty-1 removal (`GAP-POS-013`).
- [x] **21.9** Loyalty purchase accrual in `finalize_paid_cart` via `loyalty_dsl_service` (category slugs + weekend flag) (`GAP-CRM-004`).

#### Epic 22 — CRM Performance & Loyalty DSL
Resolves `GAP-CRM-001..003`.

- [x] **22.1** `customer_performance` API: AOV, top products, basket trend, LTV, last visit, total spend, debt (open AR), exchanges (90d) via `exchange_links`.
- [x] **22.2** `/crm/customers/:id/performance` page mirroring HR employee performance UX.
- [ ] **22.3** Loyalty rule DSL: add `rule_config JSONB` + evaluator with `when`/`then` shape; UI rule builder.

#### Epic 23 — AI Hardening (supersedes 14.5–14.7)
Resolves `GAP-AI-001..009`.

- [x] **23.1** `ai_usage_log` table; persist endpoint, model, tokens, estimated cost from LLM `usage` payload.
- [x] **23.2** Apply `slowapi` rate limit to all AI advisory routes.
- [x] **23.3** Response cache by hash of input `facts` with TTL.
- [x] **23.4** Drill-down UX: marketing/customer insight cards expose underlying metrics and action detail in manager-friendly panels.
- [x] **23.5** HR anomalies "last month" preset + default.
- [x] **23.6** Marketing analytics page: Recharts visualizations replacing count-card-only view.

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

#### Epic W-11 — POS Screen Overhaul
Resolves all `GAP-POS-*` frontend gaps. Depends on Epic 21 backend contracts.

- [x] **W-11.1** Nest POS routes under `AdminLayout` (shared sidebar) — `GAP-POS-001`.
- [x] **W-11.2** Top bar: branch name, live clock, employee name, logout, real parked-invoices modal, today's sales button — `GAP-POS-002..004`.
- [x] **W-11.3** Auto-navigate from `ShiftGate` to `/pos/register` on shift open — `GAP-POS-005`.
- [x] **W-11.4** Product grid (right column): virtualized/search grid, double-click +1, minus removes line at qty=1 — `GAP-POS-009..013`.
- [x] **W-11.5** Control rail (middle column): split payment methods vs cash/transfer payment buttons, discount code field with role gating — `GAP-POS-014..017`.
- [x] **W-11.6** Cart panel (left column): daily cart number, return-mode toggle with `data-mode="return"` color shift, exchange wiring, customer picker functional — `GAP-POS-018..022`.
- [x] **W-11.7** Branch label surfaced in the POS topbar and payment receipt context — `GAP-POS-008`.
- [x] **W-11.8** POS toolbar: shift drawer movement dialog (posted expense vs non-sale cash-in) wired to `/pos/expenses` and shift cash-events; CRM customer performance tab lists per-document open AR and opens apply-payment drawer with CRM cache refresh.

#### Epic W-12 — Inventory / Purchasing UX Restructure
- [x] **W-12.1** Transfers 3-column Kanban (Delivery Requests / In Transit / Delivered) — `GAP-INV-001`.
- [x] **W-12.2** Role-gated dispatch/receive buttons (sender manager vs receiver manager) — `GAP-INV-002`.
- [x] **W-12.3** Pre-transfer availability check feedback in the request form — `GAP-INV-003`.
- [x] **W-12.4** Price-less Purchase Order form (no `unit_cost` field) — `GAP-PUR-001`.
- [x] **W-12.5** Purchase Invoice page that converts a confirmed PO into a priced invoice with variants — `GAP-PUR-002`.

#### Epic W-13 — Accounting UI Overhaul (Odoo/Manager.io style)
- [x] **W-13.1** Chart of Accounts admin tree editor — `GAP-ACC-003`.
- [x] **W-13.2** Generic Voucher (receipt / payment) wizard — `GAP-ACC-008`.
- [x] **W-13.3** Opening Balance screen — `GAP-ACC-007`.
- [x] **W-13.4** FX Revaluation runs screen — `GAP-ACC-011`.
- [x] **W-13.5** Inventory adjustment posting impact display — `GAP-ACC-010`.
- [x] **W-13.6** Fiscal period soft-close UI — `GAP-ACC-013`, `GAP-ACC-016`.
- [x] **W-13.7** Production Orders (BoM) UI — `GAP-ACC-014`.

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

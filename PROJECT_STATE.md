# MEZAN — Project state

**MEZAN** is a cloud-ready ERP and retail backend: FastAPI, SQLAlchemy 2.0, PostgreSQL, Alembic, Docker, `uv`. Architecture: `api/v1` (routes), `services` (logic), `models` (ORM), `schemas` (Pydantic).

---

## Completed epics (0–6)

### Epic 0: Infrastructure & DevOps

- [x] **0.1** — FastAPI app, `uv` dependency management
- [x] **0.2** — Docker / Compose (dev, staging, prod compose files)
- [x] **0.3** — PostgreSQL + Alembic migrations
- [x] **0.4** — CI/CD workflows (lint, tests, deploy pipeline present)

### Epic 1: Identity, access, & auditing

- [x] **1.1** — Schema: users, branches, roles, permissions, terminals, etc.
- [x] **1.2** — Auth API (JWT-style access; extend for full SSO when needed)
- [x] **1.3** — RBAC / permission checks on routes (`deps.py`)
- [x] **1.4** — Audit logging service
- [x] **1.5** — Global config, branches, POS terminal CRUD / authorization

### Epic 2: Master catalog & inventory engine

- [x] **2.1** — Hierarchical categories + dynamic attributes
- [x] **2.2** — Product catalog CRUD; barcode support in domain
- [x] **2.3** — Purchase orders (draft/sent/tracked flow)
- [x] **2.4** — Invoice scan pipeline wired; **OCR provider is a mock** (see gaps)
- [x] **2.5** — Manual override / validation path for scanned invoices (API + service)
- [x] **2.6** — Warehouse–store transfers with stock movements

### Epic 3: Point of sale (POS)

- [x] **3.1** — Shifts: open float, cash events, close / Z-style variance
- [x] **3.2** — Temporary customer + QR / completion flow
- [x] **3.3** — Cart: lines, discounts, park / resume / state machine
- [x] **3.4** — Payment intents + capture; **provider is mock** (see gaps)
- [x] **3.5** — Finalize paid cart → immutable sales invoice
- [x] **3.6** — Returns / exchanges (barcode, credit note path)

### Epic 4: Human resources & payroll

- [x] **4.1** — Employee profiles + weekly schedule CRUD
- [x] **4.2** — Clock in/out + leave request workflows
- [x] **4.3** — Payroll calculation (hours, rates, deductions)
- [x] **4.4** — Bank-ready salary CSV export

### Epic 5: Financial Accounting & Executive BI

- [x] **5.1** — Chart of accounts, journal entries/lines with mandatory `branch_id`, source linkage, idempotent posting
- [x] **5.2** — Double-entry validation (balanced batches) in `accounting_service.post_journal_entry`
- [x] **5.3** — Automated GL posting from POS sales, returns, goods receipts, approved payslips (`document_posting_service`)
- [x] **5.4** — Weighted-average inventory cost (`branch_product_costs`) + product `standard_cost` fallback; FIFO/LIFO not implemented
- [x] **5.5** — Financial report read APIs: trial balance, general ledger, income statement, balance sheet
- [x] **5.6** — Executive BI KPI endpoint (`/api/v1/bi/executive-kpis`) from sales invoices

### Epic 6: CRM & Marketing

- [x] **6.1** — Loyalty Points engine (Accrual rules, manual adjustments)
- [x] **6.2** — Discount Rule Engine (Percentage, fixed, buy-X-get-Y)

### Epic 7: Identity Lifecycle, Fixed Roles, and Security

- [x] **7.1** — IT→HR user onboarding workflow (`user_onboardings`, pending queue, completion flow)
- [x] **7.2** — Fixed base role catalog with role codes and system-seeded permissions
- [x] **7.3** — Per-user permission overrides (allow/deny) merged into effective RBAC
- [x] **7.4** — Session idle timeout enforcement on refresh token lifecycle
- [x] **7.5** — Native password reset hardening (single-use token invalidation)

### Epic 8: OCR Provider and Deterministic Invoice Parsing

- [x] **8.1** — Provider registry with configurable default OCR provider
- [x] **8.2** — `BasicOcrProvider` (QR JSON/key-value parsing + optional Tesseract image OCR)
- [x] **8.3** — Deterministic `parse_extracted_invoice` normalization for manual validation

### Epic 9: In-Store Payment Recording

- [x] **9.1** — Internal `InStoreLedgerProvider` (no external gateway dependency)
- [x] **9.2** — Strict payment method validation (`cash` / `card` / `other`) with card redaction fields
- [x] **9.3** — Configurable default payment provider for POS intents

### Epic 10: Fiscal Controls and Subledger Accounting

- [x] **10.1** — Fiscal periods (`fiscal_periods`) with open/close controls and posting guard
- [x] **10.2** — Journal reversal workflow with source linkage (`reverses_entry_id`)
- [x] **10.3** — AR/AP open items and payment application subledgers with aging-oriented fields
- [x] **10.4** — Extended accounting APIs for period lock, reversals, and AR/AP operations

### Epic 11: AI Advisory and Automated Backups

- [x] **11.1** — Deterministic-facts marketing advisory service (SQL facts → prompt → validated JSON)
- [x] **11.2** — Advisory API endpoint (`/api/v1/marketing/advisory/suggestions`) with RBAC
- [x] **11.3** — Automated backup service (`pg_dump`, retention, optional S3) + admin status/run APIs
- [x] **11.4** — App startup background scheduler hook for periodic backups

---

## Technical flaw hardening (system review follow-through)

- [x] **Fix 14 — Soft-delete branches** — `branches.archived_at` (Alembic `d8f1a2c3e4b5`), list default excludes archived with optional `include_archived`, `DELETE` archives idempotently + audit `branch.archived`, [`app/services/branch_scope.py`](app/services/branch_scope.py) enforces non-archived branch for new operational entry points (terminals, carts, shifts, invoice numbers, transfers, stock adjustments, scan→goods receipt).

---

## Gaps & technical debt

| Area | Status |
|------|--------|
| **SSO** | FR mentions SSO; verify and implement OIDC/SAML when required |
| **Loyalty vs GL** | Loyalty points are not a balance-sheet liability unless explicitly modeled and posted |
| **FIFO / LIFO** | Only weighted-average + standard cost; no cost layers |
| **Multi-currency GL** | Currencies + supplier currency exist; no FX revaluation or translated statements |
| **Cash flow statement** | Not built as a dedicated report (balance sheet + income statement APIs exist) |

---

## Future backlog

_(Epic-sized follow-ups can be tracked here when defined.)_

---

## GitHub PR description (technical hardening — copy/paste)

Use this block when opening or updating the hardening PR (extend the migration list from `alembic history` / your merge base as needed).

**Verification**

- `uv run ruff check . --fix`
- `uv run pytest -q` (requires `TEST_DATABASE_URL` / PostgreSQL test DB)

**Migrations (Batch 5 — Fix 14)**

- `d8f1a2c3e4b5_branch_archived_at` — adds nullable `branches.archived_at` and index for list filtering / archival queries.

**Batch 5 — Fix 14 (branch archival)**

- ORM + API: `archived_at` on `Branch`; `GET /branches` excludes archived by default; `include_archived=true` restores full list; `DELETE /branches/{id}` soft-deletes (idempotent) with audit `branch.archived`.
- `app/services/branch_scope.require_branch_open_for_operations` — rejects archived branches for new work at terminals, POS cart/shift, per-branch invoice numbering, transfer batch create, manual inventory adjustment, and invoice-scan → goods receipt validation.

**Earlier batches (this branch)**

- See `git log --oneline` for commits such as Batch 1–4 / individual fixes (money `Decimal`, finalize atomicity, CORS, `SECRET_KEY`, lifespan errors, rate limits, route permission audit, seed flag, timestamps, Alembic-backed tests, payment receipt column rename, etc.).

---

## How to update this file

When an issue is done, mark `[x]`. When an entire epic is finished, keep it listed under **Completed epics** above. Move detailed notes on debt into **Gaps & technical debt**.

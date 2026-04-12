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

---

## Gaps & technical debt

| Area | Status |
|------|--------|
| **OCR / invoice parsing** | `FakeOcrProvider` + stub `parse_extracted_invoice`; no production OCR/QR or reliable field extraction |
| **Payments** | `MockPaymentProvider` only; no Stripe/Square (or similar); PCI scope not implemented |
| **SSO** | FR mentions SSO; verify and implement OIDC/SAML when required |
| **Automated DB backups** | FR mentions manual + scheduled backups; not tracked as implemented in app layer |
| **Session timeout / password reset** | Confirm parity with Module 1 FRs (email/phone flows) |
| **AR/AP open items** | No payment application / aging subledger; AP aging and customer statements incomplete without it |
| **User → HR onboarding** | No workflow when admin creates a user to assign HR completion tasks |
| **Loyalty vs GL** | Loyalty points are not a balance-sheet liability unless explicitly modeled and posted |
| **Period close / reversals** | No fiscal period lock or reversal journal pattern for posted documents |
| **FIFO / LIFO** | Only weighted-average + standard cost; no cost layers |
| **Multi-currency GL** | Currencies + supplier currency exist; no FX revaluation or translated statements |
| **Cash flow statement** | Not built as a dedicated report (balance sheet + income statement APIs exist) |

---

## Future backlog

_(Epic-sized follow-ups can be tracked here when defined.)_

---

## How to update this file

When an issue is done, mark `[x]`. When an entire epic is finished, keep it listed under **Completed epics** above. Move detailed notes on debt into **Gaps & technical debt**.

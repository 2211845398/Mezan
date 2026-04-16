# MEZAN — Backend & Database Analysis

Comparison of the MEZAN ERP backend against two reference systems:

- **Odoo** (Community + Enterprise) — full-stack, model-driven ERP with a deep `account` module, a mature retail/POS stack, and a very large ecosystem of modules (CRM, manufacturing, HR, fleet, etc.).
- **Manager.io** — desktop/cloud **small-business accounting** product focused on double-entry bookkeeping, VAT, bank reconciliation, and reporting. No POS, no heavy retail.

The goal is to place MEZAN honestly on this spectrum and surface the specific things that are worth fixing or building next.

---

## 1. Executive summary

MEZAN is a **retail-first, API-first backend** built around four strong cores:

1. **Identity & RBAC** — users, fixed base roles, per-user permission overrides, audit logging, onboarding workflow.
2. **Catalog & inventory** — hierarchical categories, dynamic attributes, purchase orders, OCR‑driven invoice scanning, goods receipts, multi‑branch stock movements, weighted‑average costing.
3. **POS** — terminals, shifts (open/cash events/Z-style close), carts (park/resume/lock), payments (intent + capture), immutable sales invoices, returns/credit notes.
4. **Automated GL posting** — POS sales, returns, goods receipts, and approved payslips post idempotent, balanced journal entries; fiscal periods, reversals, AR/AP open‑items subledger, trial balance / GL / P&L / balance sheet reports.

Compared to **Odoo**, MEZAN is a **narrower, tighter surface**: opinionated retail pipeline, clean async SQLAlchemy, idempotency taken seriously, auditable. But the accounting module is **much thinner** — no tax engine, no bank reconciliation, no fixed assets, no budgets, no cash‑flow statement, no manual journals API, no multi‑currency revaluation, and reports are type‑level rollups.

Compared to **Manager.io**, MEZAN has **more operations** (POS, HR, purchasing, branches, RBAC, audit) but **less pure accounting depth** — Manager.io has full VAT/tax codes, bank import & reconciliation, fixed assets, capital accounts, special accounts, inter‑account transfers, billable time/expenses, and a very rich set of statutory reports out of the box.

Net: MEZAN is closer to “**branch‑aware retail operations with a correct but minimal bookkeeping engine**” than to a general‑purpose accounting product.

---

## 2. Strengths

These are areas where the current backend compares **well or better** than Odoo/Manager.io for the intended use case.

### 2.1 Architecture & discipline

- **Clean layering** — `api/v1` (HTTP only), `services/` (logic), `models/` (ORM), `schemas/` (Pydantic). Odoo blurs these across its ORM model layer; Manager.io is a black box. The separation here is easier to test and reason about.
- **Fully async** — `AsyncSession`, async routes and services. Odoo is still synchronous; Manager.io doesn’t expose a programmable backend.
- **Idempotency as a first‑class concept** —
  - `JournalEntry.idempotency_key` unique; `post_journal_entry` no‑ops on duplicates (`app/services/accounting_service.py`).
  - `StockMovement.idempotency_key` — inventory side is replay‑safe.
  - POS finalize / capture / receive all take explicit `idempotency_key`.
  - This is stronger than default Odoo (where retries can duplicate moves unless you add locking).
- **Alembic‑only migrations** — no `create_all` on boot (`app/main.py` says so explicitly). Production‑appropriate.
- **Audit logging with `request_id`** — `audit_service.log` + `RequestIDMiddleware`. Hooked into most mutating routes. Manager.io has no audit trail at all.
- **Double‑entry is enforced in code** — `post_journal_entry` rejects unbalanced batches at cents level. Enforced **always**, not optional.

### 2.2 Retail / POS

- **Shift lifecycle** (`shift_service`) with open float, cash events, closing variance — this is effectively what Odoo POS does, but more explicit at the API level.
- **Cart state machine** — `draft → active → checkout_locked → paid`, plus park/resume; returns/credit notes with barcode lookup.
- **Payment provider abstraction** — `in_store`, `mock`, can be extended. Provider selected via `POS_DEFAULT_PAYMENT_PROVIDER`.
- **Immutable sales invoice + `InvoicePayment` + stock movements in one transaction** (`invoice_service.finalize_paid_cart`). Strong invariant.

### 2.3 Inventory & purchasing

- **Weighted‑average costing per (branch, product)** — `branch_product_costs` table, `apply_receipt_to_weighted_average`. Per‑branch is better than Odoo’s default global costing and aligns with multi‑store retail.
- **Optical/QR invoice scan pipeline** — `invoice_scan_service` with pluggable OCR providers, manual override path, deterministic parsing, then goods receipt + WAVG + GL posting. This is a real edge over Odoo, where OCR is an Enterprise add‑on that mostly just fills a vendor bill draft.
- **Branch‑aware stock levels and transfers** — `stock_levels`, `stock_movements`, `transfer_batch` with dispatch/receive.

### 2.4 Accounting basics

- **Branch‑scoped every journal line** — `JournalEntryLine.branch_id` is mandatory. That’s the minimum dimensional accounting needed to run P&L per store, and it’s enforced at the schema level.
- **Fiscal period lock** — `ensure_period_open` blocks posting to closed months. Period open/close workflow exposed via API. This is often an add‑on in Odoo and absent in many SME tools.
- **Journal reversal** — `accounting_governance_service.reverse_journal_entry` with `reverses_entry_id` and dedicated idempotency key. Cleaner than ad‑hoc “storno” patterns.
- **AR/AP open‑items subledger** — `ar_open_items`, `ap_open_items`, applications with aging fields.
- **Automated GL posting from operational events** — sales, returns, goods receipts, payroll. Nothing has to be manually journalized to get a trial balance.
- **All the main reports exist** — trial balance, GL, income statement, balance sheet — with optional `branch_id` filter.

### 2.5 Identity, security, auditability

- **Fixed base role catalog** (`SYSTEM_ROLE_SPECS`: Owner, IT Admin, HR Manager, Accountant, Cashier, Warehouse Manager, Marketing Manager, Floor Staff) with selector‑based permission seeding. Good separation‑of‑duties primitive that Manager.io does not have.
- **Per‑user permission overrides (allow/deny)** merged on top of role permissions at the dependency layer.
- **Session idle timeout** on refresh tokens; password reset tokens single‑use.
- **Operational safety** — on startup failure MEZAN swallows the exception only to allow boot before Alembic (by design), but otherwise the bootstrap seeds permissions, roles, chart of accounts, and accounting settings.

---

## 3. Weaknesses and gaps (vs Odoo / Manager.io)

These are grouped by area. Each item is something a customer coming from Odoo/Manager would expect and notice.

### 3.1 Accounting depth

| Capability | Odoo | Manager.io | MEZAN status |
|---|---|---|---|
| **Tax engine** (tax codes, inclusive/exclusive, tax on line) | Yes | Yes | **Missing.** Invoice scan parses `tax` but GL posts **revenue = total** with no tax liability split. VAT/sales‑tax reporting is impossible today. |
| **Multi‑currency GL with FX revaluation** | Yes | Yes | Partial. `Currency`, `AccountingSettings.base_currency_id`, supplier currency exist; journal lines have **no currency column** and no FX amount. AR/AP open items carry `currency_code` but no revaluation routine. |
| **Bank accounts & reconciliation** | Yes | Yes (core) | **Missing.** No bank statement import, no statement lines, no auto‑match. Cash is one default account. |
| **Fixed assets / depreciation** | Yes | Yes | **Missing.** |
| **Budgets** (budget vs actual) | Yes | Yes (basic) | **Missing.** |
| **Cash flow statement** | Yes | Yes | **Missing** (confirmed in `PROJECT_STATE.md`). |
| **Manual journal entries API/UI** | Yes | Yes | **Missing.** Only automated posting + reversal endpoint. An accountant cannot post an adjusting entry through the API. |
| **Chart of accounts CRUD** | Yes | Yes | Seeded only. **No CRUD endpoints** for accounts (create sub‑accounts, rename, deactivate). |
| **Analytic / dimensional accounting** beyond `branch_id` | Yes (analytic accounts / tags) | Limited (tracking codes) | **Missing.** No cost center, project, department, or custom dimension. |
| **Tax reports / VAT return** | Yes | Yes | **Missing.** |
| **Trial balance with opening + movement + closing columns** | Yes | Yes | MEZAN returns debit / credit / net only. |
| **Report drill‑down & account‑level BS/P&L** | Yes | Yes | MEZAN BS/P&L aggregate by `account_type` enum (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE). No per‑account breakdown in those two reports. |
| **Account types ‑ finer grouping** (current vs non‑current, equity vs retained earnings, etc.) | Yes | Yes | MEZAN’s enum has 5 values only; no sub‑classification. |
| **Period close that transfers P&L to retained earnings** | Yes (year end close) | Yes | **Missing.** Year‑end close is not modeled; balance sheet just reads cumulative debits/credits. |
| **Posting rule: only post to leaf (non‑control, non‑parent) accounts** | Yes | Yes | **Missing.** Any account can receive a line regardless of `is_control`. |

### 3.2 POS sale → GL correctness gaps

Looking at `document_posting_service.post_sales_invoice_gl`:

- **Tender‑method blind.** Debit is always `default_cash_account_id`, regardless of whether the payment was cash or card. Manager.io and Odoo both route card settlements to a “card clearing” account that is cleared by the acquirer deposit. MEZAN will overstate till cash for every card sale.
- **Account customer flow double‑posts cash.** For a customer sale, the service first accrues AR (Dr AR / Cr Revenue) and then immediately posts Dr Cash / Cr AR because the payment was already captured. That is effectively an invoice + receipt, but (a) it leaves no open AR in the subledger (AR open items are not auto‑created), and (b) it pretends every customer sale is paid in cash. There is no “credit sale on terms” path.
- **No discount posting.** Cart discounts reduce `total`; there is no “sales discount” expense or contra‑revenue line in the GL, so management reporting loses the gross‑to‑net.
- **No tax split.** As noted above.
- **Return refund always hits cash.** `post_sales_return_gl` credits `default_cash_account_id`. Same tender‑method issue.

### 3.3 Goods receipt → GL gaps

- **No GR/IR (Goods Received / Invoice Received) clearing.** Goods receipt posts Dr Inventory / Cr AP directly. That assumes the supplier invoice has been accepted at receipt — which the invoice‑scan flow does imply, but there is no separate “vendor bill” concept, no 3‑way match, no posting to `GR/IR clearing` that is later cleared against the bill.
- **AP open item is not auto‑created** on goods receipt. The AP subledger exists but is operated manually via `POST /accounting/ap/open-items`. The GL shows an AP balance that the subledger doesn’t know about. That is a **real reconciliation gap** — the subledger and GL can silently drift.
- **No freight/landed cost allocation.** Odoo has landed costs; MEZAN only has unit_cost × qty.
- **No PO→GR→Bill 3‑way match.** PO has no GL impact; it’s informational. In Odoo this is core.

### 3.4 Inventory / costing gaps

- **No FIFO/LIFO cost layers** (explicit in `PROJECT_STATE.md`).
- **No stock valuation report by date** — you cannot ask “what was inventory on hand × unit cost on 2026‑03‑31?” from the API. The GL says what the **accounting** inventory was, but you can’t reconcile it against the physical ledger.
- **No inventory adjustment → GL posting.** `inventory_adjustments` API changes stock but does not appear to post a write‑off / write‑up journal.
- **No stock valuation variance** between GL inventory and WAVG × on‑hand.
- **Transfers don’t hit GL.** For a single‑entity multi‑branch business with branch‑scoped P&L, an inter‑branch transfer **should** move the inventory asset from branch A to branch B in the GL (intra‑company transfer). Today the inventory line stays in the sending branch’s `branch_id` until the next sale/receipt.

### 3.5 Reporting gaps

- **Trial balance** — no opening balance column; no movement column.
- **GL inquiry** — fine at the `(account_id, date_from, date_to)` level; no running balance column.
- **Income statement / Balance sheet** — rolled up by `AccountType`. No account‑level lines. Not usable for real statutory output.
- **No report export** (CSV / XLSX / PDF). Manager.io is essentially reports‑as‑a‑product.
- **No comparative periods** (this year vs last year).
- **No consolidation** (multi‑company roll‑up).
- **No aging bucket report** for AR/AP, even though the subledger stores aging fields.

### 3.6 Multi‑entity / multi‑currency

- **No `company_id`/legal entity layer**. Branches are the only dimension. Odoo has `res.company` and Manager.io has one business per file. If MEZAN ever needs to sell two legal entities’ reports separately, that is a schema change.
- **Single global chart of accounts.** Cannot support two legal entities with different CoAs.
- **Journal lines are single‑currency**, denominated implicitly in base currency. Anything denominated in a foreign currency (supplier invoice in EUR) would need a currency + fx_rate + foreign_amount columns on `JournalEntryLine`.

### 3.7 RBAC / data isolation

- **Authorization is permission‑based, not branch‑scoped.** `deps.require_permission` checks that the user has `(resource, action)` but does not enforce “this user can only see branch 1 data.” `UserRole.branch_id` exists on the model but is not read by the dependency. In Odoo, record rules scope every query by `company_id`. In MEZAN, a cashier with the right permission can list/operate on any branch.
- **No row‑level security (RLS)** in PostgreSQL. At the API layer only.
- **Terminal API key is returned once** (good) but there is no terminal‑scoped JWT and no verification that a cart uses a terminal owned by the user’s branch.

### 3.8 HR & payroll

- **Hourly‑only model.** `payslip` computes hours × rate. No salaried employees, no allowances/bonuses, no employer taxes/social security contributions, no payroll tax tables per jurisdiction. Odoo Payroll has these (Enterprise); Manager.io has payslip templates with configurable earning/deduction items.
- **Net payroll is posted to a single liability account.** No employee‑level sub‑ledger and no payment run that clears the liability when salaries are actually paid from the bank.
- **No statutory reports** (social insurance, income tax withholding, end‑of‑service).

### 3.9 Operational / DX gaps

- **`main.py` lifespan swallows all exceptions** during startup seeding. Useful for first‑boot before migrations, but hides real failures in production. Should distinguish “no schema yet” from “seed failed.”
- **Test harness only runs against PostgreSQL** and **only if `TEST_DATABASE_URL`/`DATABASE_URL_TEST` is set**, but CI sets `DATABASE_URL`. So the entire DB‑backed suite silently **session‑skips** on CI. Worth aligning.
- **Tests hard‑code `branch_id: 1` / `2`** based on creation order in `admin_auth_header`. Fragile if anything seeds branches earlier.
- **No OpenAPI schema versioning** (API is under `/api/v1` but there is no deprecation or compatibility policy).
- **No background job queue.** Everything is in‑request. OCR in particular is a natural async job.
- **No webhooks / outbox** for downstream integrations.

---

## 4. Risks / bugs surfaced by reading the code

(Not a full audit, just what jumped out.)

1. **`post_sales_invoice_gl`** credits cash for the customer‑credit path even though no cash changed hands in some scenarios. Over time this distorts the cash GL account vs the actual drawer.
2. **`post_sales_return_gl`** always credits the default cash account. Card refunds are not modeled.
3. **`inventory_adjustments`** API does not appear in `document_posting_service`. A positive adjustment increases physical stock but GL inventory stays the same → **GL vs physical drift**.
4. **Goods receipt with a `Supplier` without `payables_account_id`** falls back to `default_ap_account_id`. Fine in aggregate, but the AP subledger is manual, so there is no per‑supplier AP from automation.
5. **Seeder compares `AccountingSettings.id == 1`** — fine for a single‑tenant model, but fragile if the table is ever seeded from multiple deploys.
6. **Lifespan `except Exception: pass`** — see §3.9.
7. **`UserRole.branch_id`** is stored but never checked in `require_permission`, so scope is advertised but not enforced.

---

## 5. Recommended priorities

Grouped by impact on the “honest ERP” story. No time estimates; each bullet is scoped by what it touches.

### 5.1 Must‑fix correctness issues (retail+GL integrity)

1. **Tender‑aware GL posting.** Extend `document_posting_service.post_sales_invoice_gl` and `post_sales_return_gl` to read the `PaymentReceipt.method` and post to a method‑specific account (`default_cash_account_id`, `default_card_clearing_account_id`, …). Requires a new field on `AccountingSettings`.
2. **Auto‑create AR/AP open items from automated GL.** When a sales invoice posts to AR or a goods receipt posts to AP, also create the corresponding subledger row (`create_ar_open_item` / `create_ap_open_item`) with `source_type`/`source_id` linking back to the invoice/receipt. Then automated reconciliation of subledger vs GL becomes possible.
3. **Stop the synthetic “cash” leg on customer sales.** If the customer truly paid at POS, the POS entry should be Dr Cash/Card‑clearing / Cr Revenue directly; AR should not be involved. If it’s on account, only accrue AR and leave the open item open. Two distinct finalize flows.
4. **Post inventory adjustments to GL.** Write‑offs → Dr Expense (shrinkage) / Cr Inventory; write‑ups → Dr Inventory / Cr Other Income. Driven by a new `inventory_adjustment` source in `document_posting_service`.
5. **GR/IR clearing and separate Vendor Bill.** Split receipt posting from bill posting: receipt → Dr Inventory / Cr GR/IR; bill → Dr GR/IR / Cr AP. Keeps physical receive separate from AP accrual.
6. **Restrict posting to leaf, non‑control accounts** in `post_journal_entry`.
7. **Close P&L to equity** at period close or at year end (`retained_earnings`), or compute the balance sheet with a `current_year_earnings` pseudo‑line. Today the balance sheet does not balance by construction for a year that has P&L.

### 5.2 Table‑stakes accounting features

8. **Tax engine.** Tax codes on products (and/or lines), inclusive/exclusive, tax → liability account in the journal. VAT return report.
9. **Multi‑currency journal lines.** Add `currency_id`, `fx_rate`, `foreign_amount` columns to `journal_entry_lines`. FX revaluation routine for open AR/AP and FX‑denominated balances.
10. **Manual journal entry API.** `POST /accounting/journal-entries` for accountants, with the same validations as automated posting (double‑entry, period open, leaf accounts).
11. **Chart of accounts CRUD API.** Accountants need to add sub‑accounts without running migrations.
12. **Better reports.** Trial balance: opening + movement + closing columns. P&L and BS: account‑level detail. CSV export. Aging buckets for AR/AP.
13. **Cash flow statement** (indirect method is cheap given the existing GL).

### 5.3 Operational & security

14. **Branch‑scoped authorization.** `get_current_user_permissions` should return a map of `(resource, action) → allowed branch_ids`, and `require_permission` should also accept a `branch_id` argument read from the path/body. All queries should be filtered by the same.
15. **Startup lifespan** should distinguish “no schema yet” from “seed failed” and log loudly in the second case.
16. **Fix test env.** Make `conftest.py` fall back to `DATABASE_URL` when `TEST_DATABASE_URL` isn’t set, or update CI to export `TEST_DATABASE_URL`. Without this, the DB‑backed suite does not run in CI.
17. **Background job queue** for OCR and for heavy backups.

### 5.4 Nice‑to‑have (closes the distance to Odoo)

- Analytic/dimensional accounting (`cost_center_id`, `project_id` on journal lines).
- Fixed assets module.
- Budgets.
- Multi‑company / legal entity layer.
- Bank statement import and reconciliation.
- Landed costs.
- Statutory reports per jurisdiction.

---

## 6. Where MEZAN wins vs each reference

| vs **Odoo** | vs **Manager.io** |
|---|---|
| API‑first and async — cleaner integration surface | Has POS, HR, inventory (Manager.io has none) |
| Branch‑scoped GL lines by default | Audit log with `request_id` on every mutation |
| Idempotency everywhere (journals, stock, payments) | Fixed‑role catalog with per‑user overrides |
| OCR invoice pipeline is first‑class (not Enterprise add‑on) | Multi‑branch stock and transfers |
| Cleaner cart/shift/finalize state machines | Weighted‑average cost per branch |

## 7. Where MEZAN loses vs each reference

| vs **Odoo** | vs **Manager.io** |
|---|---|
| No tax engine, no analytic accounts, no multi‑company | No bank reconciliation, no VAT return, no fixed assets |
| No manual journals, no CoA CRUD, no year‑end close | Reports are type‑rollups only, no account detail, no CSV/PDF export |
| No landed costs, no PO→GR→Bill 3‑way match | No manual journals API |
| POS → GL ignores tender method and tax | No statutory tax reports |
| No branch‑scoped row‑level authorization | No aging bucket report despite having the data |

---

## 8. What the Happy User Journey test proves

See `tests/test_happy_journey.py`. It walks the full path:

1. Branch creation (warehouse + storefront).
2. A staff user is created and assigned the **Admin** role (the journey also exercises role assignment).
3. Category + dynamic attributes + product + barcode.
4. Supplier master + purchase order.
5. Invoice scan → manual override → validate → **goods receipt + GL posting (Dr Inventory / Cr AP)**.
6. Inter‑branch transfer (warehouse → store) with dispatch + receive.
7. POS terminal creation + authorization.
8. Shift open at the storefront terminal.
9. Cart create → add line → finalize discount → park/resume/lock.
10. Payment intent + capture (card, mock provider).
11. Sales invoice finalize → immutable invoice, stock out, **GL posting (Dr Cash / Cr Revenue, Dr COGS / Cr Inventory)**.
12. Shift close with declared cash.
13. Assertions on **`/accounting/trial-balance`**: Inventory, AP, Cash, Revenue, COGS all carry the expected signs; debits equal credits.
14. Assertions on **`/accounting/income-statement`** and **`/accounting/balance-sheet`** for the same date window.

This is the end‑to‑end “retail → books” loop that MEZAN claims to deliver, run as one test.

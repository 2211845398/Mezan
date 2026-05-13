---
name: Mezan System Restructure
overview: Reorganize and document the Mezan system requirements into a single coherent plan covering UI reference pages, POS screen details, catalog, inventory, purchasing, CRM and AI, the accounting core, a three-phase roadmap, and architectural improvement suggestions.
todos:
  - id: phase-1-audit
    content: "Phase 1: Comprehensive source-code audit, produce numbered GAP_REPORT, and update PROJECT_STATE.md §4."
    status: completed
  - id: phase-2a-money-decimal
    content: "Phase 2: Migrate all monetary fields from float to Decimal across SQLAlchemy models and Pydantic schemas."
    status: pending
  - id: phase-2b-variants
    content: "Phase 2: Design and create migration for product_variants table and wire it through all movements (Stock, Cart, Sales, PO, GR)."
    status: pending
  - id: phase-2c-accounting-core
    content: "Phase 2: Add Opening Balance GL + Generic Voucher service + GL postings for inventory adjustments + BoM/Production Orders."
    status: pending
  - id: phase-2d-pos-data
    content: "Phase 2: Add daily_cart_number column, enable exchange_cart_id, and create pos_expenses table for shift expenses."
    status: pending
  - id: phase-2e-multicurrency-fifo
    content: "Phase 2: FX revaluation unit + FIFO cost layers alongside existing WAVG valuation."
    status: pending
  - id: phase-3a-pos-overhaul
    content: "Phase 3: Rebuild the POS screen (full top bar, product grid, color-shifted return mode, real parked-invoices modal)."
    status: completed
  - id: phase-3b-transfers-kanban
    content: "Phase 3: Three-column Kanban board for inventory transfers with separated sender/receiver approval permissions."
    status: completed
  - id: phase-3c-purchasing
    content: "Phase 3: Price-less Purchase Order flow → Purchase Invoice with prices, plus ProductForm without cost/sell_price fields."
    status: completed
  - id: phase-3d-accounting-ui
    content: "Phase 3: Rework accounting screens to match Odoo/Manager.io UX (tree, journal entry, reports, currencies)."
    status: completed
  - id: phase-3e-crm-ai-ui
    content: "Phase 3: Customer performance page + simplified card-based UI for AI Marketing and HR Anomalies."
    status: completed
isProject: false
---

# Mezan System Restructuring Plan

> Methodology note: Your original requirements have been preserved in full (no content was dropped) — only the wording was reorganized into clear sections, and each requirement is annotated with its **current implementation status** based on a fresh audit of the codebase ([PROJECT_STATE.md](PROJECT_STATE.md) + frontend/backend exploration). Three labels are used:
> - **Works** — matches the requirement.
> - **Partial** — exists but is incomplete or does not fully match the specification.
> - **Missing** — needs to be built from scratch.

---

## 1. UI Reference Pages (Visual Identity Source of Truth)

I am satisfied with the following pages — they work exactly as intended today. Their button colors, modal pop-up animations, and performance-evaluation page designs must remain the **visual identity baseline** that every other module follows:

- Profile ([/profile](web/src/features/profile)) — **Works**
- User & permission management ([/admin/users](web/src/features/admin/users), [/admin/roles](web/src/features/admin/roles)) — **Works**
- Notifications ([/notifications](web/src/features/notifications), [/admin/notifications/...](web/src/features/admin/notifications)) — **Works**
- HR & Payroll ([/hr/...](web/src/features/hr), [/payroll/...](web/src/features/payroll)) — **Works**

These pages are smooth and polished — they are the reference for:
- Button colors and variants.
- Floating modal entry/exit behavior.
- Per-entity performance review pages (e.g., employee performance).

**Shared UI primitives adopted as the design baseline:** `PageHeader`, `CreateButton`, `BackButton`, `SectionCard`, `FormContainer`, `FloatingFormDialog`, `ContentSurface` ([web/src/components/shared](web/src/components/shared)).

---

## 2. Point of Sale (POS) Screen — Detailed Specification

Goal: faithfully replicate the workflow of the "Bonyan" reference system.

### 2.1 Shift Start — **Partial**

- A screen appears asking the user to select the terminal they will operate.
- The terminal is bound to a specific branch (**critical** — every accounting entry must be routed to the correct branch).
- The user enters the cash float (opening drawer balance for change).
- The user is then routed to the sales screen.

**Status:** [`ShiftGate.tsx`](web/src/features/pos/pages/ShiftGate.tsx) exists with terminal selection and opening-float input. We need to verify that the terminal → branch binding is consistently passed to every downstream operation via `branch_id`.

### 2.2 Top Task Bar — **Partial**

Present on every POS page, right-to-left:
- The label "Point of Sale".
- The branch name the device belongs to.
- A simple clock.
- **Parked-invoices button** — opens a floating Modal listing temporarily saved invoices.
- **Today's sales button** — opens a page summarizing today's sales performance.
- At the end of the bar: an online/offline indicator, the employee name, and a logout button.

**Status:** [`PosLayout.tsx`](web/src/components/layout/PosLayout.tsx) has a title, POS links, and `OfflineBadge`. Missing: real branch name, live clock, today's sales button, employee name, and dedicated logout button.

### 2.3 Sidebar — **Works**

The same sidebar used in every other page (the reference shell).

### 2.4 Three-Column Main Screen — **Partial**

#### Right column — Products grid — **Partial**
- Lists active (non-archived) products.
- Includes a search bar and a category filter.
- **Add interaction:** Double-clicking a product adds it to the cart (+1 qty). Clicking the (−) button decrements the qty; when qty reaches 1 and (−) is clicked again, the line is removed from the cart.

**Status:** [`ProductSearch.tsx`](web/src/features/pos/components/ProductSearch.tsx) uses an `AsyncSelect` plus an "Add" button. **No product grid** exists, and **no double-click-to-add** behavior is implemented.

#### Middle column — Vertical control rail — **Partial**
From bottom to top:
- **Parked-invoices button** — opens a floating Modal containing (Clear invoice) and (New invoice). Pressing "New invoice" automatically parks the currently open invoice. The cashier can later open the parked-invoices list, pick one, edit it, complete it, or park it again.
- **Payment-methods button** — opens a floating Modal with options (bank card, transfer, etc.). The system does **not** process the payment here — it only records the payment method, so the amount can be routed to the correct account in the chart of accounts.
- **Cash payment button** — records the cash payment directly (the cashier will be asked about this cash when closing the shift).
- **Discount code field** — depends on the sales manager's permissions.
- **Other expenses button** — records shift expenses such as lunch or cleaning supplies under the "Other expenses" account.
- **Total amount.**

**Status:** [`TenderDrawer.tsx`](web/src/features/pos/components/TenderDrawer.tsx) mixes all payment options inside a single drawer. The parked-invoices popover in [`RegisterToolbar.tsx`](web/src/features/pos/components/RegisterToolbar.tsx) only shows an empty placeholder. The **expenses button is missing**.

#### Left column — Cart panel — **Partial**
- Displays the cart number (a unique cart identifier **plus** a daily sequence number).
- **Return-mode toggle** — slightly shifts the UI colors as a visual cue; verifies the original invoice exists; lets the cashier return items and/or swap them for replacements. Accounting treatment: returned items are recorded as a **purchase**, replacement items the customer takes are recorded as **sales**.
- **Normal (sales) mode** — an "Add customer" action lets the cashier link the invoice to a customer (essential for receivables/debt tracking).
- **Final total** = (line items + taxes) − discount, if any.

**Status:** [`RegisterCartColumn.tsx`](web/src/features/pos/components/RegisterCartColumn.tsx) exists. Missing: a separate daily cart number ([`pos_cart.py`](app/models/pos_cart.py) only has `id`), the color shift on return mode, and exchange wiring — [`ReturnDrawer.tsx`](web/src/features/pos/components/ReturnDrawer.tsx) always sends `exchange_cart_id: null` even though the backend supports it.

---

## 3. Categories and Products

### 3.1 Categories ([/catalog/categories](web/src/features/catalog/pages/categories)) — **Partial**

- Supports **4 nesting levels** (Root → sub → sub → sub).
- **Inheritance:** child categories inherit parent attributes (e.g., sizes). Sizes are entered as an Enum list (S, M, L, XL, XXL) and used as filter tags.

**Status:** [`Category`](app/models/category.py) is a `parent_id` tree with **no enforced depth limit**. Attribute inheritance is implemented via `CategoryAttributeDef.inherited_from_category_id`. Using Enum lists as **filter tags** is only partially exposed in the UI.

### 3.2 Products ([/catalog/products](web/src/features/catalog/pages/products)) — **Partial**

- Add a product name, image, primary category, and secondary categories — the product inherits attributes from these.
- **Important constraint:** Do **not** capture cost price or selling price on the product form. Prices are determined and updated through supplier purchase invoices.

**Status:** [`ProductFormPage.tsx`](web/src/features/catalog/pages/products/ProductFormPage.tsx) currently **enforces both `standard_cost` and `sell_price` fields** — this violates the constraint above.
**Critical migration gap:** No standalone `product_variants` table exists. A red Adidas shirt and a black Adidas shirt are stored either as separate `Product` rows or as JSON attributes — neither is correct for inventory tracking. A real variant model is required.

---

## 4. Inventory and Purchasing

### 4.1 Inventory Transfers ([/inventory/transfers](web/src/features/inventory/pages/transfers)) — **Partial**

- Three-column board: (Delivery requests, In transit, Delivered).
- **Delivery requests (right column):** created by the warehouse manager after confirming stock availability.
- **Dispatch approval:** only the sending warehouse manager can authorize goods leaving.
- **Receipt confirmation:** only the receiving warehouse manager can confirm arrival.

**Status:** [`TransfersList.tsx`](web/src/features/inventory/pages/transfers/TransfersList.tsx) is a flat table — **no three-column Kanban**. Backend services `dispatch_batch` and `receive_batch` exist in [`transfer_service.py`](app/services/transfer_service.py), but there is **no explicit role split** between the "sender approver" and "receiver approver" — any user with the permission can call either endpoint.

### 4.2 Purchasing ([/purchasing/orders](web/src/features/purchasing/pages)) — **Partial**

- Start with a **Purchase Order** (no prices on the lines).
- After confirming the items are available at the supplier, the PO is converted to a **Purchase Invoice** containing exact details (cost price, size, color, etc.).

**Status:** [`PurchaseOrderLine`](app/models/purchase_order_line.py) **enforces `unit_cost` at the line level**, contradicting the price-less PO requirement. A migration is needed to make `unit_cost` optional on the PO and required only on the resulting Purchase Invoice.

**Critical warning:** The migration to differentiate product variants (e.g., red vs. black Adidas shirt) must be resolved here — purchase receipts must flow into per-variant stock and cost.

### 4.3 Inventory Valuation

The system must support professional valuation methods such as **FIFO** (first in, first out), **LIFO**, or **Weighted Average**.

**Status:** Only **Weighted Average (WAVG)** is implemented in [`inventory_valuation_service.py`](app/services/inventory_valuation_service.py). FIFO and LIFO are not implemented.

---

## 5. Marketing, AI, and CRM

### 5.1 Customers ([/crm/customers](web/src/features/crm/pages/customers)) — **Partial**
Each customer should have a dedicated performance page (average basket value, top-purchased products). [`CustomerDetail.tsx`](web/src/features/crm/pages/customers/CustomerDetail.tsx) shows invoices and loyalty data, but **no AOV / Top-Products panel** in the same style as the employee performance pages.

### 5.2 Loyalty Points ([/crm/loyalty](web/src/features/crm/pages/loyalty)) — **Works**
Flexible rules for accruing points (e.g., 10 points per cart, 50 points for invoices > 1000 LYD). Rules may be hardcoded if doing so meaningfully improves system performance. [`AccrualRuleForm`](web/src/features/crm/pages/loyalty/AccrualRuleForm.tsx) already supports rule creation.

### 5.3 Coupons ([/crm/discounts](web/src/features/crm/pages/discounts)) — **Works**
Coupon code + percentage discount + validity period. [`DiscountForm.tsx`](web/src/features/crm/pages/discounts/DiscountForm.tsx) supports percentage, fixed amount, BOGO, and date windows.

### 5.4 Artificial Intelligence (using GPT-4 mini)

- **Marketing ([/marketing/advisory](web/src/features/marketing/pages/advisory))** — reads cart contents and proposes simple, intuitive offers (e.g., noticing that coffee and milk are often bought together → suggest a "Coffee Time" bundle). Results are presented as cards or simple charts.
- **HR ([/ai/hr-anomalies](web/src/features/ai/pages/HrAnomaliesView.tsx))** — analyzes last month's attendance records and surfaces non-compliant employees in plain, easy-to-read language with no technical jargon.

**Status:** `OPENAI_MODEL` defaults to `gpt-4o-mini` in [config.py](app/core/config.py). [`marketing_advisory_service.py`](app/services/marketing_advisory_service.py) works with a deterministic fallback. AI pages exist and function — but the **visual presentation needs simplification** to suit non-technical managers.

---

## 6. The Accounting System (Heart of the Platform)

This module needs the most extensive restructuring to fully respect **double-entry bookkeeping**.

### 6.1 Chart of Accounts — **Partial**

- Composed of **five top-level branches**: Assets, Liabilities, Equity, Revenue, Expenses.
- Branches expand into **five levels** (e.g., Expenses → Operating Expenses → Salaries & Wages → Employee X's salary).
- Each account can be assigned a parent (e.g., Suppliers → Liabilities, Customers → Current Assets).
- This central chart belongs to the business and is inherited by every branch and warehouse so each entity's performance can be tracked independently — with the ability to roll up or roll down accounts to view aggregate performance.

**Status:** [`ChartAccount`](app/models/chart_accounts.py) supports the five top-level types via `AccountType`. Nesting via `parent_id` exists with **no enforced 5-level limit**. **Per-branch chart inheritance is not explicitly implemented**; journal lines carry `branch_id` but there is no automatic per-branch chart provisioning.

### 6.2 Automatic Journal Entries — **Partial**

Every financial event must produce an immediate journal entry:

- **Opening Balances:** capital injection used to buy assets and inventory. → **Missing** (no `post_opening_balance_gl` service exists).
- **Purchases:** when a purchase invoice is recorded, post (Dr Inventory / Cr Cash). → **Works** via `post_goods_receipt_gl` in [`document_posting_service.py`](app/services/document_posting_service.py).
- **Sales:** dual entry to capture true profit:
  - (Dr Cash / Cr Sales)
  - Cost entry (Dr COGS / Cr Inventory)
  - → **Works** via `post_sales_invoice_gl`.
- **Receipts & Payments:** full flexibility to route any amount from any debit account to any credit account. → **Partial** (`post_ar_cash_receipt_gl` only handles customer receivables; no generic Receipt/Payment Voucher service).
- **Inventory Adjustments:** physical count discrepancies (damage or missing stock) must be posted under "Inventory Shortage" or "Damaged Inventory" expense accounts. → **Missing** ([`inventory_adjustments.py`](app/api/v1/inventory_adjustments.py) updates `stock_movement` rows but emits **no GL entry**).

### 6.3 Multi-Currency — **Partial**

Pick a base currency, set an FX rate per transaction or pull a daily unified rate from settings, and automatically compute FX gains/losses.

**Status:** [`AccountingSettings.base_currency_id`](app/models/accounting_settings.py) exists. A per-transaction `exchange_rate_to_base` snapshot is taken in [`payment_service.py`](app/services/payment_service.py). **There is no complete FX revaluation unit.**

### 6.4 Production / Assembly Orders (BoM) — **Missing**

- A page to combine multiple components into a single finished product.
- Define the new product's name, code, and attributes.
- Specify each component's code and quantity.
- The system multiplies each component's quantity by its cost, sums them, and derives the finished product's cost automatically.

**Status:** No BoM or assembly models/services exist in the codebase.

---

## 7. Roadmap

To deliver a professional outcome competitive with systems like [Odoo](https://www.odoo.com) and [Manager.io](https://www.manager.io), the work is split into three phases:

### Phase 1 — Audit & Discovery
**Carefully read the current source code, identify gaps and defects, and produce a concrete improvement plan for the next steps.**

- Complete walkthrough of every module (POS, Catalog, Inventory, Purchasing, CRM, Accounting, AI).
- Document gaps in `GAP_REPORT.md`, each linked to an Epic / task.
- Lock the major decisions (FIFO vs. WAVG? Variants schema? 4 vs. 5 levels of accounts?).
- Deliverable: updated [PROJECT_STATE.md](PROJECT_STATE.md) §4 (Gaps) with numbered IDs.

### Phase 2 — Backend & Database
**Improve the database, fix migrations, and build the complex accounting logic in the backend.**

Priority order:
1. **Migrations:** add `product_variants` table and wire it through `stock_movement` / `pos_cart_line` / `sales_invoice_line` / `purchase_order_line` / `goods_receipt_line`.
2. **Money safety:** convert every `Mapped[float]` to `Mapped[Decimal]` (existing High-risk debt in PROJECT_STATE §4).
3. **Accounting core:**
   - `post_opening_balance_gl` service.
   - Automatic GL postings for inventory adjustments (`inventory_adjustment.post_gl`).
   - Generic Receipt/Payment Voucher service.
   - BoM / Production Order module.
4. **Multi-currency:** FX revaluation service triggered at period close.
5. **Stock valuation:** optional FIFO via cost layers alongside the existing WAVG.
6. **POS data:** `daily_cart_number` column on `pos_cart`, enable `exchange_cart_id` in the returns service, create a `pos_expenses` table for shift-level expenses.
7. **Branch-aware CoA:** automatic per-branch chart provisioning/inheritance.

### Phase 3 — Frontend
**Implement the frontend, wire it to the backend, and refine pages to be smooth and faithful to the reference design.**

Priority order:
1. **POS layout overhaul** (full top bar + product grid + middle control rail + cart on the left + double-click-to-add).
2. **Real parked-invoices modal** (wired to the API instead of a placeholder).
3. **Return mode** with a clear color shift, mandatory link to the original invoice, and swap-inside-same-cart workflow.
4. **Inventory transfers Kanban** with three columns and separated sender/receiver approval permissions.
5. **Price-less Purchase Orders** that convert to priced Purchase Invoices.
6. **Product form** without cost/sell-price fields.
7. **Customer performance page** (AOV + Top Products) styled like the employee performance pages.
8. **Accounting screens overhaul** to mirror Odoo/Manager.io patterns (tree, journal entry form, reports).
9. **AI Marketing** displayed as simple cards plus readable Recharts visualizations for non-technical managers.

---

## 8. Additional Recommendations

> These are extra architectural and operational suggestions to lift the system to Odoo/Manager.io quality, ordered by priority.

### A. Architectural (Technical)

1. **Variants as a first-class layer:** Instead of distinguishing color/size via JSON `attributes` on `Product`, create `product_variants(id, product_id, sku, barcode, attribute_values JSONB, cost_layer_ref)`. Every stock movement, cart line, and sales line points to a `variant_id`, not a `product_id`. This is the clean fix for the migration problem you mentioned.

2. **Branch-scoped Chart of Accounts via "account path":** Rather than duplicating the chart per branch, leverage the existing `branch_id` column on [`JournalLine`](app/models/journal_line.py) to compute `BalanceByBranch`. One global chart, branch-scoped reports — simpler and faster than cloning the tree.

3. **Generic Receipt/Payment Voucher:** Build a single `post_voucher_gl(debit_account_id, credit_account_id, amount, currency, fx_rate, memo)` service instead of dedicated services for every scenario. This delivers the "any debit account → any credit account" flexibility you asked for.

4. **FIFO via cost layers:** Add `inventory_cost_layer(id, variant_id, branch_id, qty_remaining, unit_cost, received_at)`. Sales consume layers oldest-first. Coexists with WAVG as a per-business-setting choice.

5. **Outbox pattern for GL postings:** Instead of synchronously posting from POS/Returns to the journal, write to a `gl_posting_outbox` table processed by a worker. Protects checkout latency during sales spikes.

6. **POS Offline-first sync (Epic 12):** Complete the Epic 12 already planned in [PROJECT_STATE.md](PROJECT_STATE.md) §5. Without it, remote branches risk data loss during connectivity outages.

7. **Idempotency keys on every mutating endpoint:** The standard is documented but not consistently enforced — apply it to accounting endpoints (Receipts/Payments/Adjustments) to prevent double-posting.

8. **Decimal everywhere first:** Begin Phase 2 by fixing the money type system (High-risk debt in PROJECT_STATE §4) **before** any new accounting work.

### B. User Experience (UX)

9. **RTL-friendly POS layout:** Because the app is Arabic-first, products on the right is the natural reading order, the middle rail for controls, and the cart on the left. The current grid in [`PosRegister.tsx`](web/src/features/pos/pages/PosRegister.tsx) is inverted and needs reordering.

10. **Color-coded return mode:** Wrap [`PosRegister`](web/src/features/pos/pages/PosRegister.tsx) with `data-mode="return"` on the root, plus a CSS rule that swaps `--background` and `--accent` to a light red. Cheap, effective.

11. **Sticky category sidebar inside the product grid:** Replace the dropdown filter with a vertical category list and per-category badges — much faster for the cashier than picking from a dropdown.

12. **Separate coupon vs. manager discount code:** Keep them as two distinct fields (customer-facing coupon vs. sales-manager discount) for cleaner accounting and audit trails.

13. **AI insights as drill-down cards:** Every marketing suggestion opens a detail view backed by raw SQL facts — increases the manager's trust in the recommendation.

### C. Governance

14. **Approval matrix for sensitive actions:** Transfers, shift closes, fiscal period closes, inventory adjustments — each has a configurable policy (single / dual / manager-only).

15. **Soft-close before hard-close for fiscal periods:** Gives accountants a review window to correct mistakes before sealing the period.

16. **Audit-trail UI:** A screen that surfaces every sensitive change recorded in `audit_log` — industry-standard in Odoo.

### D. Performance

17. **Materialized views for financial reports:** Year-long Trial Balance / Income Statement can be slow — refresh them once a day and load incrementally.

18. **Loyalty rules as a small DSL (JSONB):** As you suggested, some rules can be hardcoded for speed, but a flexible DSL (e.g., `{when: "cart.total > 1000", then: {points: 50}}`) preserves flexibility without code changes.

19. **POS catalog cache via Service Worker:** Remote branches benefit from an ETag-aware catalog cache (already planned in Epic 12.1).

### E. Methodology

20. **PROJECT_STATE as the single source of truth:** Every decision from this plan should be tracked back into [PROJECT_STATE.md](PROJECT_STATE.md) §4 and §5 with numbered IDs (e.g., `D-7: variants schema`, `Epic 18: Production Orders`). This is already mandated by `.cursor/rules/01-project-context.mdc`.

---

## Closing Note

This plan is **documentation, not execution**, at this stage. On your approval, I will start Phase 1 (Audit), produce a numbered GAP_REPORT, and then we will agree on the Phase 2 sequencing based on your operational priorities.

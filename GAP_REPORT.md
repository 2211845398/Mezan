# Mezan — Gap Report (Phase 1 Audit)

**Date:** May 2026
**Scope:** Comprehensive read-only audit of POS, Catalog, Inventory, Purchasing, Accounting, CRM, Marketing AI, and HR AI modules in the Mezan codebase.
**Status:** Phase 1 deliverable of the [Mezan System Restructure plan](.cursor/plans/mezan_system_restructure_ee9ca47f.plan.md).

---

## 1. How to read this report

Every gap has a stable ID of the form `GAP-<MODULE>-<NN>` (e.g. `GAP-POS-001`). Cross-references in code review, PR descriptions, commit messages, and `PROJECT_STATE.md` should cite these IDs.

| Field | Meaning |
|-------|---------|
| **ID** | Stable identifier (do not renumber). |
| **Title** | One-line description. |
| **Where** | File path(s) + line ranges (where known). |
| **Current** | What the codebase does today. |
| **Spec** | What the requirement says. |
| **Severity** | `Critical` (blocks correctness / accounting integrity) → `High` (breaks key UX or business flow) → `Medium` (degrades UX / completeness) → `Low` (polish / nice-to-have). |
| **Phase** | Which roadmap phase fixes it (1 = audit, 2 = backend/db, 3 = frontend). |
| **Fix sketch** | One-sentence implementation direction. |

---

## 2. Cross-cutting (D-) divergences

These build on the existing `D-1`..`D-6` divergences in [PROJECT_STATE.md](PROJECT_STATE.md) §4.

| ID | Title | Severity | Phase |
|----|-------|----------|-------|
| **D-7** | No `product_variants` model — color/size of the same product treated as separate `Product` rows or JSON attributes only | Critical | 2 |
| **D-8** | Money type system still has `Mapped[float]` in places — accounting precision risk | High | 2 |
| **D-9** | Chart of Accounts has no enforced depth limit (spec asks for 5 levels) | High | 2 |
| **D-10** | Branch chart inheritance is implicit (`branch_id` on journal lines) — works but undocumented; report rollup not surfaced | Medium | 2 |
| **D-11** | Decimal coercion helper accepts `float` (`subledger_service._d`) — boundary parsing risk | Low | 2 |

---

## 3. POS module gaps (`GAP-POS-*`)

### Top bar / layout

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-POS-001** | POS not nested under the admin shell sidebar | [`PosLayout.tsx`](web/src/components/layout/PosLayout.tsx) L12–L75; [`router.tsx`](web/src/routes/router.tsx) L173–L186 | POS is deliberately outside `AdminLayout`; no shared sidebar. | Same sidebar as every other admin page. | High | 3 | Nest POS routes under `AdminLayout` (or embed the shared `AppSidebar`) with a full-screen content region. |
| **GAP-POS-002** | Top bar missing branch name, live clock, employee name, logout button | [`PosLayout.tsx`](web/src/components/layout/PosLayout.tsx) L36–L71 | Only `OfflineBadge`, i18n title, and POS nav. | RTL bar: "Point of Sale" / branch name / clock / parked-invoices / today's sales / online / employee / logout. | High | 3 | Extend `PosLayout` with `useAuth().user` (name + logout), `Branch` lookup, and a tiny clock component. |
| **GAP-POS-003** | Parked-invoices modal is a placeholder | [`RegisterToolbar.tsx`](web/src/features/pos/components/RegisterToolbar.tsx) L46–L55 | Renders `t('pending.empty')` only. | Modal must list real parked carts (Clear / New invoice → auto-park current; resume + edit + re-park). | High | 2,3 | Add `GET /pos/carts?status=parked&terminal_id=...` (backend) and a real list UI with reopen/clear actions. |
| **GAP-POS-004** | No "Today's sales" entry point in the top bar | [`PosLayout.tsx`](web/src/components/layout/PosLayout.tsx); [`InvoiceLookup.tsx`](web/src/features/pos/pages/InvoiceLookup.tsx) L31–L140 | `/pos/invoices` exists and queries today's invoices, but is not surfaced as "Today's sales" in the top bar. | Dedicated top-bar button → today's sales summary. | Medium | 3 | Add a button in top bar, rename the page to "Today's sales", and present summary cards (count, total, AOV). |

### Shift start

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-POS-005** | After shift open, user is not auto-routed to `/pos/register` | [`ShiftGate.tsx`](web/src/features/pos/pages/ShiftGate.tsx) L17–L127 | Shows a link the user must click. | Auto-navigate after success. | Medium | 3 | `useNavigate()` to `/pos/register` on mutation success. |
| **GAP-POS-006** | Shift `expected_cash` is not updated on sale finalize | [`shift_service.py`](app/services/shift_service.py); [`invoice_service.py`](app/services/invoice_service.py) | Only `open_shift` and `add_cash_event` update `expected_cash`; sales do not record a `PosCashEvent`. | Z-style close must reflect cash taken at register. | Critical | 2 | On `finalize_paid_cart`, record `PosCashEvent` of type `sale` for each cash tender. |
| **GAP-POS-007** | `cart_service.create_cart` accepts `shift_id` without validating it belongs to the terminal or is open | [`cart_service.py`](app/services/cart_service.py) L37–L58 | Cart's `branch_id` follows terminal correctly, but `shift_id` is trusted from client. | Server must assert `shift.terminal_id == terminal_id` and `shift.status == 'open'`. | Medium | 2 | Add guard in `create_cart`. |
| **GAP-POS-008** | UI labels branch from `auth.activeBranchId`, not from cart | [`PosRegister.tsx`](web/src/features/pos/pages/PosRegister.tsx) L199–L202 | Receipt label = `Branch #${auth.activeBranchId}`. | Should derive from `cart.branch_id` and resolve to real branch name. | Low | 3 | Replace with `cart.branch_id` → branch lookup. |

### Product grid (right column)

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-POS-009** | No product grid (search + select only) | [`PosRegister.tsx`](web/src/features/pos/pages/PosRegister.tsx) L108–L184; [`ProductSearch.tsx`](web/src/features/pos/components/ProductSearch.tsx) L14–L47 | Async select + qty + "Add" button + empty placeholder. | Virtualized product grid, search + category filter, double-click adds +1, minus removes line at qty=1. | High | 3 | New `ProductGrid` consuming `useProducts({status:'active', category_id})`, double-click handler + decrement-to-zero. |
| **GAP-POS-010** | POS product list does not filter archived products | [`ProductSearch.tsx`](web/src/features/pos/components/ProductSearch.tsx); [`catalog_service.list_products`](app/services/catalog_service.py) L571–L592 | No `status` filter passed; backend only filters when `status is not None`. | Spec: show only non-archived products. | High | 3 | Always pass `status='active'` from POS queries. |
| **GAP-POS-011** | No category filter in POS | [`ProductSearch.tsx`](web/src/features/pos/components/ProductSearch.tsx) | No category param. | Spec: filter by category. | High | 3 | Add `category_id` param + sticky category sidebar UI. |
| **GAP-POS-012** | No double-click-to-add behavior | [`PosRegister.tsx`](web/src/features/pos/pages/PosRegister.tsx); [`ProductSearch.tsx`](web/src/features/pos/components/ProductSearch.tsx) | Single select then click "Add". | Spec: double-click in grid = +1 qty. | Medium | 3 | Cell `onDoubleClick` → `addLine(productId, +1)`. |
| **GAP-POS-013** | Minus button at qty=1 does not remove the line | [`CartLineRow.tsx`](web/src/features/pos/components/CartLineRow.tsx) L26–L37 | Input has `min={1}`. Cart line API requires `qty > 0`. | Spec: at qty=1, minus removes the line entirely. | Medium | 2,3 | Add DELETE-line endpoint or accept `qty=0`; wire UI minus button. |

### Control rail (middle column)

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-POS-014** | Payment methods + cash payment are merged into a single drawer | [`TenderDrawer.tsx`](web/src/features/pos/components/TenderDrawer.tsx) L52–L195; [`RegisterTotalsColumn.tsx`](web/src/features/pos/components/RegisterTotalsColumn.tsx) L52–L114 | One drawer for cash/card/other. | Spec: separate "Payment methods" modal (records method only) and standalone "Cash payment" button. | High | 3 | Split into two buttons and two flows. |
| **GAP-POS-015** | No "transfer" tender type | [`payment_service.py`](app/services/payment_service.py) L90–L91 | Only `cash`/`card`/`other`. | Spec lists transfer as a first-class method (bank transfer / wallet etc.). | Medium | 2 | Add `transfer` value + map to clearing account in `post_sales_invoice_gl`. |
| **GAP-POS-016** | No "Other expenses" button or model | n/a | `shift_service.add_cash_event` supports payout but no UI; no `pos_expenses` table; no GL posting to "Other expenses" account. | Spec: button records lunch / cleaning supplies as expense; posts Dr Other Expenses / Cr Cash. | Critical | 2,3 | New `pos_expenses` table + service + GL posting; button in control rail. |
| **GAP-POS-017** | Discount permission name (`pos_carts:discount`) does not align with role "sales manager" | [`PosRegister.tsx`](web/src/features/pos/pages/PosRegister.tsx) L61–L62; [`carts.py`](app/api/v1/carts.py) L99 | Permission-gated correctly, but naming is generic. | Spec: discount code depends on sales-manager permission. | Low | 2 | Map `pos_carts:discount` to a "Sales Manager" role in the seeded permissions. |

### Cart panel (left column)

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-POS-018** | No `daily_cart_number` field on `pos_carts` | [`pos_cart.py`](app/models/pos_cart.py) L15–L52 | Only `id`. | Spec: per-day sequence + unique cart id. | High | 2 | Alembic migration adds `daily_cart_number`; `create_cart` increments per branch+day. |
| **GAP-POS-019** | Cart panel shows internal `id` only | [`RegisterTotalsColumn.tsx`](web/src/features/pos/components/RegisterTotalsColumn.tsx) L109–L111 | Shows `cart #${cartId}`. | Spec: show daily number. | Medium | 3 | Read new `daily_cart_number` from API. |
| **GAP-POS-020** | No return-mode toggle on the register; no color shift | [`ReturnDrawer.tsx`](web/src/features/pos/components/ReturnDrawer.tsx); [`PosRegister.tsx`](web/src/features/pos/pages/PosRegister.tsx) | Returns are a separate drawer with no register-level mode. | Spec: toggle on cart shifts UI colors, verifies original invoice, lets cashier swap items in the same flow. | Critical | 3 | Add `return_mode` to `posRegisterStore`; root `data-mode="return"` + CSS recolor; gate normal sale actions when active. |
| **GAP-POS-021** | Return drawer never sends `exchange_cart_id` | [`ReturnDrawer.tsx`](web/src/features/pos/components/ReturnDrawer.tsx) L71–L77 | Always sends `exchange_cart_id: null`. | Backend supports exchange via [`returns_service.py`](app/services/returns_service.py) L90–L92. | High | 3 | When in return-with-exchange mode, link/create active cart and pass its id. |
| **GAP-POS-022** | Customer picker is a stub | [`CustomerPicker.tsx`](web/src/features/pos/components/CustomerPicker.tsx) L14–L37 | Dialog says "walk-in only — unsupported". | Spec: attach a customer for receivables. (Backend cart create accepts `customer_id`, but no PATCH endpoint exists.) | High | 2,3 | Add `PATCH /pos/carts/{id}` to set `customer_id` + CRM picker UI. |

---

## 4. Catalog gaps (`GAP-CAT-*`)

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-CAT-001** | No enforced category depth limit | [`catalog_service.create_category`](app/services/catalog_service.py) L125–L137; `update_category` L140–L156 | Arbitrary `parent_id` depth allowed. | Spec: exactly 4 levels. Return 400 if exceeded. | High | 2 | Walk parents on create/update; raise `ClientError` past depth 4. |
| **GAP-CAT-002** | No depth guard in category UI | [`CategoryCreateDialog.tsx`](web/src/features/catalog/components/CategoryCreateDialog.tsx) L47–L57; [`CategoriesTree.tsx`](web/src/features/catalog/pages/categories/CategoriesTree.tsx) L66–L78 | Can always add a child. | Should disable "Add child" when parent at depth 4. | Medium | 3 | Compute depth from tree and disable button. |
| **GAP-CAT-003** | Enum/select attribute values are not validated server-side against the allowed list | [`catalog_service._validate_product_attributes`](app/services/catalog_service.py) L402–L444 | Server only checks primitive types, not enum membership. | Spec: Enum tags must be a controlled vocabulary. | Medium | 2 | For `type in {select, enum}`, require `value in options.values`. |
| **GAP-CAT-004** | No way to filter products by attribute/enum tag (e.g. "size = M") | [`catalog_service.list_products`](app/services/catalog_service.py) L561–L592; [`ProductsList.tsx`](web/src/features/catalog/pages/products/ProductsList.tsx) L88–L94 | Only `q`, `category_id`, `status` filters. | Spec: enum values used as filter tags. | Medium | 2,3 | Add `attr_filter` query params + GIN index on `products.attributes`. |
| **GAP-CAT-005** | Product form captures `sell_price` (legacy `attributes.price`) | [`ProductFormPage.tsx`](web/src/features/catalog/pages/products/ProductFormPage.tsx) L67–L69, L159–L185; [`catalog_service.py`](app/services/catalog_service.py) L447–L468 | Form sets `sell_price`; backend syncs via `set_product_sell_price`. | Spec: no selling price on the product form. | High | 2,3 | Remove field from form/schema; price comes from price list / latest invoice. |
| **GAP-CAT-006** | Product form captures `standard_cost` | [`ProductFormPage.tsx`](web/src/features/catalog/pages/products/ProductFormPage.tsx) L137–L138, L167–L181; [`product.py`](app/models/product.py) L32 | Editable on product form. | Spec: cost comes from purchase invoices, not the product form. | High | 2,3 | Remove `standard_cost` from merchandising form (keep only as system fallback when no receipt history exists). |
| **GAP-CAT-007** | No `product_variants` model — variants of the same SKU not distinguished | [`product.py`](app/models/product.py); [`stock_movement.py`](app/models/stock_movement.py) L24–L26; [`stock_level.py`](app/models/stock_level.py) L16–L25 | Single row + JSON attributes. | Spec: red vs. black Adidas shirt must be separate stock-keeping entities. | Critical | 2 | New `product_variants` table; phase-migrate `variant_id` (nullable → required) across all stock/sales/PO/GR lines. (See also **D-7**.) |

---

## 5. Inventory & Purchasing gaps (`GAP-INV-*`, `GAP-PUR-*`)

### Inventory

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-INV-001** | Transfers UI is a flat table, not a 3-column Kanban | [`TransfersList.tsx`](web/src/features/inventory/pages/transfers/TransfersList.tsx) L40–L58 | Single `DataTable` with status column. | Spec: Delivery Requests / In Transit / Delivered. | Medium | 3 | Group by `status` and render three columns. |
| **GAP-INV-002** | No sender/receiver warehouse-manager role separation | [`transfers.py`](app/api/v1/transfers.py) L24–L31, L69–L98; [`transfer_batch.py`](app/models/transfer_batch.py) L12–L33 | Anyone with `inventory:update` can dispatch and receive. | Spec: dispatch only by sender manager, receipt only by receiver manager. | High | 2 | Add per-branch RBAC; assert in `dispatch_batch` / `receive_batch`. |
| **GAP-INV-003** | No stock-availability check before creating a transfer | [`transfer_service.create_batch`](app/services/transfer_service.py) L37–L57 | Only validates branches and non-empty lines. | Spec: verify availability at the sender. | High | 2 | Check `on_hand - reserved >= qty` per line before commit. |
| **GAP-INV-004** | `apply_stock_movement` can drive on_hand negative | [`inventory_service.apply_stock_movement`](app/services/inventory_service.py) L52–L78 | No floor check on negative qty_delta. | Spec implies consistent availability. | High | 2 | Enforce non-negative on_hand or explicit backorder flag. |
| **GAP-INV-005** | Inventory adjustments emit no GL entry | [`inventory_adjustments.py`](app/api/v1/inventory_adjustments.py) L19–L46 | Only updates `stock_movement`. | Spec: damage/shortage posted to expense (Dr Shortage / Cr Inventory). | High | 2 | After adjustment, call new `post_inventory_adjustment_gl` using WAVG. |
| **GAP-INV-006** | Only Weighted Average valuation is implemented | [`inventory_valuation_service.py`](app/services/inventory_valuation_service.py); [`inventory_stock.py`](app/schemas/inventory_stock.py) L21–L24 | WAVG only. | Spec: FIFO, LIFO, or WAVG (configurable). | High | 2 | Add `inventory_cost_layer` table + policy switch in accounting settings. |
| **GAP-INV-007** | All stock movements keyed by `product_id` only | [`stock_movement.py`](app/models/stock_movement.py) L24–L26; [`branch_product_costs.py`](app/models/branch_product_costs.py) L19–L28; [`transfer_line.py`](app/models/transfer_line.py) L18–L20 | No `variant_id`. | Spec needs per-variant tracking. | Critical | 2 | Phased migration to add nullable `variant_id` → required after backfill. Depends on **GAP-CAT-007**. |

### Purchasing

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-PUR-001** | PO line requires `unit_cost > 0` at draft | [`purchase_orders.py` schema](app/schemas/purchase_orders.py) L11–L14; [`purchase_order_line.py`](app/models/purchase_order_line.py) L23–L24; [`OrderForm.tsx`](web/src/features/purchasing/pages/orders/OrderForm.tsx) L40–L48 | `unit_cost` is required and strictly positive on PO lines. | Spec Step 1: PO with no prices. | Critical | 2,3 | Make `unit_cost` optional/nullable on PO; require it only on Purchase Invoice / GR. |
| **GAP-PUR-002** | No distinct "Purchase Invoice" entity; GR copies PO costs | [`goods_receipt_service.py`](app/services/goods_receipt_service.py) L124–L166; [`purchase_order_service.py`](app/services/purchase_order_service.py) L123–L150 | GR uses `pol.unit_cost` directly. | Spec Step 2: a separate Purchase Invoice captures cost prices at confirmation time. | High | 2,3 | Add `purchase_invoice` + `purchase_invoice_line` (priced); link to PO lines; GR consumes invoice lines. |
| **GAP-PUR-003** | GR always credits AP — no cash purchase path | [`document_posting_service.post_goods_receipt_gl`](app/services/document_posting_service.py) L438–L486 | Always Cr AP. | Spec mentions Dr Inventory / Cr Cash for cash purchases. | Medium | 2 | Branch on settlement method (cash vs credit). |

---

## 6. Accounting gaps (`GAP-ACC-*`)

### Chart of Accounts

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-ACC-001** | No depth limit on CoA | [`chart_accounts.py`](app/models/chart_accounts.py) L13–L35 | Arbitrary `parent_id` depth. | Spec: 5 levels. | High | 2 | Service-layer validation; reject create/update past depth 5. |
| **GAP-ACC-002** | No parent/child account-type consistency | [`chart_accounts.py`](app/models/chart_accounts.py) L27–L32 | Sub-account `account_type` not validated against ancestor. | Spec: e.g. Suppliers must be under Liabilities. | Medium | 2 | Validate `account_type` against root ancestor on create/update. |
| **GAP-ACC-003** | No Chart-of-Accounts admin UI | [`api.ts`](web/src/features/accounting/api.ts) L40–L44 | Only `AccountPicker` + read API. | Spec: business admin must manage CoA. | Medium | 3 | New tree editor under `/accounting/coa`. |
| **GAP-ACC-004** | Seeded chart is flat | [`seed_service.py`](app/services/seed_service.py) L347–L358 | Flat with `parent_id=None`. | Spec: five-level skeleton under each top-level branch. | Low | 2 | Update seed data with hierarchical skeleton. |

### Journal entries

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-ACC-005** | `post_journal_entry` does not validate `account_id` exists/active/postable | [`accounting_service.post_journal_entry`](app/services/accounting_service.py) L52–L82 | Accepts any integer. | Spec: never post against deleted/control accounts. | Medium | 2 | Pre-flight account lookup + active/control checks. |
| **GAP-ACC-006** | `journal_inquiry_service.get_entry_detail` silently drops orphaned lines | [`journal_inquiry_service.py`](app/services/journal_inquiry_service.py) L172–L176 | If account missing, line omitted from response. | Spec: never lose ledger lines silently. | Medium | 2 | Return orphan placeholder rows instead. |

### GL coverage

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-ACC-007** | No opening-balance posting service | n/a | No `post_opening_balance_gl`. | Spec: capital injection must auto-post Dr Assets / Cr Equity. | High | 2 | New idempotent service + admin onboarding screen. |
| **GAP-ACC-008** | No generic Receipt/Payment Voucher | [`document_posting_service.py`](app/services/document_posting_service.py) | Only AR cash receipt (`post_ar_cash_receipt_gl`). | Spec: any debit account → any credit account. | High | 2 | New `post_voucher_gl(debit_account_id, credit_account_id, amount, currency, fx_rate, memo)` service + voucher API. |
| **GAP-ACC-009** | AP payment applications don't post GL | [`subledger_service.py`](app/services/subledger_service.py) L147–L179 | AP payment reduces open item without GL. | Spec: must post Dr AP / Cr Cash. | Critical | 2 | Add `post_ap_payment_gl` symmetric to `post_ar_cash_receipt_gl`. |
| **GAP-ACC-010** | No GL for inventory adjustments (already in `GAP-INV-005`) | — | — | — | High | 2 | Cross-reference. |
| **GAP-ACC-011** | No FX revaluation at period close | n/a | No revaluation job; lines stored in base amounts only. | Spec: auto-compute FX gain/loss on AR, AP, bank balances. | High | 2 | Period-close job: revalue open balances vs. closing rate, post Dr/Cr FX Gain or Loss. |
| **GAP-ACC-012** | Journal lines are single-currency in base units | [`journal_entries.py`](app/models/journal_entries.py) L59–L60 | Numeric base amounts only. | Spec: per-line currency + base amount + FX rate. | High | 2 | Add `currency_code`, `transaction_amount`, `fx_rate` columns to `journal_lines`. |

### Fiscal periods

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-ACC-013** | Binary open/closed only — no soft-close state | [`fiscal_period.py`](app/models/fiscal_period.py) L20; [`accounting_governance_service.set_period_status`](app/services/accounting_governance_service.py) L72–L84 | `status ∈ {open, closed}`. | Spec recommendation: soft-close (review window) → hard-close. | Medium | 2,3 | Add `soft_closed` value + different posting rules for reversals/corrections. |

### Production / BoM

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-ACC-014** | No BoM / Production Orders module | n/a | Not found in codebase. | Spec: define a finished product as components; compute cost as Σ(component_qty × component_cost). | High | 2,3 | New domain: `bill_of_materials`, `bom_component`, `production_order` with WIP postings (Dr WIP / Cr Inventory then Dr Finished / Cr WIP). |

### Frontend gaps

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-ACC-015** | AP UI applies payment with no awareness that no GL is posted | [`ApApplyPaymentDrawer.tsx`](web/src/features/accounting/pages/ap/ApApplyPaymentDrawer.tsx) L66–L78 | Submits with no GL warning. | Misleading after `GAP-ACC-009` lands. | Medium | 3 | Once backend fix lands, surface posted JE id. |
| **GAP-ACC-016** | Fiscal period UI shows only Close / Reopen | [`FiscalPeriodsList.tsx`](web/src/features/accounting/pages/fiscal-periods/FiscalPeriodsList.tsx) L25–L65 | Two actions only. | Needs soft-close state visualization. | Low | 3 | Add badge + actions for soft-close. |
| **GAP-ACC-017** | No screens for opening balances, FX revaluation runs, inventory-adjustment posting impact | n/a | All missing. | Required UIs once backend services exist. | High | 3 | New `/accounting/opening-balances`, `/accounting/fx-revaluation` pages. |

---

## 7. CRM, Marketing, and AI gaps (`GAP-CRM-*`, `GAP-AI-*`)

### CRM

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-CRM-001** | No per-customer performance dashboard | [`CustomerDetail.tsx`](web/src/features/crm/pages/customers/CustomerDetail.tsx) L70–L158; [`customer_crm_service.py`](app/services/customer_crm_service.py) L28–L172 | Shows profile + invoices + loyalty ledger only. | Spec: AOV, Top Products, basket trend, LTV, last visit, total spend, debt — styled like HR perf page. | High | 2,3 | New `customer_performance` API + `/crm/customers/:id/performance` page mirroring `/hr/employees/:id/performance`. |
| **GAP-CRM-002** | Customer debt not surfaced | [`customer_profile.py`](app/models/customer_profile.py) L24–L26; [`schemas/customer_profile.py`](app/schemas/customer_profile.py) L60–L71 | `receivables_account_id` stored but no balance returned. | Spec: show outstanding AR on customer page. | High | 2,3 | Aggregate AR open items per customer; surface in detail/performance views. |
| **GAP-CRM-003** | Loyalty rule engine is fixed columns, not flexible | [`loyalty.py`](app/models/loyalty.py) L32–L55; [`AccrualRuleForm.tsx`](web/src/features/crm/pages/loyalty/AccrualRuleForm.tsx) L43–L111 | Only `points_per_unit` and `currency_per_point`. | Spec: rules like "50 points if invoice > 1000 LYD"; small DSL recommended. | High | 2,3 | Add `rule_config JSONB` + evaluator; UI rule builder. |
| **GAP-CRM-004** | Loyalty purchase accrual is not wired to sales finalization | [`loyalty_service.adjust_points`](app/services/loyalty_service.py) L95–L142; absence of `LedgerReasonCode.PURCHASE` callers outside BI | Engine exists but does not trigger on invoice finalize. | Spec: customers earn points on purchase. | Critical | 2 | In `finalize_paid_cart`, evaluate rules and call `adjust_points` with `PURCHASE`. |

### Marketing AI

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-AI-001** | Marketing advisory UI does not expose `facts_used` (no drill-down) | [`MarketingAdvisory.tsx`](web/src/features/marketing/pages/advisory/MarketingAdvisory.tsx) L34–L120; [`marketing_advisory_service.py`](app/services/marketing_advisory_service.py) | Backend returns `facts_used`; UI renders only `suggestions`. | Spec: each AI suggestion opens detail backed by raw SQL facts. | High | 3 | Add a "Why?" drawer per card showing the relevant fact slice. |
| **GAP-AI-002** | Marketing advisory facts come from historical invoices, not live carts | [`marketing_advisory_service.py`](app/services/marketing_advisory_service.py) L36–L77, L210–L244 | Aggregates from `SalesInvoiceLine`. | Spec wording: "read cart contents". | Medium | 2 | Acceptable if documented; otherwise add open-cart aggregator. |
| **GAP-AI-003** | Marketing analytics page is non-AI, no charts | [`Analytics.tsx`](web/src/features/marketing/pages/analytics/Analytics.tsx) | Four count cards only. | Spec: simple Recharts visualizations / cards for non-technical manager. | Medium | 3 | Add Recharts bar/line charts for top-selling & co-bought trends. |
| **GAP-AI-004** | Campaign cards show raw `segment_code` (e.g. `at_risk`) | [`CampaignAdvisor.tsx`](web/src/features/marketing/pages/campaigns/CampaignAdvisor.tsx) L96–L112 | Raw key visible. | Spec: plain language for non-technical user. | Low | 3 | Translate `segment_code` via i18n. |

### HR AI / other AI

| ID | Title | Where | Current | Spec | Severity | Phase | Fix sketch |
|----|-------|-------|---------|------|----------|-------|------------|
| **GAP-AI-005** | HR anomalies uses rolling N-day lookback (default 14), not last calendar month | [`hr_anomaly_service.py`](app/services/ai/hr_anomaly_service.py) L50–L89, L176–L224; [`AnomaliesDashboard.tsx`](web/src/features/hr/pages/anomalies/AnomaliesDashboard.tsx) L32–L52 | Configurable lookback days, default 14. | Spec: send last month's attendance. | Medium | 2,3 | Add "last month" preset + default. |
| **GAP-AI-006** | HR anomalies advanced view dumps raw JSON facts | [`AnomaliesDashboard.tsx`](web/src/features/hr/pages/anomalies/AnomaliesDashboard.tsx) L179–L183 | `<details>` with `JSON.stringify(facts_used)`. | Spec: simple, immediately readable. | Low | 3 | Replace with structured rows / tooltips. |
| **GAP-AI-007** | AI advisory endpoints have no rate limit | [`api/v1/ai_advisory.py`](app/api/v1/ai_advisory.py); [`api/v1/marketing.py`](app/api/v1/marketing.py); [`core/rate_limit.py`](app/core/rate_limit.py) | No `@limiter.limit` decorator. | Epic 14.6 planned. | Medium | 2 | Apply `slowapi` limiter to all AI routes. |
| **GAP-AI-008** | No AI usage log / cost tracker | [`llm_client.py`](app/services/ai/llm_client.py) L61–L75; [`marketing_advisory_service.py`](app/services/marketing_advisory_service.py) L192–L194 | LLM `usage` field discarded. | Epic 14.5 planned. | Medium | 2 | New `ai_usage_log` table; persist endpoint, model, tokens, cost. |
| **GAP-AI-009** | No response cache by facts-hash | n/a | Each request hits LLM. | Epic 14.7 planned. | Medium | 2 | Hash the input `facts`, cache the LLM response with TTL. |

---

## 8. Severity rollup

| Severity | Count |
|----------|-------|
| **Critical** | 11 |
| **High**     | 27 |
| **Medium**   | 21 |
| **Low**      |  8 |
| **Total**    | 67 |

## 9. Suggested phase distribution

| Phase | Workload (gap count) | Theme |
|-------|----------------------|-------|
| **2 — Backend & DB** | ~50 gaps | Variants, money/Decimal, accounting core, multi-currency, BoM, POS data, inventory adjustments GL, rate limiting / AI logging. |
| **3 — Frontend** | ~30 gaps | POS overhaul, transfers Kanban, accounting UIs, customer performance page, AI drill-downs. |

Many gaps span both phases (backend service + UI surface), so totals exceed 67.

---

## 10. Next steps (Phase 2 entry criteria)

Before starting Phase 2:

1. Confirm severity/priority of `Critical`-tagged gaps with the product owner.
2. Lock the **decision points**:
   - **Variants schema** — adopt the proposed `product_variants` design? (See `GAP-CAT-007` / `GAP-INV-007`.)
   - **Stock valuation** — keep WAVG as default and add FIFO as opt-in setting?
   - **CoA depth** — 5 levels, enforced at service layer?
   - **Voucher model** — single generic voucher service vs. dedicated receipt / payment / journal voucher schemas?
   - **Loyalty DSL shape** — JSONB rule_config vs. hardcoded rule family?
3. Confirm Phase 2 sequencing (proposed in plan §7 Phase 2):
   1. Money → Decimal
   2. Variants migration
   3. Accounting core (opening balance, generic voucher, inventory adjustment GL, AP payment GL, BoM)
   4. Multi-currency + FX revaluation
   5. FIFO cost layers
   6. POS data (`daily_cart_number`, `exchange_cart_id`, `pos_expenses`)
   7. Branch-aware CoA reports

---

*This is Phase 1's audit deliverable. No code was modified.*

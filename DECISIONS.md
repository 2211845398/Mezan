# Mezan — Phase 2 Architecture Decisions

**Date:** May 2026
**Status:** Phase 2 entry decisions confirmed and locked.

---

## Decision 1 — Product Variants

**Decision:** Adopt the proposed `product_variants` schema.

**Rationale:** Proper stock-keeping requires distinct entities for each color/size combination. The JSON attributes approach cannot reliably track cost layers or prevent cross-contamination between red and black shirts of the same product.

**Schema sketch (updated May 2026 — relational variant axes):**
```sql
attributes(id, code UNIQUE, name, sort_order, metadata JSONB)
attribute_values(id, attribute_id FK, code, label, metadata JSONB, UNIQUE(attribute_id, code))
product_variants(id, product_id, sku, barcode, attribute_values JSONB, active, ...)
product_variant_attributes(variant_id, attribute_id, attribute_value_id, UNIQUE(variant_id, attribute_id))
category_attribute_defs(..., attribute_id FK nullable, use_for_variants BOOLEAN)
```

**Source of truth:** `product_variant_attributes` + `attribute_values`. `product_variants.attribute_values` JSONB is a denormalized read cache synced from the pivot (deprecated for writes).

**Implementation notes:**
- Phase-migrate all `*_lines` tables to add nullable `variant_id`.
- Backfill: create one variant per existing product; script `backfill_variant_attribute_pivot.py` for pivot from legacy JSONB.
- After backfill verification, mark `variant_id` NOT NULL.
- Variant generator: Cartesian product on `attribute_value_id` lists; APIs `preview-generate` and `sync` on `/products/{id}/variants/`.
- `stock_movement`, `stock_level`, `branch_product_costs`, `pos_cart_line`, `sales_invoice_line`, `purchase_order_line`, `goods_receipt_line`, `transfer_line` — all use `variant_id`.

---

## Decision 2 — Inventory Valuation

**Decision:** Keep Weighted Average (WAVG) as the default method. Add FIFO as an opt-in setting per business.

**Rationale:** WAVG is sufficient for v1 and simpler to implement. FIFO adds compliance value for some jurisdictions but is not required immediately.

**Implementation notes:**
- Add `valuation_method ENUM('wavg', 'fifo')` to `accounting_settings` (default 'wavg').
- When FIFO is selected, use `inventory_cost_layer` table to track purchase layers.
- COGS calculation for FIFO: consume oldest layers first.
- Both methods must produce identical results when only one cost layer exists.

---

## Decision 3 — Chart of Accounts Depth

**Decision:** Enforce a maximum depth of 5 levels at the service layer.

**Rationale:** The spec calls for 5 levels (root + 4 sub-levels). Unlimited depth risks runaway hierarchies and complicates reporting roll-ups.

**Implementation notes:**
- Validate on `create_chart_account` and `update_chart_account`.
- Walk parents from `parent_id` and reject if depth would exceed 5.
- Also validate `account_type` consistency: child `account_type` must match ancestor's top-level branch type (Asset, Liability, Equity, Revenue, Expense).

---

## Decision 4 — Vouchers & GL Postings (Hybrid Approach)

**Decision:** Hybrid approach — dedicated frontend UIs, unified backend engine.

**Rationale:** Cashiers and accountants think in entity terms (Customer, Supplier, Cash Register), not abstract debits/credits. The frontend should guide them. The backend should be DRY with a single posting engine.

**Frontend (UI) forms (locked):**
1. **Receipt Voucher** — select Customer (or other debtor) + Cash/Bank account + amount.
2. **Payment Voucher** — select Supplier (or other creditor) + Cash/Bank account + amount.
3. **Expenses** — select Expense account + Cash/Bank account + amount + description.
4. **Manual Journal Entry** — traditional multi-line debit/credit form for accountants.

**Backend (unified engine):**
- Single service: `post_voucher_gl(debit_account_id, credit_account_id, amount, currency, fx_rate, memo, reference_type, reference_id, branch_id, user_id)`
- All frontend forms map their entity selections to the correct CoA accounts, then call this engine.
- The engine enforces double-entry, period open checks, and idempotency.

**Account mapping rules (locked):**
- Customer → `receivables_account_id` on `customer_profile` (Asset)
- Supplier → `payables_account_id` on `supplier` (Liability)
- Cash/Bank → `cash_account_id` on `accounting_settings` or selected clearing account
- Expense → selected expense account from CoA

---

## Decision 5 — Loyalty Rules

**Decision:** Hardcoded rules directly in the backend service. No JSONB DSL or dynamic parsing.

**Rationale:** Absolute stability for the POS system. The POS must not parse DSL or evaluate dynamic expressions on the hot path. Rules are compiled code.

**Hardcoded rules (locked for v1):**
1. **Base rule:** 1 point per 1 LYD spent (rounded down).
2. **Threshold bonus:** +50 bonus points if cart total ≥ 1000 LYD.
3. **Category bonus:** +10 bonus points if cart contains any item from category "Coffee".
4. **First purchase:** 2× points on customer's first invoice.

**Extension path:**
- When new rule types are needed, add explicit columns to `loyalty_accrual_rule` (e.g. `threshold_amount`, `bonus_points`, `category_id`, `applies_to_first_purchase`).
- Never add a generic `rule_config JSONB` that requires runtime interpretation.

---

## Next steps

These decisions are now locked. Phase 2 begins with Epic 19.1 (Money → Decimal conversion), as every subsequent accounting and inventory fix depends on numerically correct money handling.

Updates to these decisions require:
1. A PR that updates this file.
2. Approval from the product owner.
3. Backwards-compatibility analysis if migrations are affected.

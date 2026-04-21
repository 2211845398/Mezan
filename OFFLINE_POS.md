# Offline POS — Engineering Plan

**Status:** Planning. No code in this iteration.
**Owner:** Mezan backend + (future) `web/` SPA and Flutter POS client.
**Source of truth for backend contracts:** this document. When implemented, the matching FastAPI endpoints, services, and migrations must reference the section numbers here.

---

## 1. Problem statement

Point-of-sale terminals in retail stores **cannot depend on a stable internet connection**. A checkout that blocks on network latency or outright outage directly translates to lost revenue, blocked customers at the counter, and angry staff. At the same time, Mezan's backend is the **only source of truth** for:

- Inventory levels (`stock_levels`, `branch_product_costs`).
- Fiscal-compliant invoice numbering (`branch_sequences` per branch).
- Financial accounting (immutable journal entries on invoice finalization).
- Loyalty ledger and discount usage counters.
- Audit log and RBAC enforcement.

The goal is therefore a hybrid model: **fully functional checkout when offline**, **reconciled authoritatively when online**, with **no silent data loss** and **no fiscal number allocated offline**.

We adopt **Pattern 3 — Offline Queue + Sync on Reconnect**, the same model used by Square, Shopify POS, and Lightspeed. This document defines that pattern for Mezan.

---

## 2. Scope and non-goals

### In scope

- Catalog mirroring to the client for offline browsing and cart building.
- Full offline cart lifecycle: create, add lines, apply discounts, tax, tender (cash / card-via-external-reader / other), and locally print a **provisional** receipt.
- Durable local persistence of queued invoices, returns, and shift events.
- Deterministic reconciliation on the backend with strict idempotency.
- Conflict classification (price drift, deleted product, voided discount, stock negative) with a human-resolvable queue.
- Offline observability (counts, last-sync timestamps, last-error details) for managers.

### Out of scope (deliberately)

- **Offline GL posting.** Journal entries are always authored on the backend at sync time, never on the client.
- **Offline fiscal invoice number.** The formal per-branch sequence is issued only at sync time.
- **Offline payment authorization with the bank.** Card payments while offline are accepted only when the terminal's external EFT-POS device authorizes the transaction independently; the client records that external authorization, it does not invent it.
- **Multi-device merge of the same cart.** Carts are owned by a single terminal session until synced.
- **Real-time inventory truth offline.** The client shows **last-known** stock as advisory; the backend is always authoritative and may adjust after sync (e.g., oversell handling — see §8.4).

---

## 3. Principles

1. **Backend is the single source of truth.** The client is a durable queue and a cache.
2. **Idempotency by construction.** Every client-originated operation carries a client-generated UUID (`client_uuid`). The backend deduplicates by it.
3. **No free-form offline numbering.** Provisional identifiers on the client are clearly distinguishable (`TMP-<uuid>`). Official numbers are issued only after successful sync via existing `branch_sequences`.
4. **Deterministic money.** The client must use the same rounding and tax rules as the backend (`Decimal`, two-place rounding, VAT rounded per line with `ROUND_HALF_UP`). See §9.
5. **Sync order matters.** Operations are replayed in **event time order**, not submission order, so shift open/close brackets stay coherent.
6. **No offline secrets.** JWT access tokens stored on the device must be short-lived; refresh token rotation happens during sync.
7. **Separation of probabilistic and deterministic paths.** Mirrors the OCR "basic provider + validation" pattern already in `app/services/invoice_scan_service.py`.

---

## 4. Backend architecture (focus area for this plan)

### 4.1 New models

Implemented as additional SQLAlchemy ORM files under `app/models/`, exposed via `app/models/__init__.py`.

| Model | Purpose | Key columns |
|-------|---------|-------------|
| `PosSyncSubmission` | Envelope: one POST from a terminal containing N operations. | `id`, `client_submission_uuid` (unique), `terminal_id`, `shift_id` (nullable), `user_id`, `received_at`, `operation_count`, `status` (`accepted` / `partial` / `rejected`), `app_version`, `client_clock_skew_ms` |
| `PosSyncOperation` | One client-side operation (cart finalize, return, shift event, discount usage, cash event). | `id`, `submission_id` (FK), `client_uuid` (unique **globally**), `kind` (`cart_finalize` / `return` / `shift_open` / `shift_close` / `cash_event` / `price_check`), `sequence` (int), `payload_json` (JSONB), `client_event_at` (tz-aware), `result_status` (`ok` / `duplicate` / `conflict` / `failed`), `result_code`, `result_payload_json`, `linked_resource_type`, `linked_resource_id`, `processed_at` |
| `PosOfflineBundleSnapshot` | Immutable snapshot identifier for catalog a client last pulled. | `id`, `branch_id`, `snapshot_etag` (hash), `generated_at`, `products_count`, `categories_count`, `discounts_count`, `customers_count`, `published` (bool) |

Rationale for a dedicated envelope (`PosSyncSubmission`) on top of per-operation idempotency: it gives us a natural unit for **audit**, **partial rollback**, and **debug download** when the client reports "I am stuck at N pending items." It also lets the **client** retry the full envelope without worrying about partial duplication; individual `client_uuid` rows dedupe safely.

We do **not** add offline flags to existing domain tables (`pos_cart`, `sales_invoice`, …). The client persists its draft state; only the final, server-validated resource is written to the canonical tables on sync.

### 4.2 Alembic migration

Batch name: `g1a2b3c4d5e6_pos_offline_sync.py` (next after current head). It adds the three tables above plus the indexes below:

- `uq_pos_sync_submissions_client_submission_uuid` (unique).
- `uq_pos_sync_operations_client_uuid` (unique).
- `ix_pos_sync_operations_submission_id` (btree).
- `ix_pos_sync_operations_result_status` (btree partial on `result_status IN ('conflict','failed')`).
- `ix_pos_offline_bundle_branch_etag` (unique `(branch_id, snapshot_etag)`).

`downgrade()` drops the three tables. No data backfill is required.

### 4.3 New service: `app/services/pos_sync_service.py`

Pure orchestration; defers to existing services:

- `cart_service` for cart state transitions.
- `invoice_service` / `numbering_service` for fiscal invoice creation.
- `document_posting_service` for GL posting.
- `returns_service` for returns.
- `shift_service` for shift events.
- `branch_scope.require_branch_open_for_operations` reused as-is.

Public API:

- `accept_submission(db, *, terminal, user, payload: PosSyncSubmissionRequest) -> PosSyncSubmissionResult` — persists the envelope, iterates operations in `sequence` order, calls dispatchers per `kind`, writes per-op results, and commits in one transaction (or fails the whole envelope if any single op raises a non-conflict error).
- `replay_operation(db, *, op: PosSyncOperation) -> PosSyncOperationResult` — pure function for idempotent re-execution; exposed for admin re-drive of failed envelopes.
- `mark_conflict(db, *, op, code, detail)` — records soft failures that require human review without failing the envelope.

### 4.4 Dispatch table (per operation kind)

| `kind` | Dispatcher | Idempotency strategy | Conflict classes surfaced |
|--------|------------|----------------------|----------------------------|
| `cart_finalize` | Builds server cart → locks → issues fiscal invoice number via `numbering_service` → creates `SalesInvoice` + lines → posts GL via `document_posting_service.post_sales_invoice_gl`. Accepts an optional pre-validated payment ledger reference. | `client_uuid` maps 1:1 to `SalesInvoice.client_uuid` (new column on `sales_invoices`; nullable for existing rows, unique when non-null). | `price_drift`, `product_archived`, `branch_archived`, `tax_rate_changed`, `discount_invalid_now`, `stock_negative_oversell`, `fiscal_period_closed` |
| `return` | Resolves original invoice (by `client_uuid` or by fiscal number), delegates to `returns_service.create_return`. | `client_uuid` on return; also resolves `original_invoice_reference` by `client_uuid` when the original was also offline-originated. | `original_invoice_not_found`, `original_invoice_voided`, `return_exceeds_remaining_qty` |
| `shift_open` | `shift_service.open_shift` if not already open; otherwise returns duplicate. | `client_uuid` on `pos_shifts` (new nullable unique column). | `shift_already_open`, `user_not_authorized` |
| `shift_close` | `shift_service.close_shift` with client-computed counted-cash-on-hand. | `client_uuid` on close event. | `shift_not_open`, `variance_out_of_tolerance` (advisory only) |
| `cash_event` | `shift_service.add_cash_event` (paid-in / paid-out). | `client_uuid`. | `shift_not_open` |
| `price_check` | No-op on the server; records audit breadcrumb for BI. | `client_uuid`. | — |

### 4.5 Fiscal invoice number allocation rule

- The **only** place a fiscal number is minted is `numbering_service.next_sequence(branch, kind="sales_invoice")`, called **inside** the sync transaction **after** cart validation and **before** GL posting. Offline clients never allocate numbers.
- The returned number is returned to the client in the sync response so the client can reprint a proper receipt.
- If the allocation fails (e.g., fiscal period closed), the operation is marked `conflict: fiscal_period_closed` and the backend emits **no** side effects for that op, though sibling ops in the same envelope still commit.

### 4.6 Stock adjustment and oversell policy

At sync time, `cart_finalize` performs `inventory_service.apply_stock_movement(...)` exactly once per line. Two modes are supported via a new `ACCOUNTING_OVERSELL_POLICY` setting:

- `allow` (default): negative `stock_levels.on_hand` is permitted, operation succeeds, and a `stock_negative_oversell` conflict is flagged for back-office review (not a failure).
- `block`: negative on-hand is rejected; operation marked `conflict: stock_negative_oversell` and the sibling GL posting is skipped for that op.

Weighted-average cost updates use the **server's current** `BranchProductCost`, not the client's snapshot.

### 4.7 Catalog bundle endpoint

A new endpoint, `GET /api/v1/pos/offline/bundle`, returns a minimal, tenant-scoped, deterministic bundle the client can cache.

Contents:

- Active products in the caller's branch scope with: `id`, `barcode`, `name`, `category_id`, `output_vat_rate`, `standard_cost`, `active_price` (via `pricing_service.resolve_price`), `uom`, `is_weighable`.
- Categories: `id`, `name`, `parent_id`.
- Active discount rules (POS-eligible subset only) with schedule windows.
- Customers last-seen in the branch in the last N days (configurable), `id`, `phone_tail4`, `display_name`, `loyalty_balance` (advisory).
- `accounting.output_vat_rate_default`.
- `snapshot_etag` and `generated_at`.

Rules:

- `snapshot_etag` is `sha256(sorted_canonical_json)` and is stored in `pos_offline_bundle_snapshots`.
- The client sends `If-None-Match: <etag>` on subsequent calls; server responds `304 Not Modified` when unchanged.
- No PII beyond phone tail and display name leaves the server.
- Bundle excludes archived branches, inactive products, expired discounts.

### 4.8 Sync endpoint surface

| Method & path | Purpose | Permission |
|---------------|---------|------------|
| `POST /api/v1/pos/offline/bundle/download` | Issue or refresh the offline bundle. | `catalog:read` + `pos_carts:create` |
| `POST /api/v1/pos/offline/sync` | Submit a batch envelope of offline operations. | `pos_carts:update` |
| `GET  /api/v1/pos/offline/sync/{submission_id}` | Read back the envelope result (status + per-op outcomes). | `pos_carts:read` (new permission — see §4.9) |
| `GET  /api/v1/pos/offline/sync/conflicts` | List unresolved conflicts for a branch. | `pos_carts:update` |
| `POST /api/v1/pos/offline/sync/conflicts/{op_id}/resolve` | Accept or discard a conflict with a reason. | `pos_carts:discount` (conservative; can be split later) |

All routes use existing `require_permission()` and `branch_scope.require_branch_open_for_operations` guards. All sync mutations are wrapped by a new rate-limit bucket `pos_offline_sync` (default `30/minute` per terminal) through `slowapi`.

### 4.9 Schemas (`app/schemas/pos_offline.py`)

`PosSyncOperationPayload` is a discriminated union on `kind` with one Pydantic class per dispatcher listed in §4.4. `PosSyncSubmissionRequest` validates:

- `client_submission_uuid: UUID4` (required).
- `terminal_id: int`, `shift_client_uuid: UUID4 | None` (links to offline-opened shift when present).
- `app_version: str`, `client_clock_skew_ms: int` (advisory; used in §4.11).
- `operations: list[PosSyncOperationPayload]` (1..100 per envelope).

`PosSyncSubmissionResult` returns:

- `submission_id`, `status`, `received_at`, `operation_count`, `accepted_count`, `conflict_count`, `duplicate_count`, `failed_count`, and an ordered `operations: [PosSyncOperationResult]` echoing `client_uuid` and result details (including any newly allocated fiscal `invoice_number`).

Schemas explicitly forbid GL payloads from the client — no `journal_entry_id`, `chart_account_id`, etc. — to prevent tampering.

### 4.10 Concurrency, transactions, locking

- One submission = one DB transaction. Exceptions: a `ValidationError` / `ConflictError` from a dispatcher does **not** abort the transaction; the error is captured as per-op `result_status` and the transaction continues. A `ProgrammingError` or `OperationalError` aborts the transaction and the submission is marked `rejected`; the client retries.
- `SELECT FOR UPDATE` is used on `pos_shifts` when the dispatcher mutates a shift. `stock_levels` writes rely on the existing `version` column for optimistic concurrency (`apply_stock_movement`).
- Envelope replay: if a client retries the **same** `client_submission_uuid`, the server detects it, **does not** reprocess operations, and returns the previously computed `PosSyncSubmissionResult` by reading `pos_sync_operations` and their linked resources. This makes the network layer safely at-least-once.

### 4.11 Client clock skew tolerance

- Operations with `client_event_at` more than 24h in the future compared to server UTC are rejected with `conflict: client_clock_skew`.
- Operations up to 7 days in the past are accepted and posted with `client_event_at` preserved for BI, while `created_at` is server-now; fiscal period enforcement uses `client_event_at`.
- The `client_clock_skew_ms` envelope field is logged for diagnostics and is emitted to the audit log.

### 4.12 Auditing

Every dispatcher calls `audit_service.log` with `action="pos.offline.<kind>.accepted"` or `.conflict` / `.duplicate`. `resource_id = client_uuid`. This gives a precise post-hoc record of what came from offline vs online.

### 4.13 Tests to ship with the implementation

Under `tests/api/pos/offline/`:

1. **Happy path:** create cart, finalize, sync, assert fiscal number issued, GL posted, stock decremented, `PosSyncSubmission.status=accepted`.
2. **Replay idempotency:** POST the same envelope twice → second call returns the first result, no duplicate rows anywhere.
3. **Partial envelope:** 3 ops, one triggers `conflict: product_archived`, the other two succeed. Envelope status = `partial`.
4. **Price drift flag:** price increased server-side after client snapshot; operation succeeds but marks `conflict: price_drift` as advisory.
5. **Fiscal period closed:** cart finalize on a closed period ⇒ `conflict: fiscal_period_closed`, zero GL side effects.
6. **Offline shift bracket:** open → sell → close in one envelope; `PosShift.variance` computed from server-valued receipts.
7. **Unknown client UUID on returns:** returns an offline invoice that never synced ⇒ `conflict: original_invoice_not_found`, resolver endpoint allows re-pointing after the original's envelope arrives.
8. **Clock skew:** `client_event_at` set to +48h ⇒ rejected.
9. **RBAC:** a user lacking `pos_carts:update` cannot POST sync.
10. **Archived branch:** sync aimed at an archived branch is rejected before any dispatcher runs.

---

## 5. Backend contracts that must change in existing code

These are pinpointed, minimal-blast-radius additions. All are non-breaking for existing online flows.

| File | Change | Why |
|------|--------|-----|
| `app/models/sales_invoice.py` | Add `client_uuid: Mapped[str \| None]` with unique-when-not-null index. | Dedup finalize operations end-to-end. |
| `app/models/pos_shift.py` | Add `client_uuid` nullable unique for both open and close envelope records. | Dedup shift events. |
| `app/models/sales_return.py` | Add `client_uuid` nullable unique. | Dedup returns. |
| `app/services/numbering_service.py` | Expose `next_sequence_in_tx(...)` variant so it can be called inside a dispatcher without self-committing. | Fiscal allocation must live in the envelope transaction. |
| `app/services/cart_service.py` | Add a `build_and_finalize_from_offline_payload(...)` entry point that mirrors the online flow but accepts a payload carrying `client_uuid`s for the cart and each line. | Keeps cart state machine authoritative while still replayable. |
| `app/services/inventory_service.py` | No change to algorithm; expose `apply_stock_movement` with an `oversell_policy` kwarg honored by §4.6. | Configurable behavior without forking logic. |
| `app/core/config.py` | `POS_OVERSELL_POLICY: str = "allow"`, `POS_OFFLINE_BUNDLE_CUSTOMER_LOOKBACK_DAYS: int = 30`, `POS_OFFLINE_SYNC_MAX_OPS_PER_SUBMISSION: int = 100`. | Operational tunables. |
| `app/api/v1/` | New `pos_offline.py` router; export in `app/api/v1/__init__.py`; include in `app/main.py`. | Standard registration. |
| `app/services/seed_service.py` | Add `("pos_carts","read")` permission (if not already present) and leave existing role bundles unchanged. | Minimum permission surface. |

---

## 6. Frontend guidelines (to prevent repeating Bonyan's mistakes)

This section captures **what the `web/` SPA and the Flutter app must do** to pair cleanly with §4. Keep this authoritative; when the front-ends are built, link each bullet to a file.

### 6.1 Persistence

- Web: **IndexedDB via Dexie** (the same choice Bonyan made correctly), with strongly typed tables: `catalog_products`, `catalog_categories`, `catalog_discounts`, `catalog_customers`, `offline_carts`, `offline_operations_queue`, `bundle_meta`.
- Flutter: `sqflite` with an equivalent schema; do **not** reuse Dexie concepts, just the contracts.
- Dependencies MUST sit in `dependencies`, **never** `devDependencies` (Bonyan misclassified `dexie` — do not repeat).

### 6.2 Client UUIDs and stamping

- Every cart receives `client_uuid = crypto.randomUUID()` the moment it is created.
- Every finalize, return, shift open/close, cash event, and discount application receives its own `client_uuid` at the moment of the user action, not at sync time.
- Receipts printed offline carry a visible **`TMP-<first-8-chars-of-uuid>`** watermark until the fiscal number returns from sync; the client then reprints a "fiscal copy" on demand.

### 6.3 Money arithmetic

- Decimals only (JS: `decimal.js` / Flutter: `decimal`). Never `number` / `double`.
- Rounding: `ROUND_HALF_UP` to two decimals, matching `app/utils/money.q2`.
- Tax rounding: per line, then sum — matches backend `cart_service`.
- Any divergence is a **correctness bug**, not a UX issue.

### 6.4 Sync worker

- A single background worker drains `offline_operations_queue` FIFO by `client_event_at`.
- Batch size bounded by the server `POS_OFFLINE_SYNC_MAX_OPS_PER_SUBMISSION`.
- Retries with exponential backoff (2s → 4s → 8s → 30s cap), capped at 5 attempts per submission; after that, the UI surfaces it as a **blocking banner** that only clears when an admin resolves the conflict or edits the operation.
- Never drop a queued operation silently.

### 6.5 UI invariants

- The POS screen must be reachable and functional when offline. Disable **only** card-gateway-dependent tenders if the external reader is also offline.
- Reports, analytics, BI, and HR screens are **online-only**; show a clear "offline, reconnect to refresh" state.
- A persistent "N operations pending sync" indicator is always visible in the POS chrome when the queue is non-empty.
- When a conflict arrives back from the server, a toast directs the cashier to a **Conflict Resolver** drawer listing each item with accept / discard / re-send options. Final authority stays with the backend.

### 6.6 Security

- Access token in memory; refresh token in httpOnly cookie for the web SPA. The Flutter app stores the refresh token in the platform secure enclave (Keychain / Keystore). No `localStorage` JWTs (Bonyan's mistake).
- Offline discount codes bound to a cart are accepted by the client only if they exist in the cached bundle; server still revalidates on sync.

---

## 7. Backend delivery plan (epic-sized)

This is the order in which the backend lands, each increment independently shippable.

### E-POS-OFFLINE-1 — Catalog bundle endpoint
- Model: `PosOfflineBundleSnapshot`.
- Service: `pos_offline_bundle_service` with `build_bundle(db, branch_id) -> Bundle` + `etag`.
- API: `POST /api/v1/pos/offline/bundle/download` with ETag negotiation.
- Tests: shape, archived-branch exclusion, ETag reuse (`304`).

### E-POS-OFFLINE-2 — Envelope store and replay
- Models: `PosSyncSubmission`, `PosSyncOperation`.
- Service: `pos_sync_service.accept_submission` with a **no-op dispatcher** that only records operations. Useful for end-to-end wiring and replay semantics before per-kind logic.
- API: `POST /api/v1/pos/offline/sync`, `GET /api/v1/pos/offline/sync/{id}`.
- Tests: replay idempotency, malformed payload, RBAC.

### E-POS-OFFLINE-3 — Dispatchers for `cart_finalize` and `return`
- Adds `client_uuid` to `sales_invoices` and `sales_returns`.
- Wires to `cart_service`, `invoice_service`, `numbering_service`, `document_posting_service`, `returns_service`.
- Conflict codes per §4.4.
- Tests 1–5 and 7 from §4.13.

### E-POS-OFFLINE-4 — Shift + cash events
- Adds `client_uuid` to `pos_shifts` and shift events.
- Dispatchers for `shift_open`, `shift_close`, `cash_event`.
- Test 6 from §4.13.

### E-POS-OFFLINE-5 — Conflicts surface + resolver
- `GET /api/v1/pos/offline/sync/conflicts`.
- `POST /api/v1/pos/offline/sync/conflicts/{op_id}/resolve`.
- Human-in-the-loop review.

### E-POS-OFFLINE-6 — Observability
- `audit_service` calls everywhere.
- Add `POS offline` metrics (pending ops per branch, conflict rate, p95 sync latency) to `executive_bi_service` read paths.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Client replays crafted envelopes from another user's token | Submission rejected unless `terminal_id` ∈ active terminals for the authenticated user's branch scope; `client_submission_uuid` uniqueness is enforced globally, not per-user. |
| Conflicting carts across two terminals sell the last unit | Policy `block` rejects negatives; policy `allow` flags for reconciliation. Either way backend remains consistent. |
| Offline card payment that the bank never actually authorized | Clients may only record a card tender when an external EFT-POS prints an authorization reference; the receipt carries that reference and is surfaced on the conflict board so finance can reconcile. The backend never synthesizes card authorizations. |
| Large envelopes time out | Hard cap of 100 ops per submission (§4.8 config); clients split larger queues into ordered envelopes with distinct `client_submission_uuid`s. |
| Stale offline bundle causes price / tax drift | Every finalize snapshots server price and tax **again** at sync; drift is flagged as advisory. The client shows "prices may have changed" when the bundle is older than a configured threshold. |

---

## 9. Open questions

1. Do we support **on-account (AR) sales** offline? Default plan: yes, but the backend creates the AR open item at sync; client prints a provisional on-account receipt with `TMP-` number. Confirm before implementing E-POS-OFFLINE-3.
2. Do we support **partial refunds against offline-originated originals that haven't synced yet**? Default plan: **no**. The client must sync the original first. This keeps the state machine simple.
3. Do we want a per-branch kill switch to force online-only mode for a period (e.g., month-end close)? Recommend yes, stored in `global_config`.

---

*This plan is authoritative. Any deviation during implementation must update this file in the same PR.*

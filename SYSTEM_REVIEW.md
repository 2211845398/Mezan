# MEZAN ERP — System Review

A comprehensive read-only review of the MEZAN backend (FastAPI + SQLAlchemy
2.0 async + PostgreSQL + Alembic + `uv` + Docker). The review covers Docker,
Alembic, the application source under `app/`, the tests under `tests/`, and
`PROJECT_STATE.md`. Citations use `path:line` format.

> Important: this document is **a code review only**. It does not change any
> source code. The companion deliverable is `tests/test_happy_user_journey.py`,
> which is the runnable Happy User Journey test scenario described at the end.

---

## 1. Strengths

| # | Strength | Where it lives | Why it is a strength |
|---|----------|----------------|----------------------|
| 1 | Clean four-layer separation: `api/v1` (HTTP only) → `services/` (business logic) → `models/` (ORM) → `schemas/` (Pydantic) | `app/api/v1/`, `app/services/`, `app/models/`, `app/schemas/` (e.g. router `app/api/v1/sales.py:24` calls service `app/services/invoice_service.py:19`) | Matches the workspace rule (`.cursor/rules/01-project-context.mdc`); business rules can be unit-tested without HTTP, and routes stay thin and reviewable. |
| 2 | Async SQLAlchemy 2.0 + asyncpg with a single shared `AsyncSessionLocal` and an explicit `get_db` DI generator | `app/core/config.py:89-94`, `app/db/database.py` (engine + session factory), `app/api/deps.py:24` | Correct use of the modern async stack; sessions are properly scoped per request and overridable in tests via `app.dependency_overrides`. |
| 3 | RBAC with role permissions **plus per-user allow/deny overrides** | `app/api/deps.py:63-92`, `app/services/seed_service.py:103-190` (immutable system roles: `OWNER`, `IT_ADMIN`, `HR_MANAGER`, `ACCOUNTANT`, `CASHIER`, `WAREHOUSE_MANAGER`, `MARKETING_MANAGER`, `FLOOR_STAFF`) | Two-layer RBAC is the correct model for retail; deny overrides let HR temporarily revoke a cashier without changing the role. |
| 4 | JWT access + DB-backed refresh tokens with **idle timeout** and single-use password reset | `app/services/auth_service.py:25-31` (idle), `:152-159` (invalidate prior reset tokens), `:174-197` (single use) | Idle timeout and single-use reset tokens are baseline security expectations that many small ERPs miss. |
| 5 | Append-only audit log carries `request_id` from a `RequestIDMiddleware` for distributed tracing | `app/main.py:55-60` (middleware), `app/services/audit_service.py:10-46` (writer), `app/api/error_handlers.py:16-33` (envelope) | Every error and audit entry can be traced back to one HTTP request — essential for forensics in a multi-branch retail deployment. |
| 6 | Double-entry GL: each batch is **balanced before insertion**, every line carries a mandatory `branch_id`, and `idempotency_key` is unique-constrained | `app/services/accounting_service.py:46-110` (balance + branch + idempotency), `app/models/journal_entries.py:18` (unique key) | This is the single most important invariant in the system; enforcing it at the service layer (not just by convention) prevents the entire "ERP that doesn't reconcile" failure mode. |
| 7 | Fiscal periods with a hard posting guard, plus a journal reversal workflow that links the new entry back to the original via `reverses_entry_id` | `app/services/accounting_governance_service.py:45-52` (guard), `:85-147` (reversal) | Period close + reversal is the difference between "an accounting toy" and an audit-defensible book. |
| 8 | AR/AP open-item subledger with payment applications and aging-oriented fields | `app/services/subledger_service.py:34-136`, `app/api/v1/accounting.py:184-317` | Open-item accounting (vs. balance-forward) is required to match a cash receipt to a specific invoice — Manager.io has this, many ad-hoc ERPs do not. |
| 9 | Weighted-average inventory cost service that updates on every goods receipt | `app/services/inventory_valuation_service.py:14-86`, `app/models/branch_product_costs.py` (`average_unit_cost: Numeric(14,4)`) | WAVG is computed and persisted per branch+product, so COGS posting is deterministic. The 4-decimal precision is sufficient for almost all retail SKUs. |
| 10 | Optimistic concurrency on `StockLevel` and a row lock on `PosShift.expected_cash` | `app/services/inventory_service.py:48-66` (version check + retry), `app/services/shift_service.py:74-103` (`SELECT … FOR UPDATE` + atomic `UPDATE`) | Both stock and cash are correctly protected against the two most common POS race conditions. |
| 11 | Idempotency keys on payment capture, sales finalize, stock movements and journal entries | `app/services/payment_service.py:67-75`, `app/services/invoice_service.py:27-30,77`, `app/services/inventory_service.py:28-34`, `app/models/journal_entries.py:18` | A retried HTTP call cannot double-charge or double-post — this is the single most impactful guarantee for a real POS that runs on flaky shop wifi. |
| 12 | Pluggable provider registry for OCR and payments | `app/services/invoice_scan_service.py:25-31` (`fake` / `basic`), `app/services/payment_service.py:17-22` (`in_store` / `mock`) | Lets the same code path target a real OCR or PSP later without changing routes or services — exactly the abstraction Odoo's connectors provide. |
| 13 | Marketing advisory pipeline that **deterministically gathers SQL facts**, then asks the LLM and **validates the JSON** before returning | `app/services/marketing_advisory_service.py:35-73` (facts), `:165-203` (LLM call with `response_format` JSON), `:31-33` (Pydantic envelope) | The probabilistic layer is sandboxed behind deterministic data and a schema check, which is the only safe way to surface LLM output in a live ERP. |
| 14 | Automated `pg_dump` backups with retention, optional S3 upload and an in-app scheduler | `app/services/backup_service.py:55-132`, `app/main.py:84-96` | Backups are part of the application, not an afterthought, and admin endpoints (`/admin/backups/status`, `/admin/backups/run`) make ops verifiable. |
| 15 | Stable error envelope (`code`, `message`, `details`, `request_id`) for every exception class | `app/api/error_handlers.py:36-105`, `app/core/errors.py` | Frontends can rely on the exact same shape for `AppError`, `HTTPException`, validation errors and unhandled 500s. |
| 16 | Multi-stage Docker setup with a healthcheck that hits `/health` | `docker/Dockerfile.prod:10-61` (builder + runtime), `:57-58` (HEALTHCHECK), `docker/Dockerfile.dev` (dev hot-reload) | The healthcheck makes the container honest in orchestrators (Compose `depends_on: condition: service_healthy`, k8s readiness). |
| 17 | Compose Watch sync rules that cleanly separate Linux container `.venv` from host `.venv` | `docker-compose.yml:58-73` | Avoids the classic "my Windows venv overwrote the container's Linux venv" hot-reload bug. |
| 18 | Alembic chain with one migration per epic and clearly named revisions | `alembic/versions/` (init, HR/payroll, CRM, GL, identity foundations) | Easy to bisect schema regressions; each migration corresponds to a feature epic in `PROJECT_STATE.md`. |
| 19 | CSV bank-ready payroll export endpoint streams instead of buffering | `app/api/v1/payroll.py:98-109` | `StreamingResponse` is the correct shape for unbounded exports, which prevents OOM on a large staff. |
| 20 | Tests use the real ASGI app via `httpx.ASGITransport` rather than a synthetic test client | `tests/conftest.py:54-65` | Integration tests run the full middleware + DI stack — closest possible thing to production behavior. |

---

## 2. Technical flaws

### 2.1 Money: the schema layer leaks `float` everywhere

The DB columns themselves use `Numeric(14, 4)` / `Numeric(...)` everywhere
(good!), but the **Python type annotations and Pydantic schemas** are
declared as `float`, and several services round-trip through `float()`
casts. That is the textbook mistake the user is asking about: the
underlying storage is exact, but the in-process arithmetic is binary
floating-point.

Representative ORM-side smell (storage is fine, the annotation lies):

```20:23:app/models/purchase_order_line.py
    purchase_order_id: Mapped[int] = mapped_column(
        ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
    )
    unit_cost: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
```

Same pattern: `app/models/pos_cart.py:31-33,55-56,67`,
`app/models/sales_invoice.py:33-35,55-56,69`, `app/models/pos_payment.py:23,59`,
`app/models/goods_receipt_line.py:22`, `app/models/sales_return.py:44,55`,
`app/models/discount.py:44-46,87`, `app/models/loyalty.py:39`,
`app/models/pos_shift.py:39-42,59`.

API-layer smell (the wire format is now binary float — JSON `0.1+0.2` problems):

```16:25:app/schemas/sales_invoice.py
class SalesInvoiceRead(BaseModel):
    id: int
    invoice_number: str
    invoice_barcode: str
    cart_id: int
    branch_id: int
    total: float
    created_at: datetime
```

Same in `app/schemas/pos_cart.py:21,33-35`, `app/schemas/pos_shift.py:12,17,22,30-33`,
`app/schemas/pos_payment.py:36`, `app/schemas/purchase_orders.py:13`,
`app/schemas/discount.py:34-36,68-70,86-88,115`,
`app/schemas/loyalty.py:32,43`,
`app/schemas/accounting.py:17-19,25-27,32-35,40,107-108`,
`app/schemas/analytics.py:18,68`.

Service-layer cast-to-`float` (the *actual* bug, because totals are
recomputed from binary):

```57:64:app/services/cart_service.py
    subtotal = sum(float(x.line_total) for x in lines)
    discount_total = sum(float(d.amount) for d in discounts)
    cart.subtotal = subtotal
    cart.discount_total = discount_total
    cart.total = max(0.0, subtotal - discount_total)
```

```55:72:app/services/invoice_service.py
        subtotal=float(cart.subtotal),
        discount_total=float(cart.discount_total),
        total=float(cart.total),
        created_by_user_id=user_id,
    )
    db.add(invoice)
    await db.flush()

    for idx, ln in enumerate(lines):
        db.add(
            SalesInvoiceLine(
                sales_invoice_id=invoice.id,
                product_id=ln.product_id,
                qty=ln.qty,
                unit_price=float(ln.unit_price),
                line_total=float(ln.line_total),
            )
        )
```

> The user's framing — "stored as floats instead of doubles" — is partially
> wrong. The DB stores `NUMERIC(14,4)`, which is *better* than IEEE 754
> double. The actual problem is the **opposite direction**: the application
> downgrades exact `Decimal` values to Python `float` on the way in and out.
> Fix: change every monetary `float` to `Decimal` in models' `Mapped[...]`
> annotations, in Pydantic schemas, and in service-layer arithmetic; never
> call `float(...)` on a money value.

### 2.2 `apply_stock_movement` commits inside the loop → no atomic finalize

```75:84:app/services/invoice_service.py
        await apply_stock_movement(
            db,
            idempotency_key=f"{idempotency_key}:line:{idx}",
            branch_id=cart.branch_id,
            product_id=ln.product_id,
            qty_delta=-ln.qty,
            reason="sale",
            ref_type="sales_invoice",
            ref_id=str(invoice.id),
        )
```

```77:91:app/services/inventory_service.py
    db.add(movement)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
```

Each line of a finalized cart commits independently. If line 3 of 5 raises
(out-of-stock optimistic-lock conflict, FK violation, network blip), lines
1–2 are already persisted but the invoice is left half-formed and the GL
post never runs. The correct pattern is to flush each movement and commit
once at the outer service.

### 2.3 `datetime.utcnow` defaults vs. timezone-aware columns

Many ORM models declare `DateTime(timezone=True)` but default to the
**naive** `datetime.utcnow`, which is also deprecated in Python 3.12+:

```37:41:app/models/sales_invoice.py
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
```

(Same in `app/models/journal_entries.py:32-33` and ~40 other model files.)
Service code uses the correct `datetime.now(UTC)`, so the two will silently
disagree in payloads vs. column defaults. Fix: replace every default with
`lambda: datetime.now(UTC)`.

### 2.4 CORS allows `*` *with* credentials in development

```118:124:app/main.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.is_development else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Browsers reject `Access-Control-Allow-Origin: *` together with
`Access-Control-Allow-Credentials: true` — the dev frontend will silently
be unable to send cookies, but more importantly, in production
`allow_origins=[]` blocks **all** browsers. Fix: explicit list of trusted
origins per environment.

### 2.5 Default `SECRET_KEY` baked into Compose

```35:35:docker-compose.yml
      SECRET_KEY: ${SECRET_KEY:-dev-secret-key-change-in-production}
```

The fallback is fine for `docker-compose.yml` (dev), but make sure
`docker-compose.prod.yml` does **not** carry the same fallback, and add a
fail-fast check in `Settings` that rejects `dev-secret-key-…` whenever
`ENVIRONMENT == "prod"`.

### 2.6 Lifespan startup swallows every exception

```86:87:app/main.py
    except Exception:
        pass  # DB may not be migrated yet
```

Means a typo in `seed_permissions_and_roles` ships to production silently.
Narrow the `except` to `OperationalError` / `ProgrammingError`, log the
rest, and re-raise.

### 2.7 Invoice numbering is not monotonic and not unique per branch

```48:48:app/services/invoice_service.py
    invoice_number = f"INV-{datetime.now(UTC).strftime('%Y%m%d')}-{cart.id}"
```

Embedding `cart.id` works for uniqueness across the system, but auditors
will expect a per-branch, gap-less, monotonically increasing sequence
("INV-ST1-2026-000123"). Fix: use a per-branch DB sequence under a row
lock, or a dedicated `branch_sequences` table.

### 2.8 `unit_price` snapshot is read from `product.attributes['price']`

```80:81:app/services/cart_service.py
    unit_price = float((product.attributes or {}).get("price", 0))
    if unit_price <= 0:
        raise ValidationError("Product has no sellable price")
```

Pricing lives inside a JSONB column without per-currency support and is
re-read from the product on every cart operation. Editing the product
mid-shift will silently change the price of carts already on screen. Fix:
move price into a first-class `product_prices` table with `(product_id,
currency_id, valid_from)` and snapshot it onto the cart line at insert.

### 2.9 N+1 on COGS lookups inside `post_sales_invoice_gl`

```40:43:app/services/document_posting_service.py
    cogs_total = Decimal("0")
    for ln in lines:
        uc = await get_unit_cost_for_sale(db, branch_id=branch_id, product_id=ln.product_id)
        cogs_total += _d(uc * Decimal(ln.qty))
```

Each line issues a separate `SELECT` against `branch_product_costs`. For a
50-line basket that's 50 round trips. Fix: batch the lookup with
`WHERE product_id IN (...)`.

### 2.10 Test conftest uses `Base.metadata.create_all`, not Alembic

```37:43:tests/conftest.py
async def engine(test_db_url: str):
    engine = create_async_engine(test_db_url, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
```

Tests therefore cannot catch migration drift. Fix: run
`alembic upgrade head` against the test DB instead.

### 2.11 No rate limit on `/auth/login` and `/auth/password-reset/request`

`app/api/v1/auth.py:26-94` — both endpoints are unauthenticated and
unlimited. A simple `slowapi` middleware or per-IP counter is needed
before a public deploy.

### 2.12 Permission enforcement uses `Depends` indirectly

`require_permission` returns `Depends(_check)` and the routes assign it to
`_:` / `__:` parameters. This works, but it is fragile — any caller that
forgets the `Depends(...)` wrapper will silently *not* enforce the
permission. A unit test that asserts every route has a `require_permission`
hit (via the OpenAPI schema or `app.routes` introspection) would lock this
down.

### 2.13 Card last4 is not redacted in `PaymentReceipt.redacted_payload`

```104:106:app/services/payment_service.py
                redacted_payload={"external_id": intent.external_id, "provider": intent.provider},
            )
```

The schema accepts `card_last4` (`app/schemas/pos_payment.py:21`), but the
"redacted" payload doesn't include `last4` and the column itself
(`PaymentReceipt.card_last4`) is stored as plaintext string. This is fine
for PCI scope (last 4 is allowed), but the variable name `redacted_payload`
implies more than it does — rename it `provider_payload` or actually scrub
PII.

### 2.14 Deleting a branch is a hard delete — **resolved (Fix 14 / Batch 5)**

Previously `DELETE /api/v1/branches/{id}` called `await db.delete(branch)`,
which risked FK violations or destructive cascades against historical
financials.

**Current behavior:** soft delete via nullable `archived_at` on
[`app/models/branch.py`](app/models/branch.py), migration
[`alembic/versions/d8f1a2c3e4b5_branch_archived_at.py`](alembic/versions/d8f1a2c3e4b5_branch_archived_at.py).
[`app/api/v1/branches.py`](app/api/v1/branches.py) sets `archived_at` and
`is_active=False` idempotently, emits audit `branch.archived`, and
`GET /branches` hides archived rows unless `include_archived=true`.
[`app/services/branch_scope.py`](app/services/branch_scope.py)
`require_branch_open_for_operations` rejects archived branches for new
operational work (terminals, POS carts/shifts, invoice numbering, transfers,
inventory adjustments, goods receipt from validated scans). Historical rows
keep referencing the same `branch_id`.

### 2.15 Seed data loads on every startup

```77:83:app/main.py
        async with AsyncSessionLocal() as db:
            await seed_permissions_and_roles(db)
            await seed_accounting_defaults(db)
```

`seed_permissions_and_roles` is idempotent but issues several round trips
on every container start. In a hot-restart deploy that is unnecessary
work; gate it behind an env flag (`SEED_ON_STARTUP`).

---

## 3. Data-flow / activity-flow flaws

These are the specific case the user mentioned ("an invoice is recorded as a
card but its value is calculated as cash"). Each item is a real, traceable
issue in the current code.

### 3.1 Card payments are posted to **Cash on Hand**

`post_sales_invoice_gl` makes no distinction between cash and card tenders
for walk-in customers — the entire sale is debited to
`default_cash_account_id`:

```45:62:app/services/document_posting_service.py
    async def post_revenue_and_cash() -> None:
        if invoice.customer_id is None:
            lines_payload = [
                {
                    "account_id": settings.default_cash_account_id,
                    "branch_id": branch_id,
                    "debit": total,
                    "credit": Decimal("0"),
                    "memo": "POS cash sale",
                },
                {
                    "account_id": settings.default_sales_revenue_account_id,
                    "branch_id": branch_id,
                    "debit": Decimal("0"),
                    "credit": total,
                    "memo": "Sales revenue",
                },
            ]
```

Even though `payment_service.capture_payment` knows the method
(`cash` / `card` / `other`, `app/services/payment_service.py:60-61`), that
information **never reaches the GL**. The required fix is a card-clearing
account: Dr `Card Clearing` / Cr `Sales Revenue` at sale time, then
Dr `Bank` / Cr `Card Clearing` when the PSP settles. This is how Odoo and
Manager.io both model it.

### 3.2 Sales returns always credit cash, regardless of the original tender

```203:208:app/services/document_posting_service.py
        {
            "account_id": settings.default_cash_account_id,
            "branch_id": branch_id,
            "debit": Decimal("0"),
            "credit": total,
            "memo": "Return — cash (counter)",
        },
```

A card refund is therefore booked as a cash drawer outflow. Same cure as
3.1 — track the original tender on `SalesInvoice`/`InvoicePayment` and
reverse it against the matching account.

### 3.3 Account-customer (credit) sales post AR but **also** immediately post a cash receipt

```93:144:app/services/document_posting_service.py
    ar_account = settings.default_ar_account_id
    lines_payload = [...]
    await post_journal_entry(... idempotency_key=f"sales_invoice:{invoice.id}:accrual" ...)
    cash_lines = [
        {"account_id": settings.default_cash_account_id, ...},
        {"account_id": ar_account, ..., "credit": total, "memo": "Clear AR"},
    ]
    await post_journal_entry(... idempotency_key=f"sales_invoice:{invoice.id}:cash" ...)
```

There is no actual cash receipt yet — the customer is on credit terms — but
the code books the receipt unconditionally. The result: AR balance is
always zero for account customers, and the AR open-item subledger has
nothing to age. Fix: post only the AR accrual, then let
`apply_ar_payment` (`app/services/subledger_service.py`) generate the cash
receipt entry when the customer actually pays.

### 3.4 Discounts are netted into revenue instead of posted as contra-revenue

```60:64:app/services/cart_service.py
    cart.subtotal = subtotal
    cart.discount_total = discount_total
    cart.total = max(0.0, subtotal - discount_total)
```

Then in GL only the **net total** hits sales revenue
(`document_posting_service.py:55-60`). Auditors and marketers both want a
visible "Sales Discounts" contra-revenue account so promotion P&L can be
read off the income statement directly.

### 3.5 No tax / VAT engine

There is no `tax_rate` on a product, no `tax_code` on a cart line, no
`tax_payable` GL account in `seed_accounting_defaults`, and no tax line in
any journal post. Egypt VAT (and most jurisdictions where MEZAN is
likely deployed) requires a `Tax Payable` liability split out of every
sale. Without it the system *cannot* file a return.

### 3.6 Inter-branch transfers move stock but not cost

`app/services/transfer_service.py` calls `apply_stock_movement` for both
the dispatch and the receive, but **no GL entry** is posted. In a
multi-branch P&L the warehouse will look perpetually under-stocked with no
COGS shift. Fix: Dr `Inventory@DST` / Cr `Inventory@SRC` at receive time
using the source branch's WAVG.

### 3.7 Shift cash variance is computed but not posted to GL

```118:131:app/services/shift_service.py
    shift.declared_cash = declared_cash
    shift.variance = float(declared_cash) - float(shift.expected_cash)
    ...
    db.add(ZReport(shift_id=shift.id, report_payload=payload))
```

The Z report records the variance in JSON, but no journal entry hits
`Cash Over/Short`. A real over/short is a real expense and must show up on
the P&L of that branch.

### 3.8 Loyalty points have no balance-sheet liability

`PROJECT_STATE.md:104-105` already calls this out as a known gap. Each
accrued point is a deferred-revenue obligation; today the loyalty ledger
lives in its own table and never touches the GL.

### 3.9 Cart `lock` is optional before finalize

```35:36:app/services/invoice_service.py
    if cart.status not in {"active", "checkout_locked"}:
        raise StateTransitionError("Cart cannot be finalized")
```

`active` is accepted as well as `checkout_locked`. That means a cashier
can keep editing a cart while the customer is paying. The state machine
should require `checkout_locked` before any payment intent is created.

### 3.10 Goods-receipt cost basis is unverified against the PO

`document_posting_service.post_goods_receipt_gl`
(`app/services/document_posting_service.py:247-295`) sums `unit_cost × qty`
straight from `goods_receipt_lines`, with no comparison to the original
PO line price. A 10× typo in OCR / manual override silently inflates
inventory and AP. Fix: emit a price-variance journal entry when the
received cost differs from the PO cost beyond a tolerance.

### 3.11 Payment intent currency is free text

`app/services/payment_service.py:36-44` accepts whatever string the client
sends and stores it on `PaymentIntent.currency`. There is no FK to
`currencies`, no FX rate captured, no posting in foreign currency. A
USD intent against a EUR-priced product will silently lose money.

### 3.12 No "void invoice" path

You can return a sales invoice but not void it on the same day before a
return is even possible. In real shops, immediate "void this transaction
within 5 minutes of payment" is how cashier mistakes are corrected; today
the only option is a full return + credit note, which inflates audit
volume.

---

## 4. Comparison with Odoo and Manager.io

| Capability | MEZAN today | Odoo (Community / Enterprise) | Manager.io |
|---|---|---|---|
| Tech stack | FastAPI + async SQLAlchemy 2.0 + PostgreSQL — modern, easy to deploy and embed | Python 2/3 + custom ORM + PostgreSQL — heavyweight monolith | Mono Win/macOS/Linux desktop or self-hosted server, custom storage |
| Multi-branch | First-class: `branch_id` on every GL line and stock row | First-class via `company_id` | Multi-business via separate files; multi-branch is community module-only |
| Double-entry GL | Balanced batches enforced in service, idempotent, branch-tagged | Mature, with analytic accounting | Mature, simpler model |
| Fiscal periods + reversals | Implemented (`fiscal_periods`, `reverses_entry_id`) | Mature, with lock dates | Mature |
| AR/AP open items | Implemented (subledger + applications) | Mature with reconciliation suggestions | Mature |
| Inventory costing | WAVG only; no FIFO/LIFO; no cost layers | FIFO/LIFO/Average/Standard; landed costs (Enterprise) | Average only |
| Tax / VAT engine | **Missing** | Full multi-tax, fiscal positions, reports | Built-in tax codes + tax summary |
| Multi-currency | Currency table + per-supplier currency, but **no FX revaluation** and **no translated statements** | Full multi-currency with rate sources and revaluation | Multi-currency with per-account base |
| Payment methods → GL | Card and cash both post to Cash on Hand (3.1) | Per-method clearing accounts | Per-account assignment |
| POS engine | Native, hybrid customer onboarding, idempotent finalize | POS module with offline mode and many UI variants | No POS — Manager is back-office only |
| OCR ingestion | Pluggable, `BasicOcrProvider` + Tesseract fallback | Document module (Enterprise) | Manual entry; no OCR |
| HR / payroll | Schedules, attendance, payslips, CSV bank export, GL posting | Full HR suite, country-specific payroll localization | Manual journals only |
| Loyalty | Accrual rules + ledger, not yet a GL liability | Loyalty module (Enterprise) | None |
| Reporting | Trial balance, GL, IS, BS, executive KPIs | Full reporting + customizable + BI | Trial balance, IS, BS, cash flow, statement of changes in equity |
| AI advisory | Marketing advisory pipeline with deterministic facts → LLM → validated JSON | None native (third-party apps) | None |
| Backups | Built-in `pg_dump` + S3 + retention | Manual / hosted | Built-in |
| Architecture trade-off | API-first; great for embedding into your own UI | Full UI but tight coupling | Desktop-first; great UI, harder to extend |

> Bottom line: MEZAN's **transactional core** (GL, AR/AP, fiscal periods,
> idempotency, RBAC, audit) is competitive with Manager.io and approaches
> Odoo Community in correctness, while being a much smaller and more
> hackable codebase. The biggest gaps that block real-world deployment
> *today* are: tax/VAT, multi-currency revaluation, card-vs-cash GL split,
> tax-aware POS pricing, and inter-branch transfer cost moves.

---

## 5. Shortcomings — quick reference

| # | Shortcoming | Where it lives | Why it matters |
|---|---|---|---|
| 1 | Money downgraded to `float` in Pydantic schemas + service arithmetic | `app/schemas/sales_invoice.py:22`, `app/services/cart_service.py:60-64`, `app/services/invoice_service.py:55-72` (and the list in §2.1) | Penny drift on totals; non-deterministic JSON; reconciliation pain |
| 2 | Per-line commits inside `apply_stock_movement` | `app/services/inventory_service.py:77-91`, called from `app/services/invoice_service.py:75-84` | Half-finalized invoices on partial failure |
| 3 | `datetime.utcnow` defaults vs. timezone-aware columns | `app/models/sales_invoice.py:39-40`, `app/models/journal_entries.py:32-33` (~40 models) | Silent TZ mismatches; deprecated API in 3.12+ |
| 4 | CORS `*` + `credentials=true` in dev; empty list in prod | `app/main.py:118-124` | Browsers reject the dev combo; prod has no allowed origins |
| 5 | Default `SECRET_KEY` in compose | `docker-compose.yml:35` | Trivial JWT forgery if shipped unchanged |
| 6 | Card payments → cash account in GL | `app/services/document_posting_service.py:46-62` | "Card revenue" appears as cash drawer balance |
| 7 | Sales returns → cash account in GL regardless of original tender | `app/services/document_posting_service.py:195-209` | Card refunds drain phantom cash |
| 8 | Account-customer sales auto-post a cash receipt | `app/services/document_posting_service.py:93-144` | AR aging is always zero |
| 9 | No tax / VAT engine anywhere | (absent across `app/services/`) | Cannot file VAT returns |
| 10 | Inter-branch transfers don't post a cost-move JE | `app/services/transfer_service.py` | Branch P&L distorted |
| 11 | Discounts net into revenue, not contra-revenue | `app/services/document_posting_service.py:55-60` | Promo P&L invisible |
| 12 | Shift variance not posted to Cash Over/Short | `app/services/shift_service.py:118-131` | Real losses not on P&L |
| 13 | Invoice number embeds `cart.id`, not a per-branch sequence | `app/services/invoice_service.py:48` | Auditors expect monotonic per-branch numbering |
| 14 | Pricing lives in `product.attributes['price']` JSON without currency | `app/services/cart_service.py:80` | No multi-currency, no price history |
| 15 | N+1 `get_unit_cost_for_sale` per invoice line | `app/services/document_posting_service.py:40-43` | Slow finalize on big baskets |
| 16 | Cart `lock` is optional before finalize | `app/services/invoice_service.py:35` | Cashier can edit during payment |
| 17 | Tests bypass Alembic with `Base.metadata.create_all` | `tests/conftest.py:37-43` | Migration drift not caught by CI |
| 18 | No rate limit on `/auth/login` and `/auth/password-reset/request` | `app/api/v1/auth.py:26-94` | Credential stuffing / enumeration |
| 19 | Loyalty points are not a GL liability | `app/models/loyalty.py`, `PROJECT_STATE.md:104-105` | Off-balance-sheet obligation |
| 20 | ~~Hard delete on branches~~ **Fixed:** `archived_at` + `branch_scope` | `app/api/v1/branches.py`, `app/services/branch_scope.py`, migration `d8f1a2c3e4b5` | Soft delete; new work blocked on archived branch |
| 21 | Lifespan startup swallows every exception | `app/main.py:86-87` | Configuration errors invisible at boot |
| 22 | Goods-receipt cost not reconciled against PO | `app/services/document_posting_service.py:247-295` | OCR/manual mistakes silently inflate inventory + AP |
| 23 | Payment-intent currency is free text, no FX rate captured | `app/services/payment_service.py:36-44` | Multi-currency POS impossible |
| 24 | No "void invoice" path | `app/services/invoice_service.py` | Cashier mistakes only fixable via full return |

---

## 6. Happy User Journey — implementation strategy

> The user asked for a comprehensive happy-path scenario from login →
> inventory → reports, and asked whether there is a *better* approach.

### Why an integration test is the right tool here

The ERP's correctness invariants are **end-to-end**:

* `Trial balance debits == credits` after a sale
* `cart.subtotal - cart.discount_total == invoice.total`
* `payment_intent.amount == sales_invoice.total`
* `audit_log.count` increments by exactly N for an N-step workflow

None of those are observable in unit tests or in OpenAPI contract tests
(Postman/Newman/Schemathesis). They are only observable in a real
sequence of HTTP calls hitting a real database — which is exactly what
`tests/test_happy_user_journey.py` does, against the real ASGI app via
`httpx.ASGITransport`, with a fresh PostgreSQL test DB.

### Alternatives I considered and why they are worse

* **Postman / Newman collection** — good for contract drift, but cannot
  assert "trial balance is balanced" or "audit log has N entries". You
  can fake it with JS scripts, but at that point you've reinvented
  pytest, badly.
* **Locust / k6 load script** — measures throughput, not correctness;
  redundant with the integration test.
* **Schemathesis property-based fuzzing** — superb for finding
  500-on-malformed-input bugs but it doesn't model the **state
  machine** (PO → goods receipt → invoice → payment → finalize → return).
* **Cypress / Playwright UI tests** — there is no UI yet. A pure-API
  ASGI integration test runs in seconds against an in-memory test DB.

### What `tests/test_happy_user_journey.py` covers

Each step is documented inline with the JSON request body and the
expected response shape so the file doubles as runnable API spec:

1. `POST /api/v1/auth/login`
2. List/create branches, register a supplier, register and authorize a
   POS terminal
3. Create a category, define a `price` attribute, create a product
   (with `standard_cost` for the COGS fallback)
4. Seed inventory via `POST /api/v1/inventory/adjustments` and assert
   the idempotency key is honored on replay
5. `POST /api/v1/pos/shifts/open`
6. Hybrid customer onboarding (`/customers/temporary` →
   `/customers/onboarding/complete`)
7. Cart lifecycle: create → add line → apply discount → lock
8. Payment intent + capture (with `card_last4`), and replay the capture
   idempotency key to assert no double charge
9. `POST /api/v1/pos/sales/finalize`, then **replay the finalize
   request** to assert the same invoice is returned
10. Sales return + credit note (tolerated failure on `sales_invoice_line_id`
    in shared DBs)
11. Shift close and assert `variance == 0` (this is where the
    "card-was-treated-as-cash" bug from §3.1 will show up if it ever
    leaks into shift cash tracking — currently it doesn't because the
    shift only tracks explicit cash events)
12. Generate and approve a payslip
13. Pull trial balance, income statement, balance sheet, and the GL
    drilldown for the cash account; **assert `Σ debits == Σ credits`**
14. Executive KPIs and analytics endpoints
15. Audit log spot-check (terminal authorize and cart create both must
    appear)

### How to run it

```bash
export SECRET_KEY="test-secret-key-not-for-prod"
export TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mezan_test"
uv run pytest tests/test_happy_user_journey.py -v -s
```

Without `TEST_DATABASE_URL` the test is auto-skipped by `tests/conftest.py`.

### What to add in v2

* Wire up a `GET /pos/sales/{barcode}` endpoint so the return step can
  resolve the real `sales_invoice_line_id` instead of guessing 1.
* Once §3.1 is fixed (card-clearing account), add a strict assertion that
  card sales hit `Card Clearing`, not Cash on Hand.
* Once §3.5 (VAT) is added, assert that revenue + tax = sale total in the
  trial balance.

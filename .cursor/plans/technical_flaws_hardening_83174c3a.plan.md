---
name: technical flaws hardening
overview: Implement the 15 §2 technical-flaw fixes in small delivery batches rather than one large pass. Each numbered fix still lands as its own commit, but execution pauses cleanly between batches for review and reprioritization.
todos:
  - id: fix1-money-decimal
    content: "Fix 1: convert money flow to Decimal end-to-end and tighten happy-journey assertions"
    status: in_progress
  - id: fix2-atomic-pos
    content: "Fix 2: remove inner commits from stock movement and add atomic finalize regression test"
    status: pending
  - id: fix3-tz-defaults
    content: "Fix 3: replace datetime.utcnow defaults and add TZ migration only if naive columns exist"
    status: pending
  - id: fix4-cors
    content: "Fix 4: add explicit ALLOWED_ORIGINS config and safe CORS startup behavior"
    status: pending
  - id: fix5-secret-key
    content: "Fix 5: reject weak production SECRET_KEY and keep dev-only compose fallback"
    status: pending
  - id: fix6-lifespan-errors
    content: "Fix 6: narrow lifespan exception handling and log startup DB-not-ready cases"
    status: pending
  - id: fix7-invoice-sequence
    content: "Fix 7: add per-branch invoice sequence model/service/migration and update invoice numbering tests"
    status: pending
  - id: fix8-product-pricing
    content: "Fix 8: add product_prices table with backfill and switch cart pricing lookup to service layer"
    status: pending
  - id: fix9-batch-cogs
    content: "Fix 9: batch unit-cost lookup for sales/return GL posting"
    status: pending
  - id: fix10-tests-alembic
    content: "Fix 10: make tests and CI use Alembic migrations and drift checks instead of create_all"
    status: pending
  - id: fix11-auth-rate-limit
    content: "Fix 11: add slowapi-based auth rate limiting with settings-backed thresholds"
    status: pending
  - id: fix12-route-audit
    content: "Fix 12: add startup audit that protected API routes include require_permission"
    status: pending
  - id: fix13-payment-payload
    content: "Fix 13: rename payment receipt payload column and verify card_last4 masking in audit data"
    status: pending
  - id: fix14-soft-delete-branches
    content: "Fix 14: add archived_at branch soft-delete flow and reject archived branches on new operations"
    status: pending
  - id: fix15-seed-flag
    content: "Fix 15: gate startup seeding behind SEED_ON_STARTUP and add one-shot seed script"
    status: pending
isProject: false
---

# Technical Flaws Hardening

## Scope
- Use [SYSTEM_REVIEW.md](c:/Users/abdo/Desktop/mezan/SYSTEM_REVIEW.md) §2 as the sole behavior source, and keep the repo layering from [.cursor/rules/01-project-context.mdc](c:/Users/abdo/Desktop/mezan/.cursor/rules/01-project-context.mdc): thin routes, logic in services, ORM in models, schemas in Pydantic.
- Land the work on `cursor/fix-technical-flaws` as 15 commits that map 1:1 to fixes 1-15 using the user-provided commit messages.
- Deliver the work in batches, not as one uninterrupted implementation pass. After each batch, stop for review before starting the next batch.

## Delivery Batches

### Batch 1 — Financial correctness core
- **Fix 1 — Money stays `Decimal` end-to-end.**
  Update monetary ORM annotations in the listed model files under [app/models](c:/Users/abdo/Desktop/mezan/app/models), convert monetary schema fields in [app/schemas/pos_cart.py](c:/Users/abdo/Desktop/mezan/app/schemas/pos_cart.py), [app/schemas/pos_shift.py](c:/Users/abdo/Desktop/mezan/app/schemas/pos_shift.py), [app/schemas/pos_payment.py](c:/Users/abdo/Desktop/mezan/app/schemas/pos_payment.py), [app/schemas/purchase_orders.py](c:/Users/abdo/Desktop/mezan/app/schemas/purchase_orders.py), [app/schemas/sales_invoice.py](c:/Users/abdo/Desktop/mezan/app/schemas/sales_invoice.py), [app/schemas/discount.py](c:/Users/abdo/Desktop/mezan/app/schemas/discount.py), [app/schemas/loyalty.py](c:/Users/abdo/Desktop/mezan/app/schemas/loyalty.py), [app/schemas/accounting.py](c:/Users/abdo/Desktop/mezan/app/schemas/accounting.py), and [app/schemas/analytics.py](c:/Users/abdo/Desktop/mezan/app/schemas/analytics.py) to `Decimal`, add [app/utils/money.py](c:/Users/abdo/Desktop/mezan/app/utils/money.py), and remove float round-trips in [app/services/cart_service.py](c:/Users/abdo/Desktop/mezan/app/services/cart_service.py), [app/services/invoice_service.py](c:/Users/abdo/Desktop/mezan/app/services/invoice_service.py), [app/services/document_posting_service.py](c:/Users/abdo/Desktop/mezan/app/services/document_posting_service.py), and [app/services/financial_reports_service.py](c:/Users/abdo/Desktop/mezan/app/services/financial_reports_service.py). Tighten money assertions in [tests/test_happy_user_journey.py](c:/Users/abdo/Desktop/mezan/tests/test_happy_user_journey.py) only where the wire format becomes stricter.
- **Fix 2 — Make finalize atomic.**
  Change [app/services/inventory_service.py](c:/Users/abdo/Desktop/mezan/app/services/inventory_service.py) so `apply_stock_movement()` flushes but never commits, then audit every current caller: [app/services/invoice_service.py](c:/Users/abdo/Desktop/mezan/app/services/invoice_service.py), [app/services/returns_service.py](c:/Users/abdo/Desktop/mezan/app/services/returns_service.py), [app/services/transfer_service.py](c:/Users/abdo/Desktop/mezan/app/services/transfer_service.py), [app/services/invoice_scan_service.py](c:/Users/abdo/Desktop/mezan/app/services/invoice_scan_service.py), and [app/api/v1/inventory_adjustments.py](c:/Users/abdo/Desktop/mezan/app/api/v1/inventory_adjustments.py). Add the requested regression test at [tests/test_finalize_atomicity.py](c:/Users/abdo/Desktop/mezan/tests/test_finalize_atomicity.py).
- **Checkpoint**
  Stop after fixes 1-2 and verify money serialization plus POS finalize rollback behavior before moving on.

### Batch 2 — Data model and posting correctness
- **Fix 7 — Per-branch invoice sequencing.**
  Add [app/models/branch_sequence.py](c:/Users/abdo/Desktop/mezan/app/models/branch_sequence.py), register it in [app/models/__init__.py](c:/Users/abdo/Desktop/mezan/app/models/__init__.py) and [alembic/env.py](c:/Users/abdo/Desktop/mezan/alembic/env.py), create the migration, implement [app/services/numbering_service.py](c:/Users/abdo/Desktop/mezan/app/services/numbering_service.py) with row locking, and swap the current invoice number generation in [app/services/invoice_service.py](c:/Users/abdo/Desktop/mezan/app/services/invoice_service.py). Tighten the invoice-number assertion in [tests/test_happy_user_journey.py](c:/Users/abdo/Desktop/mezan/tests/test_happy_user_journey.py) to the new `INV-{branch.code}-{year}-{n:06d}` format.
- **Fix 8 — Move pricing into a real table.**
  Add [app/models/product_price.py](c:/Users/abdo/Desktop/mezan/app/models/product_price.py) plus a migration that backfills from `Product.attributes["price"]` in [app/models/product.py](c:/Users/abdo/Desktop/mezan/app/models/product.py), using [app/models/currency.py](c:/Users/abdo/Desktop/mezan/app/models/currency.py) for `currency_id`. Create a small pricing lookup service (new file in [app/services](c:/Users/abdo/Desktop/mezan/app/services)) and update [app/services/cart_service.py](c:/Users/abdo/Desktop/mezan/app/services/cart_service.py) so cart lines snapshot the active price from the table instead of reading JSON. Keep backward-compatible `attributes["price"]` writes only where the user requested, and limit catalog API docstring updates to deprecation notes.
- **Fix 9 — Batch COGS lookup.**
  Extend [app/services/inventory_valuation_service.py](c:/Users/abdo/Desktop/mezan/app/services/inventory_valuation_service.py) with a batched branch/product cost lookup and update both sales and return GL posting paths in [app/services/document_posting_service.py](c:/Users/abdo/Desktop/mezan/app/services/document_posting_service.py) to use one fetch per document instead of per-line queries.
- **Checkpoint**
  Stop after fixes 7-9 and verify invoice numbering, pricing backfill, and GL posting still align with the happy path.

### Batch 3 — Platform and security hardening
- **Fix 4 — CORS configuration.**
  Add `ALLOWED_ORIGINS` in [app/core/config.py](c:/Users/abdo/Desktop/mezan/app/core/config.py), wire the safe `CORSMiddleware` behavior in [app/main.py](c:/Users/abdo/Desktop/mezan/app/main.py), and document the environment variable in [README.md](c:/Users/abdo/Desktop/mezan/README.md).
- **Fix 5 — Reject weak production `SECRET_KEY`.**
  Add the `Settings` validator in [app/core/config.py](c:/Users/abdo/Desktop/mezan/app/core/config.py), keep the dev fallback in [docker-compose.yml](c:/Users/abdo/Desktop/mezan/docker-compose.yml), and preserve fail-fast behavior in [docker-compose.prod.yml](c:/Users/abdo/Desktop/mezan/docker-compose.prod.yml).
- **Fix 6 — Stop swallowing every exception in lifespan.**
  Add module logging in [app/main.py](c:/Users/abdo/Desktop/mezan/app/main.py), narrow the caught exceptions to DB-not-ready cases, and re-raise configuration or coding errors.
- **Fix 11 — Rate-limit auth endpoints.**
  Add `slowapi` in [pyproject.toml](c:/Users/abdo/Desktop/mezan/pyproject.toml), register the limiter in [app/main.py](c:/Users/abdo/Desktop/mezan/app/main.py), and decorate the public endpoints in [app/api/v1/auth.py](c:/Users/abdo/Desktop/mezan/app/api/v1/auth.py).
- **Fix 12 — Startup route permission audit.**
  Add the route walk in [app/main.py](c:/Users/abdo/Desktop/mezan/app/main.py) so `/api/v1/...` routes outside the allowlist fail startup if `require_permission()` is missing.
- **Fix 15 — Gate seeding behind a flag.**
  Add `SEED_ON_STARTUP` in [app/core/config.py](c:/Users/abdo/Desktop/mezan/app/core/config.py), gate the seed calls in [app/main.py](c:/Users/abdo/Desktop/mezan/app/main.py), create [app/scripts/seed.py](c:/Users/abdo/Desktop/mezan/app/scripts/seed.py), document ops flow in [README.md](c:/Users/abdo/Desktop/mezan/README.md), and set production compose accordingly.
- **Checkpoint**
  Stop after fixes 4-6, 11, 12, and 15 and verify startup behavior, public auth limits, and production config safety.

### Batch 4 — Test and schema hygiene
- **Fix 3 — Use timezone-aware defaults.**
  Replace `datetime.utcnow` across `app/models` with `lambda: datetime.now(UTC)`. Audit any remaining naive `DateTime` columns while doing that; if any exist, add the `TIMESTAMPTZ` migration requested by the user, otherwise keep this fix code-only. Re-run the happy path after the change because [tests/test_happy_user_journey.py](c:/Users/abdo/Desktop/mezan/tests/test_happy_user_journey.py) exercises several created resources and could expose serialization drift.
- **Fix 10 — Make tests use real Alembic migrations.**
  Replace `Base.metadata.drop_all/create_all` in [tests/conftest.py](c:/Users/abdo/Desktop/mezan/tests/conftest.py) with the requested Alembic downgrade/upgrade flow. Because [alembic/env.py](c:/Users/abdo/Desktop/mezan/alembic/env.py) currently overwrites `sqlalchemy.url` from `settings`, also make it honor a pre-set config URL so the fixture can point Alembic at the test database. Update [.github/workflows/ci.yml](c:/Users/abdo/Desktop/mezan/.github/workflows/ci.yml) to run a migration drift check and to pass the test DB URL in the variable name the fixtures actually consume.
- **Fix 13 — Honest payment receipt payload naming.**
  Rename `PaymentReceipt.redacted_payload` to `provider_payload` in [app/models/pos_payment.py](c:/Users/abdo/Desktop/mezan/app/models/pos_payment.py) with a column-rename migration, update [app/services/payment_service.py](c:/Users/abdo/Desktop/mezan/app/services/payment_service.py) and any serializers/tests that still mention the old name, and verify whether [app/services/audit_service.py](c:/Users/abdo/Desktop/mezan/app/services/audit_service.py) ever receives `card_last4` in `new_value`; if it does, mask it before flush.
- **Checkpoint**
  Stop after fixes 3, 10, and 13 and verify migrations, CI wiring, and payment payload naming remain consistent.

### Batch 5 — Branch archival and final closeout
- **Fix 14 — Soft-delete branches.**
  Add `archived_at` to [app/models/branch.py](c:/Users/abdo/Desktop/mezan/app/models/branch.py) and expose it where needed in [app/schemas/branch.py](c:/Users/abdo/Desktop/mezan/app/schemas/branch.py), create the migration, change delete/list behavior in [app/api/v1/branches.py](c:/Users/abdo/Desktop/mezan/app/api/v1/branches.py), and add archived-branch rejection where branch IDs are resolved for new work. Start with the existing lookup sites in [app/api/v1/terminals.py](c:/Users/abdo/Desktop/mezan/app/api/v1/terminals.py) and then audit branch-aware POS/accounting entry points without broad refactors.
- **Final closeout**
  After the 15 fix commits are done, run the full repo verification, update [PROJECT_STATE.md](c:/Users/abdo/Desktop/mezan/PROJECT_STATE.md), update [SYSTEM_REVIEW.md](c:/Users/abdo/Desktop/mezan/SYSTEM_REVIEW.md) with per-item status, and refresh the PR description with the per-commit changelog and migration list.

## Repo-Specific Notes
- `apply_stock_movement()` has an extra production caller in [app/services/invoice_scan_service.py](c:/Users/abdo/Desktop/mezan/app/services/invoice_scan_service.py), so fix 2 must cover more than the review’s initial caller list.
- [alembic/env.py](c:/Users/abdo/Desktop/mezan/alembic/env.py) currently forces `settings.database_url_async`; that will block the requested test fixture unless adjusted as part of fix 10.
- [app/models/pos_payment.py](c:/Users/abdo/Desktop/mezan/app/models/pos_payment.py) already uses `provider_payload` on `PaymentAttempt`; only `PaymentReceipt` still carries the misleading `redacted_payload` name.
- Branch validation is currently route-heavy rather than service-heavy, so the archived-branch rule should be introduced through the smallest possible service/helper seam and then applied only where branch IDs are actually resolved.

## Verification and Closeout
- After each fix commit, run the smallest relevant test slice for that fix.
- After each batch, stop and summarize what landed before starting the next batch.
- After all 15 fixes, run `uv run ruff check . --fix` and `uv run pytest -q`, or fall back to non-integration tests only if `TEST_DATABASE_URL` is unavailable.
- Finish by updating [PROJECT_STATE.md](c:/Users/abdo/Desktop/mezan/PROJECT_STATE.md) and [SYSTEM_REVIEW.md](c:/Users/abdo/Desktop/mezan/SYSTEM_REVIEW.md) exactly as requested, then refresh the PR description with the per-commit changelog and migration list.
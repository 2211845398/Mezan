# POS cart state machine (implementation reference)

Source of truth: `app/services/cart_service.py` (repo root) — `_assert_transition`, `change_state`, `upsert_line`, `apply_discount`.

## Allowed transitions

| Current status      | Action   | Next status        |
|---------------------|----------|--------------------|
| `active`            | `park`   | `parked`           |
| `parked`            | `resume` | `active`           |
| `active`            | `lock`   | `checkout_locked` |
| `checkout_locked`   | `cancel` | `cancelled`        |

Any other `(status, action)` pair raises `StateTransitionError` with message `Invalid cart transition` and `details: { status, action }`.

## Side effects on transition

- On transition to `checkout_locked`, `locked_at` is set to current UTC time (`change_state`).

## Line and discount rules

- `upsert_line` and `apply_discount` require `cart.status == "active"`.
- Otherwise: `StateTransitionError` with message `Cart is not active`.

## Payment and finalize (downstream)

- `create_payment_intent` (`payment_service`) requires `cart.status == "checkout_locked"`.
- `finalize_paid_cart` (`invoice_service`) requires `cart.status == "checkout_locked"`, matching succeeded `PaymentIntent`, and non-empty lines.

## UI mapping

- **Park**: `POST /api/v1/pos/carts/{id}/state` body `{ "action": "park" }`
- **Resume**: `{ "action": "resume" }`
- **Tender (start)**: `{ "action": "lock" }` before creating payment intent
- **Cancel checkout**: `{ "action": "cancel" }` from `checkout_locked` only

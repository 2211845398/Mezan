"""Happy User Journey: branch + user creation → purchasing → POS sale → trial balance.

This is an end-to-end integration test that exercises the full "retail → books"
loop. It deliberately uses HTTP endpoints (not services) so it reflects what a
real front-end client of MEZAN would see.

Requires `TEST_DATABASE_URL` (or `DATABASE_URL_TEST`) to be set, otherwise the
session is skipped (same convention as the rest of the suite).

Flow:
    1.  Bootstrap (via fixture): permissions, roles, Admin user, system branches.
    2.  IT Admin creates a fresh warehouse + storefront branch through the API.
    3.  IT Admin creates a cashier user and grants them the CASHIER role.
    4.  Warehouse Manager (admin token) sets up supplier + category + product
        with a price attribute and a standard cost.
    5.  A PO is drafted and sent.
    6.  An invoice scan is created, manually overridden and validated →
        goods receipt is posted → Dr Inventory / Cr AP hits the GL.
    7.  Stock is transferred warehouse → storefront (dispatch + receive).
    8.  A POS terminal is registered + authorized at the storefront.
    9.  A shift is opened at that terminal.
    10. A walk-in cart is created → product added → discount applied →
        park / resume / lock.
    11. Payment intent is created and captured (mock provider, card).
    12. Sale is finalized → immutable invoice, stock out, and GL posting
        (Dr Cash / Cr Revenue, Dr COGS / Cr Inventory).
    13. Shift is closed with declared cash.
    14. Trial balance is fetched and asserted: debits == credits,
        Inventory / AP / Cash / Revenue / COGS carry the expected signs and the
        net P&L lines up with the income statement.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chart_accounts import ChartAccount
from app.models.currency import Currency


async def _lookup_account_ids_by_code(db: AsyncSession) -> dict[str, int]:
    res = await db.execute(select(ChartAccount))
    return {a.code: a.id for a in res.scalars().all()}


async def _get_usd_currency_id(db: AsyncSession) -> int:
    res = await db.execute(select(Currency).where(Currency.code == "USD"))
    row = res.scalar_one_or_none()
    assert row is not None, "USD currency should be seeded by seed_accounting_defaults"
    return row.id


@pytest.mark.asyncio
async def test_happy_user_journey_from_branch_entry_to_trial_balance(
    client, admin_auth_header, db_session: AsyncSession
):
    hdr = admin_auth_header
    today = date.today()
    suffix = uuid.uuid4().hex[:6]

    # -----------------------------------------------------------------
    # 1. Bootstrap: chart of accounts + default currency already seeded
    # by admin_auth_header. Look up the account IDs we'll assert against.
    # -----------------------------------------------------------------
    accounts = await _lookup_account_ids_by_code(db_session)
    assert {"1000", "1100", "1200", "2000", "4000", "5000"}.issubset(accounts.keys()), (
        "Seeded chart of accounts is missing expected codes"
    )
    usd_id = await _get_usd_currency_id(db_session)

    # -----------------------------------------------------------------
    # 2. IT Admin creates a fresh warehouse + storefront branch
    # (separate from the fixture-created WH1/ST1 to exercise the real
    # branch API and get stable IDs the journey will own).
    # -----------------------------------------------------------------
    wh_resp = await client.post(
        "/api/v1/branches",
        headers=hdr,
        json={
            "name": f"HQ Warehouse {suffix}",
            "code": f"HQWH-{suffix}",
            "address": "10 Depot Rd",
            "timezone": "UTC",
        },
    )
    assert wh_resp.status_code == 200, wh_resp.text
    warehouse_id = wh_resp.json()["id"]

    store_resp = await client.post(
        "/api/v1/branches",
        headers=hdr,
        json={
            "name": f"Downtown Store {suffix}",
            "code": f"DTST-{suffix}",
            "address": "55 Main St",
            "timezone": "UTC",
        },
    )
    assert store_resp.status_code == 200, store_resp.text
    store_id = store_resp.json()["id"]
    assert store_id != warehouse_id

    # -----------------------------------------------------------------
    # 3. IT Admin creates a cashier user and grants them the CASHIER role.
    # The journey still runs API calls with the admin token (RBAC-wise
    # any role would work for the same endpoints), but this verifies the
    # user-lifecycle + role-assignment path is functional.
    # -----------------------------------------------------------------
    cashier_email = f"cashier+{suffix}@example.com"
    user_resp = await client.post(
        "/api/v1/users",
        headers=hdr,
        json={
            "email": cashier_email,
            "full_name": "Happy Cashier",
            "password": "Passw0rd!cashier",
            "status": "active",
            "branch_id": store_id,
            "role_code": "CASHIER",
            "require_onboarding": False,
        },
    )
    assert user_resp.status_code == 200, user_resp.text
    cashier = user_resp.json()
    assert cashier["email"] == cashier_email
    assert cashier["branch_id"] == store_id

    roles_resp = await client.get(
        f"/api/v1/users/{cashier['id']}/roles", headers=hdr
    )
    assert roles_resp.status_code == 200, roles_resp.text
    assert any(r["role_code"] == "CASHIER" for r in roles_resp.json())

    # -----------------------------------------------------------------
    # 4. Supplier + category + attribute + product.
    # -----------------------------------------------------------------
    supplier_resp = await client.post(
        "/api/v1/suppliers",
        headers=hdr,
        json={
            "code": f"SUP-{suffix}",
            "name": "Acme Wholesale",
            "currency_id": usd_id,
            "payables_account_id": accounts["2000"],
        },
    )
    assert supplier_resp.status_code == 200, supplier_resp.text
    supplier_id = supplier_resp.json()["id"]

    cat_resp = await client.post(
        "/api/v1/categories",
        headers=hdr,
        json={
            "name": f"Gadgets-{suffix}",
            "slug": f"gadgets-{suffix}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert cat_resp.status_code == 201, cat_resp.text
    category_id = cat_resp.json()["id"]

    price_attr = await client.post(
        f"/api/v1/categories/{category_id}/attributes",
        headers=hdr,
        json={
            "key": "price",
            "label": "Price",
            "type": "float",
            "required": True,
            "sort_order": 0,
        },
    )
    assert price_attr.status_code == 201, price_attr.text

    product_resp = await client.post(
        "/api/v1/products",
        headers=hdr,
        json={
            "category_id": category_id,
            "name": "Widget Pro",
            "sku": f"WGT-{suffix}",
            "status": "active",
            "standard_cost": 6.0,
            "attributes": {"price": 10.0},
        },
    )
    assert product_resp.status_code == 201, product_resp.text
    product_id = product_resp.json()["id"]

    barcode_resp = await client.post(
        f"/api/v1/products/{product_id}/barcode", headers=hdr
    )
    assert barcode_resp.status_code == 200, barcode_resp.text
    assert barcode_resp.json()["barcode"]

    # -----------------------------------------------------------------
    # 5. Purchase order draft + send.
    # -----------------------------------------------------------------
    po_qty = 10
    po_unit_cost = 6.0
    po_resp = await client.post(
        "/api/v1/purchase-orders",
        headers=hdr,
        json={
            "supplier_name": "Acme Wholesale",
            "supplier_id": supplier_id,
            "notes": "Initial fill",
            "lines": [
                {"product_id": product_id, "qty": po_qty, "unit_cost": po_unit_cost}
            ],
        },
    )
    # supplier_id is optional in the purchase order schema in some repos.
    if po_resp.status_code != 201:
        po_resp = await client.post(
            "/api/v1/purchase-orders",
            headers=hdr,
            json={
                "supplier_name": "Acme Wholesale",
                "notes": "Initial fill",
                "lines": [
                    {
                        "product_id": product_id,
                        "qty": po_qty,
                        "unit_cost": po_unit_cost,
                    }
                ],
            },
        )
    assert po_resp.status_code == 201, po_resp.text
    po_id = po_resp.json()["id"]
    send_resp = await client.post(
        f"/api/v1/purchase-orders/{po_id}/send", headers=hdr
    )
    assert send_resp.status_code == 200, send_resp.text

    # -----------------------------------------------------------------
    # 6. Invoice scan → manual override → validate → goods receipt + GL post.
    # GL expected: Dr Inventory (1200) / Cr AP (2000) for qty * unit_cost.
    # -----------------------------------------------------------------
    scan_resp = await client.post(
        "/api/v1/invoice-scans",
        headers=hdr,
        json={"source_type": "qr", "data": f"JOURNEY-{suffix}"},
    )
    assert scan_resp.status_code == 201, scan_resp.text
    scan_id = scan_resp.json()["id"]

    override_resp = await client.patch(
        f"/api/v1/invoice-scans/{scan_id}/override",
        headers=hdr,
        json={
            "override_output": {
                "supplier_name": "Acme Wholesale",
                "invoice_number": f"ACME-INV-{suffix}",
                "line_items": [
                    {
                        "product_id": product_id,
                        "qty": po_qty,
                        "unit_cost": po_unit_cost,
                    }
                ],
            }
        },
    )
    assert override_resp.status_code == 200, override_resp.text

    validate_resp = await client.post(
        f"/api/v1/invoice-scans/{scan_id}/validate",
        headers=hdr,
        json={"branch_id": warehouse_id},
    )
    assert validate_resp.status_code == 200, validate_resp.text
    assert validate_resp.json()["scan"]["status"] == "validated"
    assert validate_resp.json()["goods_receipt_id"]

    expected_inventory_dr = po_qty * po_unit_cost  # 60.00

    # -----------------------------------------------------------------
    # 7. Transfer some stock to the storefront (dispatch + receive).
    # Transfers do not hit the GL today, only stock movements.
    # -----------------------------------------------------------------
    transfer_qty = 4
    xfer_resp = await client.post(
        "/api/v1/transfers",
        headers=hdr,
        json={
            "from_branch_id": warehouse_id,
            "to_branch_id": store_id,
            "lines": [{"product_id": product_id, "qty": transfer_qty}],
        },
    )
    assert xfer_resp.status_code == 201, xfer_resp.text
    batch_id = xfer_resp.json()["id"]

    dispatched = await client.post(
        f"/api/v1/transfers/{batch_id}/dispatch", headers=hdr
    )
    assert dispatched.status_code == 200, dispatched.text
    assert dispatched.json()["status"] == "in_transit"

    received = await client.post(
        f"/api/v1/transfers/{batch_id}/receive", headers=hdr
    )
    assert received.status_code == 200, received.text
    assert received.json()["status"] == "received"

    # -----------------------------------------------------------------
    # 8. POS terminal registration + authorization at the storefront.
    # -----------------------------------------------------------------
    term_resp = await client.post(
        "/api/v1/terminals",
        headers=hdr,
        json={
            "branch_id": store_id,
            "name": f"POS-{suffix}",
            "terminal_code": f"POS-{suffix}",
        },
    )
    assert term_resp.status_code == 200, term_resp.text
    terminal_id = term_resp.json()["id"]
    auth_resp = await client.patch(
        f"/api/v1/terminals/{terminal_id}/authorize", headers=hdr
    )
    assert auth_resp.status_code == 200, auth_resp.text
    assert auth_resp.json()["is_authorized"] is True

    # -----------------------------------------------------------------
    # 9. Shift open.
    # -----------------------------------------------------------------
    shift_resp = await client.post(
        "/api/v1/pos/shifts/open",
        headers=hdr,
        json={"terminal_id": terminal_id, "opening_float": 100.0},
    )
    assert shift_resp.status_code == 201, shift_resp.text
    shift_id = shift_resp.json()["id"]

    # -----------------------------------------------------------------
    # 10. Cart create → add line → apply discount → park / resume / lock.
    # -----------------------------------------------------------------
    cart_resp = await client.post(
        "/api/v1/pos/carts",
        headers=hdr,
        json={"terminal_id": terminal_id, "shift_id": shift_id, "customer_id": None},
    )
    assert cart_resp.status_code == 201, cart_resp.text
    cart_id = cart_resp.json()["id"]
    assert cart_resp.json()["branch_id"] == store_id

    sell_qty = 2
    unit_price = 10.0
    line_resp = await client.post(
        f"/api/v1/pos/carts/{cart_id}/lines",
        headers=hdr,
        json={"product_id": product_id, "qty": sell_qty},
    )
    assert line_resp.status_code == 200, line_resp.text
    assert line_resp.json()["subtotal"] == pytest.approx(sell_qty * unit_price)

    disc_amount = 5.0
    disc_resp = await client.post(
        f"/api/v1/pos/carts/{cart_id}/discounts",
        headers=hdr,
        json={"code": "WELCOME", "amount": disc_amount},
    )
    assert disc_resp.status_code == 200, disc_resp.text
    cart_total = sell_qty * unit_price - disc_amount  # 15.00
    assert disc_resp.json()["total"] == pytest.approx(cart_total)

    for action in ("park", "resume", "lock"):
        r = await client.post(
            f"/api/v1/pos/carts/{cart_id}/state",
            headers=hdr,
            json={"action": action},
        )
        assert r.status_code == 200, r.text

    # -----------------------------------------------------------------
    # 11. Payment intent + capture (mock provider, card).
    # -----------------------------------------------------------------
    intent_resp = await client.post(
        "/api/v1/pos/payments/intents",
        headers=hdr,
        json={"cart_id": cart_id, "provider": "mock", "currency": "USD"},
    )
    assert intent_resp.status_code == 201, intent_resp.text
    intent_id = intent_resp.json()["id"]
    assert intent_resp.json()["amount"] == pytest.approx(cart_total)

    capture_idem = f"cap-journey-{suffix}"
    capture_resp = await client.post(
        "/api/v1/pos/payments/capture",
        headers=hdr,
        json={
            "payment_intent_id": intent_id,
            "idempotency_key": capture_idem,
            "method": "card",
            "reference": "journey-card-1",
            "card_last4": "4242",
        },
    )
    assert capture_resp.status_code == 200, capture_resp.text
    assert capture_resp.json()["status"] == "succeeded"

    # -----------------------------------------------------------------
    # 12. Finalize sale → immutable invoice + stock out + GL post.
    # For a walk-in (customer_id None) the service posts one batch:
    #   Dr Cash / Cr Revenue for total, and if COGS > 0 also Dr COGS / Cr Inventory.
    # COGS is WAVG × qty, and since the goods receipt was the first receipt,
    # WAVG == po_unit_cost.
    # -----------------------------------------------------------------
    finalize_resp = await client.post(
        "/api/v1/pos/sales/finalize",
        headers=hdr,
        json={
            "cart_id": cart_id,
            "payment_intent_id": intent_id,
            "idempotency_key": f"final-journey-{suffix}",
        },
    )
    assert finalize_resp.status_code == 200, finalize_resp.text
    invoice = finalize_resp.json()
    assert invoice["total"] == pytest.approx(cart_total)
    assert invoice["branch_id"] == store_id

    expected_cogs = sell_qty * po_unit_cost  # 12.00
    expected_revenue = cart_total  # 15.00

    # -----------------------------------------------------------------
    # 13. Shift close.
    # -----------------------------------------------------------------
    close_resp = await client.post(
        f"/api/v1/pos/shifts/{shift_id}/close",
        headers=hdr,
        json={"declared_cash": 100.0},
    )
    assert close_resp.status_code == 200, close_resp.text

    # -----------------------------------------------------------------
    # 14. Trial balance assertions. Because other tests may have posted
    # journal entries against the same global chart of accounts, we
    # isolate by filtering the trial balance to the two branches we
    # created in this journey. Every automated posting we produced here
    # is tagged with one of those branch ids.
    # -----------------------------------------------------------------
    as_of = (today + timedelta(days=1)).isoformat()

    async def _tb_for(branch_id: int) -> dict[str, dict]:
        resp = await client.get(
            "/api/v1/accounting/trial-balance",
            headers=hdr,
            params={"as_of": as_of, "branch_id": branch_id},
        )
        assert resp.status_code == 200, resp.text
        return {row["code"]: row for row in resp.json()}

    tb_wh = await _tb_for(warehouse_id)
    tb_store = await _tb_for(store_id)

    def _balanced(by_code: dict[str, dict]) -> None:
        total_dr = round(sum(row["total_debit"] for row in by_code.values()), 2)
        total_cr = round(sum(row["total_credit"] for row in by_code.values()), 2)
        assert total_dr == total_cr, (
            f"Branch trial balance unbalanced: debits={total_dr}, credits={total_cr}"
        )

    _balanced(tb_wh)
    _balanced(tb_store)

    # Warehouse branch: one goods receipt → Dr Inventory / Cr AP at 60.00.
    assert tb_wh["1200"]["net"] == pytest.approx(expected_inventory_dr), tb_wh["1200"]
    assert tb_wh["2000"]["net"] == pytest.approx(-expected_inventory_dr), tb_wh["2000"]

    # Storefront branch:
    #   one walk-in sale posts Dr Cash 15 / Cr Revenue 15 and
    #   Dr COGS 12 / Cr Inventory 12 (the WAVG draw-down at sale time).
    assert tb_store["1000"]["net"] == pytest.approx(expected_revenue), tb_store["1000"]
    assert tb_store["4000"]["net"] == pytest.approx(-expected_revenue), tb_store["4000"]
    assert tb_store["5000"]["net"] == pytest.approx(expected_cogs), tb_store["5000"]
    assert tb_store["1200"]["net"] == pytest.approx(-expected_cogs), tb_store["1200"]

    # Global trial balance must still balance for the whole org.
    tb_global_resp = await client.get(
        "/api/v1/accounting/trial-balance",
        headers=hdr,
        params={"as_of": as_of},
    )
    assert tb_global_resp.status_code == 200, tb_global_resp.text
    tb_global = tb_global_resp.json()
    assert tb_global, "Global trial balance should not be empty"
    total_dr = round(sum(row["total_debit"] for row in tb_global), 2)
    total_cr = round(sum(row["total_credit"] for row in tb_global), 2)
    assert total_dr == total_cr, (
        f"Global trial balance unbalanced: debits={total_dr}, credits={total_cr}"
    )

    # -----------------------------------------------------------------
    # Cross-check with the storefront income statement for the period.
    # -----------------------------------------------------------------
    period_start = (today - timedelta(days=1)).isoformat()
    period_end = (today + timedelta(days=1)).isoformat()
    is_resp = await client.get(
        "/api/v1/accounting/income-statement",
        headers=hdr,
        params={
            "period_start": period_start,
            "period_end": period_end,
            "branch_id": store_id,
        },
    )
    assert is_resp.status_code == 200, is_resp.text
    is_data = is_resp.json()
    assert is_data["total_revenue"] == pytest.approx(expected_revenue)
    assert is_data["total_expense"] == pytest.approx(expected_cogs)
    assert is_data["net_income"] == pytest.approx(expected_revenue - expected_cogs)

    # -----------------------------------------------------------------
    # Balance-sheet identity per branch. Because MEZAN does not auto-close
    # P&L into retained earnings, the gap
    #   total_assets - total_liabilities - total_equity
    # equals the unclosed net income / (-net expense) for that branch.
    # For the warehouse: Dr Inv 60 / Cr AP 60 → identity 0.
    # For the storefront: Dr Cash 15 / Dr COGS 12 / Cr Rev 15 / Cr Inv 12
    #                    → net income 3 → identity 3.
    # -----------------------------------------------------------------
    bs_wh = await client.get(
        "/api/v1/accounting/balance-sheet",
        headers=hdr,
        params={"as_of": as_of, "branch_id": warehouse_id},
    )
    assert bs_wh.status_code == 200, bs_wh.text
    assert bs_wh.json()["assets_minus_liabilities_equity"] == pytest.approx(0.0)

    bs_store = await client.get(
        "/api/v1/accounting/balance-sheet",
        headers=hdr,
        params={"as_of": as_of, "branch_id": store_id},
    )
    assert bs_store.status_code == 200, bs_store.text
    assert bs_store.json()["assets_minus_liabilities_equity"] == pytest.approx(
        expected_revenue - expected_cogs
    )

    # -----------------------------------------------------------------
    # Fetch GL for Revenue (storefront) and assert the source is the
    # sales invoice we just created.
    # -----------------------------------------------------------------
    gl_resp = await client.get(
        "/api/v1/accounting/general-ledger",
        headers=hdr,
        params={
            "account_id": accounts["4000"],
            "date_from": period_start,
            "date_to": period_end,
            "branch_id": store_id,
        },
    )
    assert gl_resp.status_code == 200, gl_resp.text
    gl_lines = gl_resp.json()
    assert any(ln["source_type"] == "sales_invoice" for ln in gl_lines), gl_lines
    assert sum(ln["credit"] for ln in gl_lines) == pytest.approx(expected_revenue)

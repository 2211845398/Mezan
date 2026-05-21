"""PO goods receipt: variant deferred to receive time vs preset on PO line."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.errors import ValidationError
from app.models.branch import Branch
from app.models.category import Category
from app.models.chart_accounts import ChartAccount
from app.models.goods_receipt import GoodsReceipt
from app.models.goods_receipt_line import GoodsReceiptLine
from app.models.journal_entries import JournalEntry, JournalEntryLine
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.purchase_order import PurchaseOrder
from app.models.purchase_order_line import PurchaseOrderLine
from app.models.stock_level import StockLevel
from app.services.accounting_service import get_accounting_settings
from app.services.goods_receipt_service import receive_goods_for_purchase_order
from app.services.purchase_order_service import create_po, mark_po_sent
from app.services.seed_service import seed_accounting_defaults


@pytest.mark.asyncio
async def test_po_line_without_variant_stores_null(db_session) -> None:
    category = Category(
        name="POV Cat",
        slug=f"pov-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Shirt",
        sku=f"sh-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("5.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "Supplier",
            "branch_id": None,
            "lines": [{"product_id": product.id, "qty": 10}],
        },
    )
    pol = po.lines[0]
    assert pol.variant_id is None
    assert pol.unit_cost is None


@pytest.mark.asyncio
async def test_receive_requires_variant_when_po_line_open(db_session) -> None:
    branch = Branch(
        name="Recv Branch",
        code=f"RB-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="POV Cat2",
        slug=f"pov2-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Shirt2",
        sku=f"sh2-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("5.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    v_red = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-RED",
        attribute_values={"color": "red"},
        active=True,
    )
    db_session.add(v_red)
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "Supplier",
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "qty": 5}],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    pol_id = po.lines[0].id

    with pytest.raises(ValidationError, match="variant_id is required"):
        await receive_goods_for_purchase_order(
            db_session,
            purchase_order_id=po.id,
            branch_id=branch.id,
            lines=[{"purchase_order_line_id": pol_id, "qty": 5, "unit_cost": Decimal("6.5")}],
            idempotency_key=f"gr-missing-var-{uuid.uuid4().hex}",
            created_by_user_id=None,
        )


@pytest.mark.asyncio
async def test_receive_requires_unit_cost(db_session) -> None:
    branch = Branch(
        name="Recv BranchCost",
        code=f"RBC-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="POV CatCost",
        slug=f"povc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="ShirtCost",
        sku=f"shc-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("5.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    v_only = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-ONLY",
        attribute_values={},
        active=True,
    )
    db_session.add(v_only)
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "Supplier",
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": v_only.id, "qty": 2}],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    pol_id = po.lines[0].id

    with pytest.raises(ValidationError):
        await receive_goods_for_purchase_order(
            db_session,
            purchase_order_id=po.id,
            branch_id=branch.id,
            lines=[{"purchase_order_line_id": pol_id, "qty": 2}],
            idempotency_key=f"gr-no-cost-{uuid.uuid4().hex}",
            created_by_user_id=None,
        )


@pytest.mark.asyncio
async def test_receive_splits_qty_across_variants(db_session) -> None:
    branch = Branch(
        name="Recv Branch3",
        code=f"RB3-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="POV Cat3",
        slug=f"pov3-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Shirt3",
        sku=f"sh3-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("5.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    v_red = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-RED",
        attribute_values={"color": "red"},
        active=True,
    )
    v_green = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-GRN",
        attribute_values={"color": "green"},
        active=True,
    )
    db_session.add_all([v_red, v_green])
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "Supplier",
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "qty": 10}],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    pol_id = po.lines[0].id

    receipt, po_closed = await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[
            {
                "purchase_order_line_id": pol_id,
                "qty": 4,
                "variant_id": v_red.id,
                "unit_cost": Decimal("6.5"),
            },
            {
                "purchase_order_line_id": pol_id,
                "qty": 6,
                "variant_id": v_green.id,
                "unit_cost": Decimal("6.5"),
            },
        ],
        idempotency_key=f"gr-split-{uuid.uuid4().hex}",
        created_by_user_id=None,
    )
    assert po_closed is True

    res = await db_session.execute(
        select(GoodsReceiptLine).where(GoodsReceiptLine.goods_receipt_id == receipt.id)
    )
    gr_lines = list(res.scalars().all())
    assert len(gr_lines) == 2
    by_var = {ln.variant_id: ln.qty for ln in gr_lines}
    assert by_var[v_red.id] == 4
    assert by_var[v_green.id] == 6

    sl_red = await db_session.execute(
        select(StockLevel).where(
            StockLevel.branch_id == branch.id,
            StockLevel.product_id == product.id,
            StockLevel.variant_id == v_red.id,
        )
    )
    sl_green = await db_session.execute(
        select(StockLevel).where(
            StockLevel.branch_id == branch.id,
            StockLevel.product_id == product.id,
            StockLevel.variant_id == v_green.id,
        )
    )
    assert int(sl_red.scalar_one().on_hand) == 4
    assert int(sl_green.scalar_one().on_hand) == 6


@pytest.mark.asyncio
async def test_receive_uses_po_line_variant_when_preset(db_session) -> None:
    branch = Branch(
        name="Recv Branch4",
        code=f"RB4-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="POV Cat4",
        slug=f"pov4-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Shirt4",
        sku=f"sh4-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("5.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    v_only = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-ONLY",
        attribute_values={},
        active=True,
    )
    db_session.add(v_only)
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "Supplier",
            "branch_id": branch.id,
            "lines": [
                {
                    "product_id": product.id,
                    "variant_id": v_only.id,
                    "qty": 3,
                }
            ],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    pol_id = po.lines[0].id

    receipt, po_closed = await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[{"purchase_order_line_id": pol_id, "qty": 3, "unit_cost": Decimal("6.5")}],
        idempotency_key=f"gr-preset-{uuid.uuid4().hex}",
        created_by_user_id=None,
    )
    assert po_closed is True

    res = await db_session.execute(
        select(GoodsReceiptLine).where(GoodsReceiptLine.goods_receipt_id == receipt.id)
    )
    gr_lines = list(res.scalars().all())
    assert len(gr_lines) == 1
    assert gr_lines[0].variant_id == v_only.id

    po_row = await db_session.get(PurchaseOrder, po.id)
    assert po_row is not None
    assert po_row.status == "closed"


@pytest.mark.asyncio
async def test_partial_receive_does_not_auto_close_po(db_session) -> None:
    branch = Branch(
        name="Recv Branch5",
        code=f"RB5-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="POV Cat5",
        slug=f"pov5-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="Shirt5",
        sku=f"sh5-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("5.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    v_only = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-ONLY",
        attribute_values={},
        active=True,
    )
    db_session.add(v_only)
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "Supplier",
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": v_only.id, "qty": 10}],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    pol_id = po.lines[0].id

    _, po_closed = await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[{"purchase_order_line_id": pol_id, "qty": 4, "unit_cost": Decimal("6.5")}],
        idempotency_key=f"gr-partial-{uuid.uuid4().hex}",
        created_by_user_id=None,
    )
    assert po_closed is False
    po_row = await db_session.get(PurchaseOrder, po.id)
    assert po_row is not None
    assert po_row.status == "sent"


@pytest.mark.asyncio
async def test_receive_posts_gl_on_leaf_ap_account(db_session) -> None:
    await seed_accounting_defaults(db_session)
    settings = await get_accounting_settings(db_session)

    ap_leaf = await db_session.execute(select(ChartAccount).where(ChartAccount.code == "2010"))
    leaf = ap_leaf.scalar_one_or_none()
    assert leaf is not None
    assert settings.default_ap_account_id == leaf.id

    branch = Branch(
        name="GL Recv",
        code=f"GL-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="GL Cat",
        slug=f"glc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="GL Shirt",
        sku=f"gl-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("5.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(variant)
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "GL Supplier",
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 2}],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    pol_id = po.lines[0].id

    receipt, _ = await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[{"purchase_order_line_id": pol_id, "qty": 2, "unit_cost": Decimal("10")}],
        idempotency_key=f"gr-gl-{uuid.uuid4().hex}",
        created_by_user_id=None,
    )

    je_res = await db_session.execute(
        select(JournalEntry).where(
            JournalEntry.idempotency_key == f"goods_receipt:{receipt.id}:ap_inventory"
        )
    )
    je = je_res.scalar_one_or_none()
    assert je is not None

    cr_res = await db_session.execute(
        select(JournalEntryLine).where(
            JournalEntryLine.journal_entry_id == je.id,
            JournalEntryLine.credit > 0,
        )
    )
    cr_line = cr_res.scalar_one()
    assert cr_line.account_id == leaf.id


@pytest.mark.asyncio
async def test_receive_fails_when_default_ap_is_control(db_session) -> None:
    await seed_accounting_defaults(db_session)
    settings = await get_accounting_settings(db_session)

    ctrl_res = await db_session.execute(select(ChartAccount).where(ChartAccount.code == "2000"))
    control = ctrl_res.scalar_one_or_none()
    assert control is not None
    assert control.is_control is True

    original_ap = settings.default_ap_account_id
    settings.default_ap_account_id = control.id
    await db_session.flush()

    branch = Branch(
        name="GL Fail",
        code=f"GF-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="GF Cat",
        slug=f"gfc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="GF Product",
        sku=f"gf-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("3.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(variant)
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "GF Supplier",
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 1}],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    pol_id = po.lines[0].id

    with pytest.raises(ValidationError, match="control"):
        await receive_goods_for_purchase_order(
            db_session,
            purchase_order_id=po.id,
            branch_id=branch.id,
            lines=[{"purchase_order_line_id": pol_id, "qty": 1, "unit_cost": Decimal("5")}],
            idempotency_key=f"gr-ctrl-{uuid.uuid4().hex}",
            created_by_user_id=None,
        )

    settings.default_ap_account_id = original_ap


@pytest.mark.asyncio
async def test_receive_stores_receipt_notes(db_session) -> None:
    await seed_accounting_defaults(db_session)

    branch = Branch(
        name="Notes Recv",
        code=f"NR-{uuid.uuid4().hex[:6]}",
        address=None,
        timezone="UTC",
        is_active=True,
    )
    db_session.add(branch)
    await db_session.flush()

    category = Category(
        name="NR Cat",
        slug=f"nrc-{uuid.uuid4().hex[:8]}",
        sort_order=0,
        is_active=True,
    )
    db_session.add(category)
    await db_session.flush()

    product = Product(
        category_id=category.id,
        name="NR Product",
        sku=f"nr-{uuid.uuid4().hex[:6]}",
        status="active",
        attributes={},
        standard_cost=Decimal("4.0000"),
        output_vat_rate=Decimal("0"),
    )
    db_session.add(product)
    await db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"{product.sku}-V",
        attribute_values={},
        active=True,
    )
    db_session.add(variant)
    await db_session.flush()

    po = await create_po(
        db_session,
        created_by_user_id=None,
        data={
            "supplier_name": "NR Supplier",
            "branch_id": branch.id,
            "lines": [{"product_id": product.id, "variant_id": variant.id, "qty": 1}],
        },
    )
    await mark_po_sent(db_session, po_id=po.id)
    pol_id = po.lines[0].id

    receipt, _ = await receive_goods_for_purchase_order(
        db_session,
        purchase_order_id=po.id,
        branch_id=branch.id,
        lines=[{"purchase_order_line_id": pol_id, "qty": 1, "unit_cost": Decimal("8")}],
        idempotency_key=f"gr-notes-{uuid.uuid4().hex}",
        created_by_user_id=None,
        notes="  شحنة جزئية  ",
    )

    row = await db_session.get(GoodsReceipt, receipt.id)
    assert row is not None
    assert row.notes == "شحنة جزئية"


@pytest.mark.asyncio
async def test_receive_goods_api_po_deferred_variant(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
) -> None:
    suffix = uuid.uuid4().hex[:10]
    cat = await client.post(
        "/api/v1/categories",
        headers=admin_auth_header,
        json={
            "name": f"ApiCat_{suffix}",
            "slug": f"api-cat-{suffix}",
            "sort_order": 0,
            "is_active": True,
        },
    )
    assert cat.status_code == 201, cat.text
    cid = cat.json()["id"]

    prod = await client.post(
        "/api/v1/products",
        headers=admin_auth_header,
        json={
            "category_id": cid,
            "name": f"ApiShirt_{suffix}",
            "status": "active",
            "attributes": {},
        },
    )
    assert prod.status_code == 201, prod.text
    product_id = prod.json()["id"]

    detail = await client.get(
        f"/api/v1/products/{product_id}/with-variants",
        headers=admin_auth_header,
    )
    assert detail.status_code == 200, detail.text
    variants = detail.json().get("variants") or []
    assert len(variants) >= 1
    variant_id = variants[0]["id"]

    po = await client.post(
        "/api/v1/purchase-orders",
        headers=admin_auth_header,
        json={
            "supplier_name": "API Supplier",
            "branch_id": 1,
            "lines": [{"product_id": product_id, "qty": 8}],
        },
    )
    assert po.status_code == 201, po.text
    po_body = po.json()
    assert po_body["lines"][0].get("variant_id") is None
    po_id = po_body["id"]
    pol_id = po_body["lines"][0]["id"]

    sent = await client.post(f"/api/v1/purchase-orders/{po_id}/send", headers=admin_auth_header)
    assert sent.status_code == 200, sent.text

    recv = await client.post(
        f"/api/v1/purchase-orders/{po_id}/receive-goods",
        headers=admin_auth_header,
        json={
            "branch_id": 1,
            "idempotency_key": f"api-gr-{suffix}",
            "lines": [
                {
                    "purchase_order_line_id": pol_id,
                    "qty": 8,
                    "variant_id": variant_id,
                    "unit_cost": "7.25",
                },
            ],
        },
    )
    assert recv.status_code == 200, recv.text
    assert recv.json()["lines"][0]["variant_id"] == variant_id

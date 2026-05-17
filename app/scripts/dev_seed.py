"""Optional destructive reset + rich local development dataset.

Safety:
- Refuses to run when ENVIRONMENT is production unless MEZAN_ALLOW_DEV_SEED=1.

With ``--reset``, truncates all ``public`` tables except ``alembic_version``,
then runs base seeds (permissions, accounting, notification templates) and
inserts multiple branches, an admin user (home branch), categories, products,
prices, stock, and one authorized POS terminal per branch.

Dev terminal API keys (plain text, log on first create only) use the pattern
``pos_dev_{branch_code}_mezan2026`` — see README.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
from collections.abc import Sequence
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.database import AsyncSessionLocal, close_db, engine
from app.models.accounting_settings import AccountingSettings
from app.models.branch import Branch
from app.models.category import Category
from app.models.pos_terminal import POSTerminal
from app.models.product import Product
from app.models.product_price import ProductPrice
from app.models.product_variant import ProductVariant
from app.models.role import Role
from app.models.stock_level import StockLevel
from app.models.user_role import UserRole
from app.models.users import User
from app.services.seed_service import (
    ADMIN_ROLE_CODE,
    seed_accounting_defaults,
    seed_notification_templates,
    seed_permissions_and_roles,
)
from app.utils.security import hash_password, hash_token

logger = logging.getLogger(__name__)

_ALEMBIC = "alembic_version"

BRANCH_SPECS: list[dict[str, str | None]] = [
    {"code": "MAIN", "name": "Main Store", "address": "100 Central Avenue"},
    {"code": "NORTH", "name": "North Branch", "address": "20 North Road"},
    {"code": "SOUTH", "name": "South Branch", "address": "5 South Market St"},
]

CATEGORY_SPECS: list[dict[str, str]] = [
    {"name": "Beverages", "slug": "beverages"},
    {"name": "Groceries", "slug": "groceries"},
]

# (sku, name, category_slug, list_price, vat_rate, stock_matrix key: branch_code -> on_hand)
_PRODUCT_SPECS: list[tuple[str, str, str, Decimal, Decimal, dict[str, int]]] = [
    (
        "DEV-WATER-500",
        "Bottled Water 500ml",
        "beverages",
        Decimal("1.50"),
        Decimal("0.15"),
        {"MAIN": 120, "NORTH": 40, "SOUTH": 35},
    ),
    (
        "DEV-COFFEE-1KG",
        "Coffee Beans 1kg",
        "groceries",
        Decimal("24.99"),
        Decimal("0.15"),
        {"MAIN": 25, "NORTH": 10, "SOUTH": 8},
    ),
    (
        "DEV-RICE-5KG",
        "Rice 5kg Bag",
        "groceries",
        Decimal("18.00"),
        Decimal("0"),
        {"MAIN": 60, "NORTH": 20, "SOUTH": 15},
    ),
]


def _ensure_dev_seed_allowed() -> None:
    if settings.is_production and not settings.MEZAN_ALLOW_DEV_SEED:
        raise SystemExit(
            "dev_seed is disabled when ENVIRONMENT is production. "
            "Set MEZAN_ALLOW_DEV_SEED=1 only if you intentionally run this in prod."
        )


def _resolve_credentials(
    email_cli: str | None,
    password_cli: str | None,
    *,
    require: bool,
) -> tuple[str | None, str | None]:
    email = email_cli or settings.DEFAULT_ADMIN_EMAIL
    password = password_cli or settings.DEFAULT_ADMIN_PASSWORD
    if require and (not email or not password):
        raise SystemExit(
            "After --reset, set DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD in the "
            "environment or pass --email and --password."
        )
    return email, password


async def truncate_public_tables_except_alembic() -> None:
    """Remove all application data; keep migration history."""
    async with engine.begin() as conn:
        result = await conn.execute(
            text(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename NOT IN (:alembic)
                ORDER BY tablename
                """
            ),
            {"alembic": _ALEMBIC},
        )
        tables: list[str] = [row[0] for row in result.fetchall()]
        if not tables:
            logger.warning("No public tables found to truncate.")
            return
        identifiers = ", ".join(f'"{t}"' for t in tables)
        await conn.execute(text(f"TRUNCATE TABLE {identifiers} RESTART IDENTITY CASCADE"))
    logger.info("Truncated %s public tables (alembic_version preserved).", len(tables))


async def _get_or_create_branches(db: AsyncSession) -> list[Branch]:
    branches: list[Branch] = []
    for spec in BRANCH_SPECS:
        code = str(spec["code"])
        res = await db.execute(select(Branch).where(Branch.code == code))
        existing = res.scalar_one_or_none()
        if existing is not None:
            branches.append(existing)
            continue
        b = Branch(
            code=code,
            name=str(spec["name"]),
            address=spec.get("address") if spec.get("address") else None,
            timezone="UTC",
            is_active=True,
        )
        db.add(b)
        await db.flush()
        branches.append(b)
        logger.info("Created branch %s (%s).", code, b.name)
    return branches


async def _ensure_dev_admin(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    primary_branch: Branch,
) -> User:
    res = await db.execute(select(User).where(User.email == email))
    existing = res.scalar_one_or_none()
    if existing is not None:
        if existing.branch_id is None:
            existing.branch_id = primary_branch.id
            await db.flush()
            logger.info("Updated existing user home branch to %s.", primary_branch.code)
        res_roles = await db.execute(select(UserRole).where(UserRole.user_id == existing.id))
        has_admin = False
        for ur in res_roles.scalars().all():
            r = await db.execute(select(Role).where(Role.id == ur.role_id))
            role = r.scalar_one_or_none()
            if role and role.code == ADMIN_ROLE_CODE:
                has_admin = True
                break
        if not has_admin:
            res_ar = await db.execute(select(Role).where(Role.code == ADMIN_ROLE_CODE))
            admin_role = res_ar.scalar_one()
            db.add(UserRole(user_id=existing.id, role_id=admin_role.id, branch_id=None))
            await db.flush()
            logger.info("Attached Admin role to existing user.")
        return existing

    res_ar = await db.execute(select(Role).where(Role.code == ADMIN_ROLE_CODE))
    admin_role = res_ar.scalar_one()
    user = User(
        email=email,
        first_name="Dev Administrator",
        father_name=None,
        family_name=None,
        password_hash=hash_password(password),
        status="active",
        branch_id=primary_branch.id,
        preferred_language="en",
    )
    db.add(user)
    await db.flush()
    db.add(UserRole(user_id=user.id, role_id=admin_role.id, branch_id=None))
    await db.flush()
    logger.info("Created dev admin %s with home branch %s.", email, primary_branch.code)
    return user


async def _get_or_create_categories(db: AsyncSession) -> dict[str, Category]:
    by_slug: dict[str, Category] = {}
    for spec in CATEGORY_SPECS:
        slug = spec["slug"]
        res = await db.execute(select(Category).where(Category.slug == slug))
        cat = res.scalar_one_or_none()
        if cat is not None:
            by_slug[slug] = cat
            continue
        cat = Category(
            parent_id=None,
            name=spec["name"],
            slug=slug,
            sort_order=0,
            is_active=True,
        )
        db.add(cat)
        await db.flush()
        by_slug[slug] = cat
        logger.info("Created category %s.", slug)
    return by_slug


async def _base_currency_id(db: AsyncSession) -> int:
    res = await db.execute(select(AccountingSettings).where(AccountingSettings.id == 1))
    row = res.scalar_one()
    return row.base_currency_id


async def _ensure_products_prices_stock_terminals(
    db: AsyncSession,
    branches: Sequence[Branch],
    categories: dict[str, Category],
) -> None:
    currency_id = await _base_currency_id(db)
    branch_by_code = {b.code: b for b in branches}
    now = datetime.now(UTC)

    for sku, name, cat_slug, price, vat, stock_map in _PRODUCT_SPECS:
        res = await db.execute(select(Product).where(Product.sku == sku))
        product = res.scalar_one_or_none()
        cat = categories[cat_slug]
        if product is None:
            product = Product(
                category_id=cat.id,
                name=name,
                sku=sku,
                barcode=None,
                status="active",
                attributes={},
                standard_cost=price * Decimal("0.6"),
                output_vat_rate=vat,
            )
            db.add(product)
            await db.flush()
            logger.info("Created product %s.", sku)

        res_p = await db.execute(
            select(ProductPrice).where(
                ProductPrice.product_id == product.id,
                ProductPrice.currency_id == currency_id,
            )
        )
        if res_p.scalar_one_or_none() is None:
            db.add(
                ProductPrice(
                    product_id=product.id,
                    currency_id=currency_id,
                    amount=price,
                    valid_from=now,
                )
            )
            await db.flush()

        res_pv = await db.execute(
            select(ProductVariant).where(ProductVariant.product_id == product.id).limit(1)
        )
        pv = res_pv.scalar_one_or_none()
        if pv is None:
            pv = ProductVariant(
                product_id=product.id,
                sku=f"{product.sku}-DEFAULT",
                attribute_values={},
                active=True,
            )
            db.add(pv)
            await db.flush()

        for code, branch in branch_by_code.items():
            on_hand = stock_map.get(code, 0)
            res_s = await db.execute(
                select(StockLevel).where(
                    StockLevel.branch_id == branch.id,
                    StockLevel.product_id == product.id,
                    StockLevel.variant_id == pv.id,
                )
            )
            sl = res_s.scalar_one_or_none()
            if sl is None:
                db.add(
                    StockLevel(
                        branch_id=branch.id,
                        product_id=product.id,
                        variant_id=pv.id,
                        on_hand=on_hand,
                        reserved=0,
                        damaged=0,
                        version=0,
                    )
                )
            else:
                sl.on_hand = on_hand

    await db.flush()

    for branch in branches:
        term_code = f"DEV-TERM-{branch.code}"
        res_t = await db.execute(select(POSTerminal).where(POSTerminal.terminal_code == term_code))
        if res_t.scalar_one_or_none() is not None:
            continue
        api_key_plain = f"pos_dev_{branch.code.lower()}_mezan2026"
        db.add(
            POSTerminal(
                branch_id=branch.id,
                name=f"Dev register ({branch.name})",
                terminal_code=term_code,
                api_key_hash=hash_token(api_key_plain),
                is_authorized=True,
            )
        )
        await db.flush()
        logger.info(
            "Created POS terminal %s — API key (dev only): %s",
            term_code,
            api_key_plain,
        )


async def seed_dev_fixtures(
    db: AsyncSession,
    email: str,
    password: str,
) -> None:
    branches = await _get_or_create_branches(db)
    primary = branches[0]
    await _ensure_dev_admin(db, email=email, password=password, primary_branch=primary)
    categories = await _get_or_create_categories(db)
    await _ensure_products_prices_stock_terminals(db, branches, categories)
    await db.commit()


async def run_dev_seed(
    *,
    reset: bool,
    email: str | None,
    password: str | None,
) -> None:
    _ensure_dev_seed_allowed()
    email_f, password_f = _resolve_credentials(email, password, require=reset)

    if reset:
        await truncate_public_tables_except_alembic()

    async with AsyncSessionLocal() as db:
        await seed_permissions_and_roles(db)
        await seed_accounting_defaults(db)
        await seed_notification_templates(db)

        if not email_f or not password_f:
            logger.info(
                "Skipping dev branches/catalog/admin: configure DEFAULT_ADMIN_EMAIL and "
                "DEFAULT_ADMIN_PASSWORD or pass --email / --password."
            )
            return

        await seed_dev_fixtures(db, email_f, password_f)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Bootstrap or reset a rich dev database.")
    p.add_argument(
        "--reset",
        action="store_true",
        help="Truncate all public data (except alembic_version) before seeding.",
    )
    p.add_argument("--email", default=None, help="Dev admin email (overrides DEFAULT_ADMIN_EMAIL).")
    p.add_argument(
        "--password",
        default=None,
        help="Dev admin password (overrides DEFAULT_ADMIN_PASSWORD).",
    )
    return p.parse_args(argv)


async def main_async(argv: list[str] | None = None) -> None:
    args = _parse_args(argv)
    try:
        await run_dev_seed(reset=args.reset, email=args.email, password=args.password)
    finally:
        await close_db()


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main_async())


if __name__ == "__main__":
    main()

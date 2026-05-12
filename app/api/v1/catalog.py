"""Catalog API (Epic 2): categories, dynamic attributes, products, barcodes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_any_permission, require_permission
from app.core.config import settings
from app.db.database import get_db
from app.models.users import User
from app.schemas.catalog import (
    CategoryAttributeDefCreate,
    CategoryAttributeDefListRead,
    CategoryAttributeDefRead,
    CategoryAttributeDefUpdate,
    CategoryCreate,
    CategoryImageUploadRead,
    CategoryRead,
    CategoryTreeNode,
    CategoryUpdate,
    ProductCreate,
    ProductImageUploadRead,
    ProductRead,
    ProductUpdate,
)
from app.services import audit_service
from app.services.catalog_service import (
    archive_product,
    create_category,
    create_category_attribute_def,
    create_product,
    delete_category,
    delete_category_attribute_def,
    filter_products_by_attributes,
    generate_product_barcode,
    get_category,
    get_product,
    list_categories,
    list_category_attribute_defs_for_ui,
    list_category_tree,
    list_products,
    product_to_read,
    products_to_reads,
    save_category_image_bytes,
    save_product_image_bytes,
    unarchive_product,
    update_category,
    update_category_attribute_def,
    update_product,
)

router = APIRouter()


# Categories
@router.post("/categories", response_model=CategoryRead, status_code=status.HTTP_201_CREATED)
async def create_category_endpoint(
    body: CategoryCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "create"),
) -> CategoryRead:
    category = await create_category(db, data=body.model_dump())
    await audit_service.log(
        session=db,
        action="category.created",
        resource_type="category",
        resource_id=str(category.id),
        new_value=CategoryRead.model_validate(category).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return CategoryRead.model_validate(category)


@router.get("/categories", response_model=list[CategoryRead])
async def list_categories_endpoint(
    parent_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[CategoryRead]:
    cats = await list_categories(db, parent_id=parent_id)
    return [CategoryRead.model_validate(c) for c in cats]


@router.get("/categories/tree", response_model=list[CategoryTreeNode])
async def get_category_tree_endpoint(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[CategoryTreeNode]:
    return await list_category_tree(db)


@router.post("/categories/images", response_model=CategoryImageUploadRead)
async def upload_category_image_endpoint(
    file: UploadFile = File(...),
    _: None = Depends(get_current_user),
    __: None = require_any_permission(("catalog", "create"), ("catalog", "update")),
) -> CategoryImageUploadRead:
    """Upload a category cover image (JPEG, PNG, or WebP); returns a URL to store on the category."""
    raw = await file.read(settings.CATALOG_CATEGORY_IMAGE_MAX_BYTES + 1)
    if len(raw) > settings.CATALOG_CATEGORY_IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Category image file too large",
        )
    try:
        url = save_category_image_bytes(raw)
    except ValueError as exc:
        code = str(exc)
        if code == "category_image_too_large":
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Category image file too large",
            ) from exc
        if code == "category_image_invalid":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Category image must be JPEG, PNG, or WebP",
            ) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code) from exc
    return CategoryImageUploadRead(image_url=url)


@router.get("/categories/{category_id}", response_model=CategoryRead)
async def get_category_endpoint(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> CategoryRead:
    category = await get_category(db, category_id)
    return CategoryRead.model_validate(category)


@router.patch("/categories/{category_id}", response_model=CategoryRead)
async def update_category_endpoint(
    category_id: int,
    body: CategoryUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> CategoryRead:
    category = await update_category(
        db, category_id=category_id, data=body.model_dump(exclude_unset=True)
    )
    await audit_service.log(
        session=db,
        action="category.updated",
        resource_type="category",
        resource_id=str(category.id),
        new_value=CategoryRead.model_validate(category).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return CategoryRead.model_validate(category)


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category_endpoint(
    category_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "delete"),
) -> None:
    await delete_category(db, category_id=category_id)
    await audit_service.log(
        session=db,
        action="category.deleted",
        resource_type="category",
        resource_id=str(category_id),
        new_value=None,
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


# Category attribute definitions
@router.get(
    "/categories/{category_id}/attributes",
    response_model=list[CategoryAttributeDefListRead],
)
async def list_category_attributes_endpoint(
    category_id: int,
    include_inherited: bool = Query(
        False,
        description="Include ancestor definitions not overridden on this category.",
    ),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[CategoryAttributeDefListRead]:
    rows = await list_category_attribute_defs_for_ui(
        db, category_id=category_id, include_inherited=include_inherited
    )
    out: list[CategoryAttributeDefListRead] = []
    for rec, is_inherited, src_name in rows:
        base = CategoryAttributeDefRead.model_validate(rec)
        out.append(
            CategoryAttributeDefListRead(
                **base.model_dump(),
                is_inherited=is_inherited,
                source_category_name=src_name,
            )
        )
    return out


@router.post(
    "/categories/{category_id}/attributes",
    response_model=CategoryAttributeDefRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_category_attribute_endpoint(
    category_id: int,
    body: CategoryAttributeDefCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> CategoryAttributeDefRead:
    rec = await create_category_attribute_def(db, category_id=category_id, data=body.model_dump())
    await audit_service.log(
        session=db,
        action="category_attribute_def.created",
        resource_type="category_attribute_def",
        resource_id=str(rec.id),
        new_value=CategoryAttributeDefRead.model_validate(rec).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return CategoryAttributeDefRead.model_validate(rec)


@router.patch(
    "/categories/{category_id}/attributes/{attr_id}",
    response_model=CategoryAttributeDefRead,
)
async def update_category_attribute_endpoint(
    category_id: int,
    attr_id: int,
    body: CategoryAttributeDefUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> CategoryAttributeDefRead:
    rec = await update_category_attribute_def(
        db,
        category_id=category_id,
        attr_id=attr_id,
        data=body.model_dump(exclude_unset=True),
    )
    await audit_service.log(
        session=db,
        action="category_attribute_def.updated",
        resource_type="category_attribute_def",
        resource_id=str(rec.id),
        new_value=CategoryAttributeDefRead.model_validate(rec).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return CategoryAttributeDefRead.model_validate(rec)


@router.delete(
    "/categories/{category_id}/attributes/{attr_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_category_attribute_endpoint(
    category_id: int,
    attr_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> None:
    await delete_category_attribute_def(db, category_id=category_id, attr_id=attr_id)
    await audit_service.log(
        session=db,
        action="category_attribute_def.deleted",
        resource_type="category_attribute_def",
        resource_id=str(attr_id),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()


# Products
@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product_endpoint(
    body: ProductCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "create"),
) -> ProductRead:
    """Create a product; prefer `sell_price` over `attributes.price` going forward."""
    product = await create_product(db, data=body.model_dump(exclude_none=True))
    read = await product_to_read(db, product)
    await audit_service.log(
        session=db,
        action="product.created",
        resource_type="product",
        resource_id=str(product.id),
        new_value=read.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return read


@router.get("/products", response_model=list[ProductRead])
async def list_products_endpoint(
    q: str | None = None,
    category_id: int | None = None,
    category_include_descendants: bool = False,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[ProductRead]:
    rows = await list_products(
        db,
        q=q,
        category_id=category_id,
        category_include_descendants=category_include_descendants,
        status=status,
        limit=limit,
        offset=offset,
    )
    return await products_to_reads(db, rows)


@router.post("/products/images", response_model=ProductImageUploadRead)
async def upload_product_image_endpoint(
    file: UploadFile = File(...),
    _: None = Depends(get_current_user),
    __: None = require_any_permission(("catalog", "create"), ("catalog", "update")),
) -> ProductImageUploadRead:
    """Upload a product cover image (JPEG, PNG, or WebP); returns a URL to store on the product."""
    raw = await file.read(settings.CATALOG_PRODUCT_IMAGE_MAX_BYTES + 1)
    if len(raw) > settings.CATALOG_PRODUCT_IMAGE_MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Product image file too large",
        )
    try:
        url = save_product_image_bytes(raw)
    except ValueError as exc:
        code = str(exc)
        if code == "product_image_too_large":
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Product image file too large",
            ) from exc
        if code == "product_image_invalid":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Product image must be JPEG, PNG, or WebP",
            ) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=code) from exc
    return ProductImageUploadRead(image_url=url)


@router.get("/products/{product_id}", response_model=ProductRead)
async def get_product_endpoint(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> ProductRead:
    product = await get_product(db, product_id)
    return await product_to_read(db, product)


@router.patch("/products/{product_id}", response_model=ProductRead)
async def update_product_endpoint(
    product_id: int,
    body: ProductUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> ProductRead:
    """Update a product; `attributes.price` remains accepted as a temporary compatibility path."""
    product = await update_product(
        db, product_id=product_id, data=body.model_dump(exclude_unset=True)
    )
    read = await product_to_read(db, product)
    await audit_service.log(
        session=db,
        action="product.updated",
        resource_type="product",
        resource_id=str(product.id),
        new_value=read.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return read


@router.post("/products/{product_id}/archive", response_model=ProductRead)
async def archive_product_endpoint(
    product_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> ProductRead:
    product = await archive_product(db, product_id=product_id)
    read = await product_to_read(db, product)
    await audit_service.log(
        session=db,
        action="product.archived",
        resource_type="product",
        resource_id=str(product.id),
        new_value=read.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return read


@router.post("/products/{product_id}/unarchive", response_model=ProductRead)
async def unarchive_product_endpoint(
    product_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> ProductRead:
    product = await unarchive_product(db, product_id=product_id)
    read = await product_to_read(db, product)
    await audit_service.log(
        session=db,
        action="product.unarchived",
        resource_type="product",
        resource_id=str(product.id),
        new_value=read.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return read


@router.post("/products/{product_id}/barcode", response_model=ProductRead)
async def generate_barcode_endpoint(
    product_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> ProductRead:
    product = await generate_product_barcode(db, product_id=product_id)
    read = await product_to_read(db, product)
    await audit_service.log(
        session=db,
        action="product.barcode_generated",
        resource_type="product",
        resource_id=str(product.id),
        new_value=read.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return read


# Epic 18.8: Attribute-based product filtering
@router.post("/products/filter-by-attributes", response_model=list[ProductRead])
async def filter_products_by_attributes_endpoint(
    category_id: int | None = None,
    attributes_filter: dict | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[ProductRead]:
    """Filter products by category and multiple attributes.

    Example: {"color": "red", "size": "L"} finds products with both attributes.
    """
    if attributes_filter is None:
        attributes_filter = {}
    rows = await filter_products_by_attributes(
        db,
        category_id=category_id,
        attributes_filter=attributes_filter,
        limit=limit,
        offset=offset,
    )
    return await products_to_reads(db, rows)


# Epic 18.10: Variant-aware product detail
@router.get("/products/{product_id}/with-variants")
async def get_product_with_variants_endpoint(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> dict:
    """Get product with variants, stock per variant, and last cost per variant."""
    from app.models.product_variant import ProductVariant
    from app.models.stock_level import StockLevel
    from app.models.branch_product_costs import BranchProductCost
    from app.services.pricing_service import get_active_sell_price

    product = await get_product(db, product_id)
    base_read = await product_to_read(db, product)

    # Get variants
    variants_res = await db.execute(
        select(ProductVariant).where(ProductVariant.product_id == product_id)
    )
    variants = variants_res.scalars().all()

    variants_data = []
    for v in variants:
        # Get stock for this variant
        stock_res = await db.execute(
            select(StockLevel).where(StockLevel.variant_id == v.id)
        )
        stock_levels = stock_res.scalars().all()
        stock_by_branch = {s.branch_id: s.qty for s in stock_levels}

        # Get last cost for this variant
        cost_res = await db.execute(
            select(BranchProductCost).where(BranchProductCost.variant_id == v.id)
        )
        costs = cost_res.scalars().all()
        cost_by_branch = {c.branch_id: c.last_unit_cost for c in costs}

        # Get price
        price = await get_active_sell_price(db, product_id=product_id, variant_id=v.id)

        variants_data.append({
            "id": v.id,
            "sku": v.sku,
            "barcode": v.barcode,
            "attribute_values": v.attribute_values,
            "active": v.active,
            "stock_by_branch": stock_by_branch,
            "last_cost_by_branch": cost_by_branch,
            "sell_price": price,
        })

    return {
        "product": base_read.model_dump(),
        "variants": variants_data,
        "variant_count": len(variants_data),
    }

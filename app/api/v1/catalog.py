"""Catalog API (Epic 2): categories, dynamic attributes, products, barcodes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.encoders import jsonable_encoder
from starlette.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_any_permission, require_permission
from app.core.config import settings
from app.db.database import get_db
from app.models.users import User
from app.schemas.catalog import (
    CategoryCreate,
    CategoryImageUploadRead,
    CategoryRead,
    CategoryTreeNode,
    CategoryUpdate,
    ProductCreate,
    ProductImageUploadRead,
    ProductListResponse,
    ProductRead,
    ProductUpdate,
    ProductVariantPurchasingSearchItem,
    TaxDefinitionCreate,
    TaxDefinitionRead,
    TaxDefinitionUpdate,
    UnitOfMeasureRead,
)
from app.schemas.variant_generation import (
    VariantPreviewRequest,
    VariantPreviewResponse,
    VariantSyncRequest,
    VariantSyncResponse,
)
from app.services import audit_service
from app.schemas.variant_generation import ProductWithVariantsRead
from app.services.variant_attribute_service import (
    export_variant_barcodes_csv,
    generate_missing_variant_barcodes,
    get_product_with_variants,
    preview_generate_variants,
    sync_product_variant_configuration,
)
from app.services.catalog_service import (
    archive_product,
    archive_tax_definition,
    count_products,
    create_category,
    create_product,
    create_tax_definition,
    delete_category,
    generate_product_barcode,
    get_category,
    get_product,
    get_tax_definition_row,
    list_categories,
    list_category_tree,
    list_products,
    list_tax_definitions,
    list_units_of_measure,
    product_to_read,
    products_to_reads,
    save_category_image_bytes,
    save_product_image_bytes,
    search_product_variants_for_purchasing,
    unarchive_product,
    update_category,
    update_product,
    update_tax_definition,
)

router = APIRouter()


@router.get("/units-of-measure", response_model=list[UnitOfMeasureRead])
async def list_units_of_measure_endpoint(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_any_permission(("catalog", "read"), ("catalog", "create")),
) -> list[UnitOfMeasureRead]:
    return await list_units_of_measure(db)


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


# Tax definitions (catalog output taxes)
@router.get("/tax-definitions", response_model=list[TaxDefinitionRead])
async def list_tax_definitions_endpoint(
    include_inactive: bool = True,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[TaxDefinitionRead]:
    rows = await list_tax_definitions(db, include_inactive=include_inactive)
    return [TaxDefinitionRead.model_validate(r) for r in rows]


@router.post("/tax-definitions", response_model=TaxDefinitionRead, status_code=status.HTTP_201_CREATED)
async def create_tax_definition_endpoint(
    body: TaxDefinitionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "create"),
) -> TaxDefinitionRead:
    row = await create_tax_definition(db, data=body.model_dump(exclude_none=True))
    read = TaxDefinitionRead.model_validate(row)
    await audit_service.log(
        session=db,
        action="tax_definition.created",
        resource_type="tax_definition",
        resource_id=str(row.id),
        new_value=read.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return read


@router.get("/tax-definitions/{tax_id}", response_model=TaxDefinitionRead)
async def get_tax_definition_endpoint(
    tax_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> TaxDefinitionRead:
    row = await get_tax_definition_row(db, tax_id)
    return TaxDefinitionRead.model_validate(row)


@router.patch("/tax-definitions/{tax_id}", response_model=TaxDefinitionRead)
async def update_tax_definition_endpoint(
    tax_id: int,
    body: TaxDefinitionUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> TaxDefinitionRead:
    row = await update_tax_definition(db, tax_id=tax_id, data=body.model_dump(exclude_unset=True))
    read = TaxDefinitionRead.model_validate(row)
    await audit_service.log(
        session=db,
        action="tax_definition.updated",
        resource_type="tax_definition",
        resource_id=str(row.id),
        new_value=read.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return read


@router.delete("/tax-definitions/{tax_id}", response_model=TaxDefinitionRead)
async def archive_tax_definition_endpoint(
    tax_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> TaxDefinitionRead:
    row = await archive_tax_definition(db, tax_id=tax_id)
    read = TaxDefinitionRead.model_validate(row)
    await audit_service.log(
        session=db,
        action="tax_definition.archived",
        resource_type="tax_definition",
        resource_id=str(row.id),
        new_value=read.model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return read


@router.get(
    "/product-variants/search",
    response_model=list[ProductVariantPurchasingSearchItem],
)
async def search_product_variants_endpoint(
    q: str | None = None,
    product_id: int | None = None,
    attribute_value_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_any_permission(
        ("catalog", "read"),
        ("purchase_orders", "read"),
        ("inventory", "read"),
        ("inventory", "update"),
    ),
) -> list[ProductVariantPurchasingSearchItem]:
    """Search stock-keeping variants for purchasing line pickers (display name = product)."""
    return await search_product_variants_for_purchasing(
        db,
        q=q,
        limit=limit,
        offset=offset,
        attribute_value_id=attribute_value_id,
        product_id=product_id,
    )


# Products
@router.post("/products", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
async def create_product_endpoint(
    body: ProductCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "create"),
) -> ProductRead:
    """Create a product. Variant axes are configured through global attributes."""
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


@router.get("/products", response_model=ProductListResponse)
async def list_products_endpoint(
    q: str | None = None,
    category_id: int | None = None,
    category_include_descendants: bool = False,
    status: str | None = None,
    branch_id: int | None = None,
    in_stock_only: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> ProductListResponse:
    if in_stock_only and branch_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="branch_id is required when in_stock_only is true",
        )
    total = await count_products(
        db,
        q=q,
        category_id=category_id,
        category_include_descendants=category_include_descendants,
        status=status,
        branch_id=branch_id,
        in_stock_only=in_stock_only,
    )
    rows = await list_products(
        db,
        q=q,
        category_id=category_id,
        category_include_descendants=category_include_descendants,
        status=status,
        branch_id=branch_id,
        in_stock_only=in_stock_only,
        limit=limit,
        offset=offset,
    )
    reads = await products_to_reads(db, rows)
    return ProductListResponse(items=reads, total=total, limit=limit, offset=offset)


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
    """Update a product. Category-bound product attributes are not accepted."""
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


@router.post(
    "/products/{product_id}/variants/preview-generate",
    response_model=VariantPreviewResponse,
)
async def preview_generate_variants_endpoint(
    product_id: int,
    body: VariantPreviewRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> VariantPreviewResponse:
    return await preview_generate_variants(db, product_id=product_id, body=body)


@router.post(
    "/products/{product_id}/variants/sync",
    response_model=VariantSyncResponse,
)
async def sync_product_variants_endpoint(
    product_id: int,
    body: VariantSyncRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> VariantSyncResponse:
    result = await sync_product_variant_configuration(db, product_id=product_id, body=body)
    await audit_service.log(
        session=db,
        action="product.variants_synced",
        resource_type="product",
        resource_id=str(product_id),
        user_id=current_user.id,
        request=request,
        details={
            "created": result.created,
            "updated": result.updated,
            "deactivated": result.deactivated,
        },
    )
    await db.commit()
    return result


# Epic 18.10: Variant-aware product detail
@router.get("/products/{product_id}/with-variants", response_model=ProductWithVariantsRead)
async def get_product_with_variants_endpoint(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_any_permission(
        ("catalog", "read"),
        ("inventory", "read"),
        ("inventory", "update"),
    ),
) -> ProductWithVariantsRead:
    """Get product template with saved axes, variants, stock, and costs."""
    return await get_product_with_variants(db, product_id)


@router.get("/products/{product_id}/variants/barcode-export")
async def export_variant_barcodes_endpoint(
    product_id: int,
    active_only: bool = Query(default=True),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> Response:
    csv_text = await export_variant_barcodes_csv(
        db, product_id=product_id, active_only=active_only
    )
    return Response(
        content=csv_text.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="product_{product_id}_barcodes.csv"'
        },
    )


@router.post("/products/{product_id}/variants/generate-barcodes")
async def generate_variant_barcodes_endpoint(
    product_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> dict[str, int]:
    assigned = await generate_missing_variant_barcodes(db, product_id=product_id)
    await audit_service.log(
        session=db,
        action="product.variant_barcodes_generated",
        resource_type="product",
        resource_id=str(product_id),
        user_id=current_user.id,
        request=request,
        details={"assigned": assigned},
    )
    await db.commit()
    return {"assigned": assigned}

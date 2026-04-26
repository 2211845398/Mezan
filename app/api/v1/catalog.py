"""Catalog API (Epic 2): categories, dynamic attributes, products, barcodes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.db.database import get_db
from app.models.users import User
from app.schemas.catalog import (
    CategoryAttributeDefCreate,
    CategoryAttributeDefRead,
    CategoryAttributeDefUpdate,
    CategoryCreate,
    CategoryRead,
    CategoryTreeNode,
    CategoryUpdate,
    ProductCreate,
    ProductRead,
    ProductUpdate,
)
from app.services import audit_service
from app.services.catalog_service import (
    archive_product,
    build_category_tree_nodes,
    create_category,
    create_category_attribute_def,
    create_product,
    delete_category,
    delete_category_attribute_def,
    generate_product_barcode,
    get_category,
    get_product,
    list_all_categories,
    list_categories,
    list_category_attribute_defs,
    list_products,
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
    cats = await list_all_categories(db)
    return build_category_tree_nodes(cats)


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
    response_model=list[CategoryAttributeDefRead],
)
async def list_category_attributes_endpoint(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[CategoryAttributeDefRead]:
    rows = await list_category_attribute_defs(db, category_id=category_id)
    return [CategoryAttributeDefRead.model_validate(r) for r in rows]


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
    product = await create_product(db, data=body.model_dump())
    await audit_service.log(
        session=db,
        action="product.created",
        resource_type="product",
        resource_id=str(product.id),
        new_value=ProductRead.model_validate(product).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ProductRead.model_validate(product)


@router.get("/products", response_model=list[ProductRead])
async def list_products_endpoint(
    q: str | None = None,
    category_id: int | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> list[ProductRead]:
    rows = await list_products(
        db, q=q, category_id=category_id, status=status, limit=limit, offset=offset
    )
    return [ProductRead.model_validate(r) for r in rows]


@router.get("/products/{product_id}", response_model=ProductRead)
async def get_product_endpoint(
    product_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(get_current_user),
    __: None = require_permission("catalog", "read"),
) -> ProductRead:
    product = await get_product(db, product_id)
    return ProductRead.model_validate(product)


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
    await audit_service.log(
        session=db,
        action="product.updated",
        resource_type="product",
        resource_id=str(product.id),
        new_value=ProductRead.model_validate(product).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ProductRead.model_validate(product)


@router.post("/products/{product_id}/archive", response_model=ProductRead)
async def archive_product_endpoint(
    product_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> ProductRead:
    product = await archive_product(db, product_id=product_id)
    await audit_service.log(
        session=db,
        action="product.archived",
        resource_type="product",
        resource_id=str(product.id),
        new_value=ProductRead.model_validate(product).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ProductRead.model_validate(product)


@router.post("/products/{product_id}/unarchive", response_model=ProductRead)
async def unarchive_product_endpoint(
    product_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> ProductRead:
    product = await unarchive_product(db, product_id=product_id)
    await audit_service.log(
        session=db,
        action="product.unarchived",
        resource_type="product",
        resource_id=str(product.id),
        new_value=ProductRead.model_validate(product).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ProductRead.model_validate(product)


@router.post("/products/{product_id}/barcode", response_model=ProductRead)
async def generate_barcode_endpoint(
    product_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _: None = require_permission("catalog", "update"),
) -> ProductRead:
    product = await generate_product_barcode(db, product_id=product_id)
    await audit_service.log(
        session=db,
        action="product.barcode_generated",
        resource_type="product",
        resource_id=str(product.id),
        new_value=ProductRead.model_validate(product).model_dump(),
        user_id=current_user.id,
        request=request,
    )
    await db.commit()
    return ProductRead.model_validate(product)

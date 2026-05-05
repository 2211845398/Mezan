"""Regression: category tree must not touch ORM ``children`` (async MissingGreenlet)."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.services.catalog_service import build_category_tree_nodes


def test_build_category_tree_nodes_nested_without_db() -> None:
    """Pure in-memory categories: builder must not assign to mapped ``children``."""
    now = datetime.now(UTC)
    root = Category(
        id=901,
        parent_id=None,
        name="Root",
        slug="root-901",
        sort_order=0,
        is_active=True,
        image_url=None,
        created_at=now,
        updated_at=now,
    )
    child = Category(
        id=902,
        parent_id=901,
        name="Child",
        slug="child-902",
        sort_order=1,
        is_active=True,
        image_url=None,
        created_at=now,
        updated_at=now,
    )
    nodes = build_category_tree_nodes([child, root])
    assert len(nodes) == 1
    assert nodes[0].id == 901
    assert len(nodes[0].children) == 1
    assert nodes[0].children[0].id == 902
    assert nodes[0].children[0].parent_id == 901


@pytest.mark.asyncio
async def test_category_tree_returns_nested_structure(
    client: AsyncClient,
    admin_auth_header: dict[str, str],
    db_session: AsyncSession,
) -> None:
    suffix = uuid4().hex[:12]
    now = datetime.now(UTC)
    parent = Category(
        parent_id=None,
        name=f"TreeRoot_{suffix}",
        slug=f"tree-root-{suffix}",
        sort_order=0,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(parent)
    await db_session.flush()
    child = Category(
        parent_id=parent.id,
        name=f"TreeChild_{suffix}",
        slug=f"tree-child-{suffix}",
        sort_order=1,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    db_session.add(child)
    await db_session.commit()

    response = await client.get("/api/v1/categories/tree", headers=admin_auth_header)

    assert response.status_code == 200, response.text
    data = response.json()
    assert isinstance(data, list)
    root = next((x for x in data if x["slug"] == f"tree-root-{suffix}"), None)
    assert root is not None
    child_slugs = {c["slug"] for c in root["children"]}
    assert f"tree-child-{suffix}" in child_slugs
    match = next(c for c in root["children"] if c["slug"] == f"tree-child-{suffix}")
    assert match["parent_id"] == parent.id

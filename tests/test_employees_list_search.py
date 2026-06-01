"""GET /employees?q= full-text filter across profile and user fields."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.employee_profile import EmployeeProfile
from app.models.users import User
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import hash_password

_UNIQUE = "zzempsearch99"


@pytest.mark.anyio
async def test_list_employees_search_by_email_and_document_number(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_auth_header: dict[str, str],
) -> None:
    await seed_permissions_and_roles(db_session)

    br_res = await db_session.execute(select(Branch).where(Branch.code == "ST1"))
    store = br_res.scalar_one_or_none()
    if store is None:
        store = Branch(name="Store A", code="ST1", address=None, timezone="UTC", is_active=True)
        db_session.add(store)
        await db_session.flush()

    email = f"{_UNIQUE}@test.example"
    doc_number = f"DOC-{_UNIQUE}"

    u = User(
        email=email,
        first_name="Search",
        father_name="Test",
        family_name=_UNIQUE,
        password_hash=hash_password("pw"),
        status="active",
        branch_id=store.id,
    )
    db_session.add(u)
    await db_session.flush()

    ep = EmployeeProfile(
        user_id=u.id,
        hire_date=date(2025, 6, 1),
        base_salary=Decimal("4500.00"),
        hourly_rate=Decimal("25.00"),
        identity_document_type="national_id",
        identity_document_number=doc_number,
    )
    db_session.add(ep)
    await db_session.commit()

    by_email = await client.get(
        "/api/v1/employees",
        params={"q": _UNIQUE, "limit": 50, "offset": 0},
        headers=admin_auth_header,
    )
    assert by_email.status_code == 200, by_email.text
    payload = by_email.json()
    assert payload["total"] >= 1
    ids = {item["id"] for item in payload["items"]}
    assert ep.id in ids
    match = next(i for i in payload["items"] if i["id"] == ep.id)
    assert match["user_email"] == email

    by_doc = await client.get(
        "/api/v1/employees",
        params={"q": doc_number, "limit": 50, "offset": 0},
        headers=admin_auth_header,
    )
    assert by_doc.status_code == 200, by_doc.text
    assert ep.id in {item["id"] for item in by_doc.json()["items"]}

    no_match = await client.get(
        "/api/v1/employees",
        params={"q": f"nomatch-{_UNIQUE}-xyz", "limit": 50, "offset": 0},
        headers=admin_auth_header,
    )
    assert no_match.status_code == 200, no_match.text
    assert ep.id not in {item["id"] for item in no_match.json()["items"]}

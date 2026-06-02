"""User-scoped notification routine schedules."""

import pytest
from sqlalchemy import select

from app.models.notifications import NotificationSchedule
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.users import User
from app.services.seed_service import seed_permissions_and_roles
from app.utils.security import hash_password


@pytest.mark.anyio
async def test_cashier_private_routine_only_visible_to_owner(client, db_session):
    await seed_permissions_and_roles(db_session)

    res_r = await db_session.execute(select(Role).where(Role.code == "CASHIER"))
    cashier_role = res_r.scalar_one()

    cashier_a = User(
        email="cashier_a_owner@test.local",
        password_hash=hash_password("password123"),
        status="active",
        first_name="A",
        family_name="Cashier",
    )
    cashier_b = User(
        email="cashier_b_owner@test.local",
        password_hash=hash_password("password123"),
        status="active",
        first_name="B",
        family_name="Cashier",
    )
    db_session.add_all([cashier_a, cashier_b])
    await db_session.flush()
    db_session.add_all(
        [
            UserRole(user_id=cashier_a.id, role_id=cashier_role.id, branch_id=None),
            UserRole(user_id=cashier_b.id, role_id=cashier_role.id, branch_id=None),
        ]
    )
    await db_session.commit()

    login_a = await client.post(
        "/api/v1/auth/login",
        json={"email": cashier_a.email, "password": "password123"},
    )
    assert login_a.status_code == 200
    header_a = {"Authorization": f"Bearer {login_a.json()['access_token']}"}

    upsert = await client.put(
        "/api/v1/admin/notifications/schedules",
        headers=header_a,
        json={
            "name": "cashier-a-reminder",
            "kind": "manual_broadcast",
            "interval_minutes": 1440,
            "target_role_code": None,
            "branch_id": None,
            "parameters": {
                "title": "My reminder",
                "body": "Check drawer",
                "target_user_ids": [cashier_a.id],
            },
            "is_active": True,
        },
    )
    assert upsert.status_code == 200
    assert upsert.json()["owner_user_id"] == cashier_a.id

    list_a = await client.get("/api/v1/admin/notifications/schedules", headers=header_a)
    assert list_a.status_code == 200
    names_a = {row["name"] for row in list_a.json()["items"]}
    assert "cashier-a-reminder" in names_a

    login_b = await client.post(
        "/api/v1/auth/login",
        json={"email": cashier_b.email, "password": "password123"},
    )
    assert login_b.status_code == 200
    header_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

    list_b = await client.get("/api/v1/admin/notifications/schedules", headers=header_b)
    assert list_b.status_code == 200
    names_b = {row["name"] for row in list_b.json()["items"]}
    assert "cashier-a-reminder" not in names_b

    deny_scope = await client.put(
        "/api/v1/admin/notifications/schedules",
        headers=header_a,
        json={
            "name": "cashier-a-bad-scope",
            "kind": "manual_broadcast",
            "interval_minutes": 1440,
            "target_role_code": "CASHIER",
            "branch_id": None,
            "parameters": {"title": "X", "body": "Y"},
            "is_active": True,
        },
    )
    assert deny_scope.status_code == 403

    res = await db_session.execute(
        select(NotificationSchedule).where(NotificationSchedule.name == "cashier-a-reminder")
    )
    row = res.scalar_one()
    assert row.owner_user_id == cashier_a.id

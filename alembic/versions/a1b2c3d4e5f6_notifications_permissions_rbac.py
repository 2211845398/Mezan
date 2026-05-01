"""notifications RBAC permissions

Revision ID: a1b2c3d4e5f6
Revises: f9a8b7c6d5e4
Create Date: 2026-05-01

Adds ``notifications:read`` / ``notifications:update`` and grants read to every
role, update to OWNER / ADMIN / IT_ADMIN (aligned with seed defaults).
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f9a8b7c6d5e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO permissions (resource, action)
            SELECT 'notifications', 'read'
            WHERE NOT EXISTS (
                SELECT 1 FROM permissions p
                WHERE p.resource = 'notifications' AND p.action = 'read'
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO permissions (resource, action)
            SELECT 'notifications', 'update'
            WHERE NOT EXISTS (
                SELECT 1 FROM permissions p
                WHERE p.resource = 'notifications' AND p.action = 'update'
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM roles r
            CROSS JOIN permissions p
            WHERE p.resource = 'notifications' AND p.action = 'read'
              AND NOT EXISTS (
                  SELECT 1 FROM role_permissions rp
                  WHERE rp.role_id = r.id AND rp.permission_id = p.id
              )
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO role_permissions (role_id, permission_id)
            SELECT r.id, p.id
            FROM roles r
            CROSS JOIN permissions p
            WHERE p.resource = 'notifications' AND p.action = 'update'
              AND r.code IN ('OWNER', 'ADMIN', 'IT_ADMIN')
              AND NOT EXISTS (
                  SELECT 1 FROM role_permissions rp
                  WHERE rp.role_id = r.id AND rp.permission_id = p.id
              )
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM role_permissions
            WHERE permission_id IN (
                SELECT id FROM permissions WHERE resource = 'notifications'
            )
            """
        )
    )
    op.execute(sa.text("DELETE FROM permissions WHERE resource = 'notifications'"))

"""notifications RBAC permissions

Revision ID: d7e8f9a0b1c2
Revises: b1c2d3e4f5a7
Create Date: 2026-05-01

Adds ``notifications:read`` / ``notifications:update`` and grants read to every
role, update to OWNER / ADMIN / IT_ADMIN (aligned with seed defaults).

Runs after ``users.avatar_url`` so the graph stays linear from ``f9a8b7c6d5e4``.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: str | None = "b1c2d3e4f5a7"
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

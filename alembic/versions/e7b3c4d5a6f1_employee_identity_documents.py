"""Add identity document fields to employee profiles and user onboardings.

Revision ID: e7b3c4d5a6f1
Revises: d4f8a1c2e3b0
Create Date: 2026-05-17

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7b3c4d5a6f1"
down_revision: Union[str, None] = "d4f8a1c2e3b0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "employee_profiles",
        sa.Column("identity_document_type", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "employee_profiles",
        sa.Column("identity_document_number", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "employee_profiles",
        sa.Column("identity_document_image_url", sa.String(length=2048), nullable=True),
    )
    op.add_column(
        "user_onboardings",
        sa.Column("identity_document_type", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "user_onboardings",
        sa.Column("identity_document_number", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "user_onboardings",
        sa.Column("identity_document_image_url", sa.String(length=2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_onboardings", "identity_document_image_url")
    op.drop_column("user_onboardings", "identity_document_number")
    op.drop_column("user_onboardings", "identity_document_type")
    op.drop_column("employee_profiles", "identity_document_image_url")
    op.drop_column("employee_profiles", "identity_document_number")
    op.drop_column("employee_profiles", "identity_document_type")

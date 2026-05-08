"""category_attribute_defs inherited_from_category_id

Revision ID: d4f8a1c2b3e4
Revises: c60be564e2ae
Create Date: 2026-05-08

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4f8a1c2b3e4"
down_revision: Union[str, None] = "c60be564e2ae"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "category_attribute_defs",
        sa.Column("inherited_from_category_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_category_attribute_defs_inherited_from_category_id_categories"),
        "category_attribute_defs",
        "categories",
        ["inherited_from_category_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_category_attribute_defs_inherited_from_category_id"),
        "category_attribute_defs",
        ["inherited_from_category_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_category_attribute_defs_inherited_from_category_id"),
        table_name="category_attribute_defs",
    )
    op.drop_constraint(
        op.f("fk_category_attribute_defs_inherited_from_category_id_categories"),
        "category_attribute_defs",
        type_="foreignkey",
    )
    op.drop_column("category_attribute_defs", "inherited_from_category_id")

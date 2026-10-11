"""add auction category

Revision ID: b7d9e2a4c6f1
Revises: a1b2c3d4e5f6
Create Date: 2026-10-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b7d9e2a4c6f1"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


category_enum = postgresql.ENUM(
    "ELECTRONICS",
    "FASHION",
    "VEHICLES",
    "COLLECTIBLES",
    "FURNITURE",
    "ART",
    "OTHER",
    name="auctioncategory",
)


def upgrade() -> None:
    category_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "auctions",
        sa.Column("category", category_enum, nullable=False, server_default="OTHER"),
    )
    op.alter_column("auctions", "category", server_default=None)
    op.create_index("ix_auctions_category", "auctions", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_auctions_category", table_name="auctions")
    op.drop_column("auctions", "category")
    category_enum.drop(op.get_bind(), checkfirst=True)

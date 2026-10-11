"""add auction winner fields

Revision ID: 4f21c76a9b30
Revises: 7d8a1d9a113d
Create Date: 2026-10-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4f21c76a9b30"
down_revision: Union[str, Sequence[str], None] = "7d8a1d9a113d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("auctions", sa.Column("winner_id", sa.UUID(), nullable=True))
    op.add_column(
        "auctions",
        sa.Column("final_price", sa.Numeric(precision=12, scale=2), nullable=True),
    )
    op.create_index(op.f("ix_auctions_winner_id"), "auctions", ["winner_id"], unique=False)
    op.create_foreign_key(
        "fk_auctions_winner_id_users",
        "auctions",
        "users",
        ["winner_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_auctions_winner_id_users", "auctions", type_="foreignkey")
    op.drop_index(op.f("ix_auctions_winner_id"), table_name="auctions")
    op.drop_column("auctions", "final_price")
    op.drop_column("auctions", "winner_id")

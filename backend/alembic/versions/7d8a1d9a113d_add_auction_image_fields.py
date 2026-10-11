"""add auction image fields

Revision ID: 7d8a1d9a113d
Revises: d0c80985bb06
Create Date: 2026-10-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7d8a1d9a113d"
down_revision: Union[str, Sequence[str], None] = "d0c80985bb06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("auctions", sa.Column("image_url", sa.String(length=500), nullable=True))
    op.add_column("auctions", sa.Column("image_public_id", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("auctions", "image_public_id")
    op.drop_column("auctions", "image_url")

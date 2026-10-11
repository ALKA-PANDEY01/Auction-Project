"""add payment method for mock checkout and COD

Revision ID: e4a1f6b9c2d3
Revises: c3f8a2d19e40
Create Date: 2026-10-09
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e4a1f6b9c2d3"
down_revision: Union[str, Sequence[str], None] = "c3f8a2d19e40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

payment_method = postgresql.ENUM(
    "MOCK_ONLINE", "CASH_ON_DELIVERY", name="paymentmethod", create_type=False
)


def upgrade() -> None:
    payment_method.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "payments",
        sa.Column(
            "method",
            payment_method,
            nullable=False,
            server_default="MOCK_ONLINE",
        ),
    )
    op.alter_column("payments", "method", server_default=None)


def downgrade() -> None:
    op.drop_column("payments", "method")
    payment_method.drop(op.get_bind(), checkfirst=True)

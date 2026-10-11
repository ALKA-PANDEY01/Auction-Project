"""add payments and orders

Revision ID: c3f8a2d19e40
Revises: b7d9e2a4c6f1
Create Date: 2026-10-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c3f8a2d19e40"
down_revision: Union[str, Sequence[str], None] = "b7d9e2a4c6f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


payment_status = postgresql.ENUM(
    "PENDING", "SUCCESS", "FAILED", "REFUNDED",
    name="paymentstatus", create_type=False,
)


def upgrade() -> None:
    payment_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("auction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("buyer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("gateway_order_id", sa.String(100), nullable=False),
        sa.Column("gateway_payment_id", sa.String(100), nullable=True),
        sa.Column("status", payment_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["auction_id"], ["auctions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["buyer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("gateway_order_id"),
        sa.UniqueConstraint("gateway_payment_id"),
    )
    op.create_index("ix_payments_auction_id", "payments", ["auction_id"])
    op.create_index("ix_payments_buyer_id", "payments", ["buyer_id"])
    op.create_index("ix_payments_status", "payments", ["status"])
    op.create_table(
        "orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("auction_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("buyer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["auction_id"], ["auctions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["buyer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("payment_id"),
        sa.UniqueConstraint("auction_id"),
    )
    op.create_index("ix_orders_auction_id", "orders", ["auction_id"])
    op.create_index("ix_orders_buyer_id", "orders", ["buyer_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_buyer_id", table_name="orders")
    op.drop_index("ix_orders_auction_id", table_name="orders")
    op.drop_table("orders")
    op.drop_index("ix_payments_status", table_name="payments")
    op.drop_index("ix_payments_buyer_id", table_name="payments")
    op.drop_index("ix_payments_auction_id", table_name="payments")
    op.drop_table("payments")
    payment_status.drop(op.get_bind(), checkfirst=True)

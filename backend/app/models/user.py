from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.auction import Auction
    from app.models.bid import Bid
    from app.models.watchlist import Watchlist
    from app.models.notification import Notification


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        index=True,
        nullable=False,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    auctions: Mapped[list["Auction"]] = relationship(
        back_populates="seller",
        foreign_keys="Auction.seller_id",
    )

    bids: Mapped[list["Bid"]] = relationship(
        back_populates="bidder",
    )

    watchlist_items: Mapped[list["Watchlist"]] = relationship(
        back_populates="user",
    )

    notifications: Mapped[list["Notification"]] = relationship(
        back_populates="user",
        passive_deletes=True,
    )

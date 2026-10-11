from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.bid import Bid
    from app.models.user import User
    from app.models.watchlist import Watchlist

class AuctionStatus(str, Enum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    ENDED = "ended"
    CANCELLED = "cancelled"


class AuctionCategory(str, Enum):
    ELECTRONICS = "electronics"
    FASHION = "fashion"
    VEHICLES = "vehicles"
    COLLECTIBLES = "collectibles"
    FURNITURE = "furniture"
    ART = "art"
    OTHER = "other"


class Auction(Base):
    __tablename__ = "auctions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    seller_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    winner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        default=None,
    )

    image_public_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        default=None,
    )

    starting_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    current_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    category: Mapped[AuctionCategory] = mapped_column(
        SQLEnum(AuctionCategory, name="auctioncategory"),
        default=AuctionCategory.OTHER,
        nullable=False,
        index=True,
    )

    final_price: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    minimum_increment: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
    )

    start_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    end_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    status: Mapped[AuctionStatus] = mapped_column(
        SQLEnum(AuctionStatus),
        default=AuctionStatus.SCHEDULED,
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    seller: Mapped["User"] = relationship(
        back_populates="auctions",
        foreign_keys=[seller_id],
    )

    winner: Mapped["User | None"] = relationship(
        foreign_keys=[winner_id],
    )

    bids: Mapped[list["Bid"]] = relationship(
        back_populates="auction",
    )

    watchlist_items: Mapped[list["Watchlist"]] = relationship(
        back_populates="auction",
    )

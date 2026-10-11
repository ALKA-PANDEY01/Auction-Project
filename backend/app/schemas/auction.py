import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.auction import AuctionCategory, AuctionStatus


class AuctionCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = None
    image_url: str | None = None
    category: AuctionCategory = AuctionCategory.OTHER

    starting_price: Decimal = Field(gt=0)
    minimum_increment: Decimal = Field(gt=0)

    start_time: datetime
    end_time: datetime


class AuctionUpdate(BaseModel):
    title: str | None = Field(
        default=None,
        min_length=3,
        max_length=200,
    )

    description: str | None = None
    image_url: str | None = None
    category: AuctionCategory | None = None

    start_time: datetime | None = None
    end_time: datetime | None = None


class AuctionResponse(BaseModel):
    id: uuid.UUID
    seller_id: uuid.UUID

    title: str
    category: AuctionCategory
    description: str | None
    image_url: str | None = None
    image_public_id: str | None = None

    starting_price: Decimal
    current_price: Decimal
    minimum_increment: Decimal

    start_time: datetime
    end_time: datetime
    status: AuctionStatus

    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AuctionResultResponse(BaseModel):
    auction_id: uuid.UUID
    status: AuctionStatus
    winner_id: uuid.UUID | None
    winner_name: str | None
    winning_bid: Decimal | None

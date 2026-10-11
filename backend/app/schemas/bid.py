from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field
from app.models.auction import AuctionStatus


class BidCreate(BaseModel):
    amount: Decimal = Field(gt=0)


class BidResponse(BaseModel):
    id: UUID
    auction_id: UUID
    bidder_id: UUID
    bidder_name: str
    amount: Decimal
    created_at: datetime


class MyBidResponse(BidResponse):
    auction_title: str
    auction_status: AuctionStatus

from datetime import datetime, timezone

from app.models.auction import Auction, AuctionStatus


def as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_auction_status(auction: Auction, now: datetime | None = None) -> AuctionStatus:
    if auction.status in (AuctionStatus.ENDED, AuctionStatus.CANCELLED):
        return auction.status
    current_time = now or datetime.now(timezone.utc)
    if current_time < as_utc(auction.start_time):
        return AuctionStatus.SCHEDULED
    if current_time >= as_utc(auction.end_time):
        return AuctionStatus.ENDED
    return AuctionStatus.ACTIVE

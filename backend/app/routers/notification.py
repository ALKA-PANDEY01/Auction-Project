from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auction_time import get_auction_status
from app.models.auction import Auction, AuctionStatus
from app.models.notification import Notification
from app.models.user import User
from app.models.watchlist import Watchlist
from app.routers.auth import get_current_user
from app.schemas.notification import NotificationResponse


router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=list[NotificationResponse])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Recover start alerts for watched auctions that became live before the
    # worker delivered an event (for example, while this feature was offline).
    watched_auctions = await db.scalars(
        select(Auction)
        .join(Watchlist, Watchlist.auction_id == Auction.id)
        .where(Watchlist.user_id == current_user.id)
    )
    for auction in watched_auctions.all():
        if get_auction_status(auction) == AuctionStatus.ACTIVE:
            await db.execute(
                insert(Notification)
                .values(
                    user_id=current_user.id,
                    auction_id=auction.id,
                    event_type="wishlist_auction_started",
                    title="A wishlisted auction is live",
                    message=f"{auction.title} has started. You can place your bid now.",
                )
                .on_conflict_do_nothing(constraint="uq_notification_user_auction_event")
            )
    await db.commit()

    result = await db.scalars(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return result.all()


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notification = await db.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    notification.is_read = True
    await db.commit()
    await db.refresh(notification)
    return notification

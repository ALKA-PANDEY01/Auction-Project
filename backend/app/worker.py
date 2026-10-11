import os
import uuid
import json
from datetime import datetime, timezone

from arq.connections import RedisSettings
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from app.core.database import AsyncSessionLocal
from app.core.notification_events import add_auction_winner_notification, publish_notification
from app.models.auction import Auction, AuctionStatus
from app.models.bid import Bid
from app.models.notification import Notification
from app.models.watchlist import Watchlist



def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)

async def activate_auction(ctx, auction_id: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Auction)
            .where(Auction.id == uuid.UUID(auction_id))
            .with_for_update()
        )

        auction = result.scalar_one_or_none()

        if auction is None:
            print(f"Auction {auction_id} not found.")
            return

        if auction.status != AuctionStatus.SCHEDULED:
            return

        now = datetime.now(timezone.utc)
        start_time = _as_utc(auction.start_time)
        end_time = _as_utc(auction.end_time)

        if now < start_time:
            await ctx["redis"].enqueue_job(
                "activate_auction",
                auction_id,
                _defer_until=start_time,
            )
            return

        if now >= end_time:
            auction.status = AuctionStatus.ENDED
        else:
            auction.status = AuctionStatus.ACTIVE

        notifications = []
        if auction.status == AuctionStatus.ACTIVE:
            watcher_ids = await db.scalars(
                select(Watchlist.user_id).where(Watchlist.auction_id == auction.id)
            )
            for watcher_id in watcher_ids.all():
                created_notification = await db.scalar(
                    insert(Notification)
                    .values(
                        user_id=watcher_id,
                        auction_id=auction.id,
                        event_type="wishlist_auction_started",
                        title="A wishlisted auction is live",
                        message=f"{auction.title} has started. You can place your bid now.",
                    )
                    .on_conflict_do_nothing(constraint="uq_notification_user_auction_event")
                    .returning(Notification)
                )
                if created_notification is not None:
                    notifications.append(created_notification)

        await db.commit()

        for notification in notifications:
            event = {
                "event": "notification_created",
                "notification": {
                    "id": str(notification.id),
                    "auction_id": str(notification.auction_id),
                    "event_type": notification.event_type,
                    "title": notification.title,
                    "message": notification.message,
                    "is_read": notification.is_read,
                    "created_at": notification.created_at.isoformat(),
                },
            }
            try:
                await ctx["redis"].publish(
                    f"user:{notification.user_id}:notifications",
                    json.dumps(event),
                )
            except RedisError:
                # Persisted notifications are fetched when the user next opens the app.
                pass

        print(
            f"Auction {auction_id} -> {auction.status}"
        )


async def end_auction(ctx, auction_id: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Auction).where(Auction.id == uuid.UUID(auction_id))
        )

        auction = result.scalar_one_or_none()

        if auction is None:
            print(f"Auction {auction_id} not found.")
            return

        if auction.status in (AuctionStatus.ENDED, AuctionStatus.CANCELLED):
            return

        now = datetime.now(timezone.utc)
        end_time = _as_utc(auction.end_time)

        if now < end_time:
            await ctx["redis"].enqueue_job(
                "end_auction",
                auction_id,
                _defer_until=end_time,
            )
            return

        highest_bid_result = await db.execute(
            select(Bid)
            .where(Bid.auction_id == auction.id)
            .order_by(Bid.amount.desc(), Bid.created_at.asc(), Bid.id.asc())
            .limit(1)
        )
        winning_bid = highest_bid_result.scalar_one_or_none()

        winner_notification = None
        if winning_bid is not None:
            auction.winner_id = winning_bid.bidder_id
            auction.final_price = winning_bid.amount
            winner_notification = await add_auction_winner_notification(
                db, auction.id, winning_bid.bidder_id, auction.title, winning_bid.amount
            )

        auction.status = AuctionStatus.ENDED

        await db.commit()
        await publish_notification(ctx["redis"], winner_notification)

        print(f"Auction {auction_id} -> ENDED")


class WorkerSettings:
    functions = [
        activate_auction,
        end_auction,
    ]
    redis_settings = RedisSettings(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=6379,
    )

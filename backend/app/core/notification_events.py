import json
import uuid
from decimal import Decimal

from redis.exceptions import RedisError
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification


async def add_auction_winner_notification(
    db: AsyncSession,
    auction_id: uuid.UUID,
    winner_id: uuid.UUID,
    auction_title: str,
    winning_bid: Decimal,
) -> Notification | None:
    return await db.scalar(
        insert(Notification)
        .values(
            user_id=winner_id,
            auction_id=auction_id,
            event_type="auction_won",
            title="You won this auction!",
            message=(
                f"Congratulations! You won {auction_title} with a bid of ₹{winning_bid}. "
                "Open the auction result to complete your order."
            ),
        )
        .on_conflict_do_nothing(constraint="uq_notification_user_auction_event")
        .returning(Notification)
    )


async def publish_notification(redis_client, notification: Notification | None) -> None:
    if notification is None:
        return
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
        await redis_client.publish(
            f"user:{notification.user_id}:notifications", json.dumps(event)
        )
    except RedisError:
        # The notification is persisted and will be returned by the notifications API.
        pass

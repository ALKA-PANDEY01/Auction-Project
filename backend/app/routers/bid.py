import json
from uuid import UUID


from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.auction_time import get_auction_status
from app.core.redis import redis
from app.models.auction import Auction, AuctionStatus
from app.models.bid import Bid
from app.models.notification import Notification
from app.models.user import User
from app.models.watchlist import Watchlist
from app.routers.auth import get_current_user
from app.schemas.bid import BidCreate, BidResponse, MyBidResponse
from redis.exceptions import RedisError

router = APIRouter(
    prefix="/auctions",
    tags=["Bids"],
)


@router.get("/my-bids", response_model=list[MyBidResponse])
async def get_my_bids(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Bid, Auction)
        .join(Auction, Auction.id == Bid.auction_id)
        .where(Bid.bidder_id == current_user.id)
        .order_by(Bid.created_at.desc(), Bid.id.desc())
    )
    return [
        {
            "id": bid.id,
            "auction_id": bid.auction_id,
            "bidder_id": bid.bidder_id,
            "bidder_name": current_user.name,
            "amount": bid.amount,
            "created_at": bid.created_at,
            "auction_title": auction.title,
            "auction_status": get_auction_status(auction),
        }
        for bid, auction in result.all()
    ]


@router.get(
    "/{auction_id}/bids",
    response_model=list[BidResponse],
)
async def get_bid_history(
    auction_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    auction = await db.get(Auction, auction_id)
    if auction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Auction not found",
        )

    result = await db.execute(
        select(Bid, User.name)
        .join(User, User.id == Bid.bidder_id)
        .where(Bid.auction_id == auction_id)
        .order_by(Bid.created_at.asc(), Bid.id.asc())
    )
    return [
        {
            "id": bid.id,
            "auction_id": bid.auction_id,
            "bidder_id": bid.bidder_id,
            "bidder_name": bidder_name,
            "amount": bid.amount,
            "created_at": bid.created_at,
        }
        for bid, bidder_name in result.all()
    ]


@router.post(
    "/{auction_id}/bids",
    response_model=BidResponse,
    status_code=status.HTTP_201_CREATED,
)
async def place_bid(
    auction_id: UUID,
    bid_data: BidCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Lock this auction until commit so concurrent bids are checked serially.
    result = await db.execute(
        select(Auction)
        .where(Auction.id == auction_id)
        .with_for_update()
    )

    auction = result.scalar_one_or_none()

    if auction is None:
        raise HTTPException(
            status_code=404,
            detail="Auction not found",
        )

    # Auction owners cannot bid on their own items.
    if auction.seller_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot bid on your own auction",
        )
    # Validate the time window directly so delayed workers cannot leave an expired auction open.
    current_status = get_auction_status(auction)
    if auction.status != current_status:
        auction.status = current_status
        await db.flush()
    if current_status != AuctionStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail="Bidding is allowed only on active auctions",
        )

    # 3. Find the current highest bid
    result = await db.execute(
        select(Bid)
        .where(Bid.auction_id == auction_id)
        .order_by(Bid.amount.desc())
        .limit(1)
    )

    highest_bid = result.scalar_one_or_none()

    # 4. Enforce the starting price on the first bid and the minimum
    # increment on every later bid.
    minimum_bid = (
        auction.starting_price
        if highest_bid is None
        else highest_bid.amount + auction.minimum_increment
    )
    if bid_data.amount < minimum_bid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bid must be at least {minimum_bid}",
        )

    # Notify users who were bidding or watching this lot before this bid.
    previous_bidder_ids = set((await db.scalars(
        select(Bid.bidder_id).where(Bid.auction_id == auction_id).distinct()
    )).all())
    watcher_ids = set((await db.scalars(
        select(Watchlist.user_id).where(Watchlist.auction_id == auction_id)
    )).all())

    # 5. Create the bid
    new_bid = Bid(
        auction_id=auction_id,
        bidder_id=current_user.id,
        amount=bid_data.amount,
    )

    db.add(new_bid)
    auction.current_price = bid_data.amount
    await db.flush()

    notifications = []
    recipient_ids = (previous_bidder_ids | watcher_ids) - {current_user.id}
    for recipient_id in recipient_ids:
        was_bidding = recipient_id in previous_bidder_ids
        notification = Notification(
            user_id=recipient_id,
            auction_id=auction.id,
            # Include this bid's ID so later outbids on the same auction can
            # create their own notification under the per-auction unique key.
            event_type=f"outbid_{new_bid.id.hex}",
            title=(
                "You've been outbid" if was_bidding
                else "A wishlist item was outbid" if highest_bid is not None
                else "A wishlist item has a new bid"
            ),
            message=(
                f"A higher bid of ₹{new_bid.amount} was placed on {auction.title}. "
                "Place another bid to take the lead."
                if was_bidding
                else f"{auction.title} on your wishlist just received a higher bid of ₹{new_bid.amount}."
            ),
        )
        db.add(notification)
        notifications.append(notification)

    await db.commit()
    await db.refresh(new_bid)

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
            await redis.publish(
                f"user:{notification.user_id}:notifications",
                json.dumps(event),
            )
        except RedisError:
            # The bid and notification are committed; users can fetch it later.
            pass

    event = {
        "event": "bid_placed",
        "auction_id": str(auction_id),
        "bid_id": str(new_bid.id),
        "bidder_name": current_user.name,
        "amount": str(new_bid.amount),
        "current_price": str(auction.current_price),
        "created_at": new_bid.created_at.isoformat(),
    }
    try:
        await redis.publish(
            f"auction:{auction_id}:bids",
            json.dumps(event),
        )
    except RedisError:
        # The bid is already committed; a Redis outage should not report it as rejected.
        pass

    return {
        "id": new_bid.id,
        "auction_id": new_bid.auction_id,
        "bidder_id": new_bid.bidder_id,
        "bidder_name": current_user.name,
        "amount": new_bid.amount,
        "created_at": new_bid.created_at,
    }

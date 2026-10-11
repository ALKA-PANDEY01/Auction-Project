import json
import uuid
from decimal import Decimal
from datetime import datetime


from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy import delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.arq import create_arq_pool
from app.core.auction_time import get_auction_status
from app.core.cloudinary import delete_image_from_cloudinary, upload_image_to_cloudinary
from app.core.database import get_db
from app.core.notification_events import add_auction_winner_notification, publish_notification
from app.core.redis import redis
from app.models.auction import Auction, AuctionCategory, AuctionStatus
from app.models.bid import Bid
from app.models.watchlist import Watchlist
from app.models.user import User
from app.models.payment import Payment, AuctionOrder
from app.routers.auth import get_current_user
from app.schemas.auction import (
    AuctionCreate,
    AuctionResultResponse,
    AuctionResponse,
    AuctionUpdate,
)
from redis.exceptions import RedisError


router = APIRouter(
    prefix="/auctions",
    tags=["Auctions"],
)


@router.post(
    "",
    response_model=AuctionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_auction(
    title: str = Form(...),
    category: AuctionCategory = Form(default=AuctionCategory.OTHER),
    description: str | None = Form(default=None),
    image_url: str | None = Form(default=None),
    starting_price: Decimal = Form(...),
    minimum_increment: Decimal = Form(...),
    start_time: datetime = Form(...),
    end_time: datetime = Form(...),
    image: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if end_time <= start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End time must be after start time",
        )

    uploaded_image_url = image_url
    uploaded_public_id = None

    if image is not None and image.filename:
        uploaded_image_url, uploaded_public_id = upload_image_to_cloudinary(image)

    auction = Auction(
        seller_id=current_user.id,
        title=title,
        category=category,
        description=description,
        image_url=uploaded_image_url,
        image_public_id=uploaded_public_id,
        starting_price=starting_price,
        current_price=starting_price,
        minimum_increment=minimum_increment,
        start_time=start_time,
        end_time=end_time,
        status=AuctionStatus.SCHEDULED,
    )

    db.add(auction)

    await db.commit()
    await db.refresh(auction)

    arq = await create_arq_pool()
    try:
        await arq.enqueue_job(
            "activate_auction",
            str(auction.id),
            _defer_until=auction.start_time,
        )
        await arq.enqueue_job(
            "end_auction",
            str(auction.id),
            _defer_until=auction.end_time,
        )
    finally:
        await arq.close()

    return auction

@router.get(
    "",
    response_model=list[AuctionResponse],
)
async def get_auctions(
    db: AsyncSession = Depends(get_db),
):
    result = await db.scalars(
        select(Auction)
        .order_by(Auction.created_at.desc())
    )

    auctions = result.all()
    changed = False
    for auction in auctions:
        current_status = get_auction_status(auction)
        if auction.status != current_status:
            auction.status = current_status
            changed = True
    if changed:
        await db.commit()
    return auctions

@router.get(
    "/mine",
    response_model=list[AuctionResponse],
)
async def get_my_auctions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.scalars(
        select(Auction)
        .where(Auction.seller_id == current_user.id)
        .order_by(Auction.created_at.desc())
    )
    auctions = result.all()
    changed = False
    for auction in auctions:
        current_status = get_auction_status(auction)
        if auction.status != current_status:
            auction.status = current_status
            changed = True
    if changed:
        await db.commit()
    return auctions


@router.get(
    "/{auction_id}",
    response_model=AuctionResponse,
)
async def get_auction(
    auction_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    auction = await db.get(Auction, auction_id)

    if not auction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Auction not found",
        )

    current_status = get_auction_status(auction)
    if auction.status != current_status:
        auction.status = current_status
        await db.commit()

    return auction


@router.get(
    "/{auction_id}/result",
    response_model=AuctionResultResponse,
)
async def get_auction_result(
    auction_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    auction = await db.get(Auction, auction_id)

    if auction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Auction not found",
        )

    current_status = get_auction_status(auction)
    if auction.status != current_status:
        auction.status = current_status
        await db.commit()

    if current_status != AuctionStatus.ENDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Auction result is available after the auction ends",
        )

    result = await db.execute(
        select(Bid, User.name)
        .join(User, User.id == Bid.bidder_id)
        .where(Bid.auction_id == auction.id)
        .order_by(Bid.amount.desc(), Bid.created_at.asc(), Bid.id.asc())
        .limit(1)
    )
    winning_result = result.first()
    winning_bid = winning_result[0] if winning_result else None
    winner_name = winning_result[1] if winning_result else None

    winner_notification = None
    if winning_bid is not None:
        auction.winner_id = winning_bid.bidder_id
        auction.final_price = winning_bid.amount
        winner_notification = await add_auction_winner_notification(
            db, auction.id, winning_bid.bidder_id, auction.title, winning_bid.amount
        )
        await db.commit()
        await publish_notification(redis, winner_notification)

    return AuctionResultResponse(
        auction_id=auction.id,
        status=auction.status,
        winner_id=winning_bid.bidder_id if winning_bid else None,
        winner_name=winner_name,
        winning_bid=winning_bid.amount if winning_bid else None,
    )


@router.post(
    "/{auction_id}/end",
    response_model=AuctionResultResponse,
)
async def end_auction_early(
    auction_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Auction)
        .where(Auction.id == auction_id)
        .with_for_update()
    )
    auction = result.scalar_one_or_none()

    if auction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Auction not found",
        )
    if auction.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the seller can end this auction",
        )

    current_status = get_auction_status(auction)
    if current_status != AuctionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only active auctions can be ended early",
        )

    winning_result = await db.execute(
        select(Bid, User.name)
        .join(User, User.id == Bid.bidder_id)
        .where(Bid.auction_id == auction.id)
        .order_by(Bid.amount.desc(), Bid.created_at.asc(), Bid.id.asc())
        .limit(1)
    )
    winner_row = winning_result.first()
    winning_bid = winner_row[0] if winner_row else None
    winner_name = winner_row[1] if winner_row else None

    auction.status = AuctionStatus.ENDED
    auction.winner_id = winning_bid.bidder_id if winning_bid else None
    auction.final_price = winning_bid.amount if winning_bid else None
    winner_notification = None
    if winning_bid is not None:
        winner_notification = await add_auction_winner_notification(
            db, auction.id, winning_bid.bidder_id, auction.title, winning_bid.amount
        )
    await db.commit()
    await publish_notification(redis, winner_notification)

    event = {
        "event": "auction_ended",
        "auction_id": str(auction.id),
        "winner_id": str(auction.winner_id) if auction.winner_id else None,
        "winner_name": winner_name,
        "winning_bid": str(auction.final_price) if auction.final_price is not None else None,
    }
    try:
        await redis.publish(f"auction:{auction_id}:bids", json.dumps(event))
    except RedisError:
        # The auction is committed; a Redis outage must not report the end as failed.
        pass

    return AuctionResultResponse(
        auction_id=auction.id,
        status=auction.status,
        winner_id=auction.winner_id,
        winner_name=winner_name,
        winning_bid=auction.final_price,
    )


@router.patch(
    "/{auction_id}",
    response_model=AuctionResponse,
)
async def update_auction(
    auction_id: uuid.UUID,
    title: str | None = Form(default=None),
    category: AuctionCategory | None = Form(default=None),
    description: str | None = Form(default=None),
    image_url: str | None = Form(default=None),
    start_time: datetime | None = Form(default=None),
    end_time: datetime | None = Form(default=None),
    image: UploadFile | None = File(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    auction = await db.get(Auction, auction_id)

    if not auction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Auction not found",
        )

    if auction.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to modify this auction",
        )

    if auction.status != AuctionStatus.SCHEDULED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only scheduled auctions can be modified",
        )

    if title is not None:
        auction.title = title

    if category is not None:
        auction.category = category

    if description is not None:
        auction.description = description

    if image_url is not None:
        if auction.image_public_id:
            delete_image_from_cloudinary(auction.image_public_id)
        auction.image_url = image_url
        auction.image_public_id = None

    if image is not None and image.filename:
        if auction.image_public_id:
            delete_image_from_cloudinary(auction.image_public_id)
        uploaded_image_url, uploaded_public_id = upload_image_to_cloudinary(image)
        auction.image_url = uploaded_image_url
        auction.image_public_id = uploaded_public_id

    if start_time is not None:
        auction.start_time = start_time

    if end_time is not None:
        auction.end_time = end_time

    if auction.end_time <= auction.start_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="End time must be after start time",
        )

    await db.commit()
    await db.refresh(auction)

    arq = await create_arq_pool()
    try:
        await arq.enqueue_job(
            "activate_auction",
            str(auction.id),
            _defer_until=auction.start_time,
        )
        await arq.enqueue_job(
            "end_auction",
            str(auction.id),
            _defer_until=auction.end_time,
        )
    finally:
        await arq.close()

    return auction

@router.delete(
    "/{auction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_auction(
    auction_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    auction = await db.get(Auction, auction_id)

    if not auction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Auction not found",
        )

    if auction.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to delete this auction",
        )

    if get_auction_status(auction) != AuctionStatus.ENDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only ended auctions can be deleted",
        )

    has_payment_history = await db.scalar(
        select(Payment.id).where(Payment.auction_id == auction.id).limit(1)
    )
    has_order = await db.scalar(
        select(AuctionOrder.id).where(AuctionOrder.auction_id == auction.id).limit(1)
    )
    if has_payment_history or has_order:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This auction has payment history and cannot be deleted",
        )

    if auction.image_public_id:
        delete_image_from_cloudinary(auction.image_public_id)

    # Remove dependent records explicitly because their foreign keys do not cascade.
    await db.execute(sql_delete(Bid).where(Bid.auction_id == auction.id))
    await db.execute(sql_delete(Watchlist).where(Watchlist.auction_id == auction.id))
    await db.delete(auction)
    await db.commit()

    return None

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auction_time import get_auction_status
from app.core.database import get_db
from app.models.auction import Auction
from app.models.user import User
from app.models.watchlist import Watchlist
from app.routers.auth import get_current_user
from app.schemas.auction import AuctionResponse


router = APIRouter(prefix="/watchlist", tags=["Wishlist"])


@router.get("", response_model=list[AuctionResponse])
async def get_watchlist(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.scalars(
        select(Auction)
        .join(Watchlist, Watchlist.auction_id == Auction.id)
        .where(Watchlist.user_id == current_user.id)
        .order_by(Watchlist.created_at.desc())
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


@router.post("/{auction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def add_to_watchlist(
    auction_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    auction = await db.get(Auction, auction_id)
    if auction is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Auction not found",
        )

    statement = insert(Watchlist).values(
        user_id=current_user.id,
        auction_id=auction_id,
    ).on_conflict_do_nothing(constraint="uq_user_auction_watchlist")
    await db.execute(statement)
    await db.commit()


@router.delete("/{auction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_watchlist(
    auction_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(Watchlist).where(
            Watchlist.user_id == current_user.id,
            Watchlist.auction_id == auction_id,
        )
    )
    await db.commit()

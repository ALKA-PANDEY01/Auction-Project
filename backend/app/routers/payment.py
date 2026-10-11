import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auction_time import get_auction_status
from app.core.database import get_db
from app.models.auction import Auction, AuctionStatus
from app.models.bid import Bid
from app.models.payment import AuctionOrder, Payment, PaymentMethod, PaymentStatus
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.payment import (
    CheckoutResponse,
    OrderResponse,
    PaymentStateResponse,
    VerifyPaymentRequest,
)


router = APIRouter(prefix="/payments", tags=["Payments"])


async def _winning_bid(db: AsyncSession, auction_id: uuid.UUID) -> Bid | None:
    return await db.scalar(
        select(Bid)
        .where(Bid.auction_id == auction_id)
        .order_by(Bid.amount.desc(), Bid.created_at.asc(), Bid.id.asc())
        .limit(1)
    )


@router.post("/auctions/{auction_id}/checkout", response_model=CheckoutResponse)
async def create_checkout(
    auction_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    auction = await db.scalar(
        select(Auction).where(Auction.id == auction_id).with_for_update()
    )
    if auction is None:
        raise HTTPException(status_code=404, detail="Auction not found")

    current_status = get_auction_status(auction)
    if current_status != AuctionStatus.ENDED:
        raise HTTPException(status_code=409, detail="Payment is available after the auction ends")

    winning_bid = await _winning_bid(db, auction.id)
    if winning_bid is None:
        raise HTTPException(status_code=409, detail="This auction ended without a winning bid")
    if winning_bid.bidder_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the winning bidder can pay for this auction")

    auction.status = AuctionStatus.ENDED
    auction.winner_id = winning_bid.bidder_id
    auction.final_price = winning_bid.amount

    existing_order = await db.scalar(select(AuctionOrder).where(AuctionOrder.auction_id == auction.id))
    if existing_order:
        raise HTTPException(status_code=409, detail="An order already exists for this auction")

    payment = await db.scalar(
        select(Payment)
        .where(
            Payment.auction_id == auction.id,
            Payment.buyer_id == current_user.id,
            Payment.status == PaymentStatus.PENDING,
            Payment.method == PaymentMethod.MOCK_ONLINE,
        )
        .order_by(Payment.created_at.desc())
    )
    amount_rupees = Decimal(winning_bid.amount).quantize(Decimal("0.01"))
    amount_paise = int(amount_rupees * 100)
    if amount_paise <= 0:
        raise HTTPException(status_code=409, detail="The winning amount is invalid")

    if payment is None:
        payment = Payment(
            auction_id=auction.id,
            buyer_id=current_user.id,
            amount=amount_rupees,
            method=PaymentMethod.MOCK_ONLINE,
            gateway_order_id=f"mock_order_{uuid.uuid4().hex}",
            status=PaymentStatus.PENDING,
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)
    else:
        if payment.amount != amount_rupees:
            await db.rollback()
            raise HTTPException(status_code=409, detail="The winning amount changed; please refresh")
        await db.commit()

    return CheckoutResponse(
        payment_id=payment.id,
        gateway_order_id=payment.gateway_order_id,
        amount=amount_paise,
        method=payment.method,
    )


@router.post("/verify", response_model=OrderResponse)
async def verify_checkout(
    data: VerifyPaymentRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    payment = await db.scalar(
        select(Payment)
        .where(Payment.id == data.payment_id)
        .options(selectinload(Payment.order))
    )
    if payment is None or payment.buyer_id != current_user.id:
        raise HTTPException(status_code=404, detail="Payment not found")
    if payment.method != PaymentMethod.MOCK_ONLINE:
        raise HTTPException(status_code=400, detail="This payment does not use the mock online gateway")
    if not data.mock_payment_id or data.outcome not in ("success", "failure"):
        raise HTTPException(status_code=400, detail="Choose a valid mock gateway outcome")
    if payment.status == PaymentStatus.SUCCESS and payment.order is not None:
        return payment.order

    locked_payment = await db.scalar(
        select(Payment)
        .where(Payment.id == data.payment_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked_payment.status == PaymentStatus.SUCCESS:
        order = await db.scalar(select(AuctionOrder).where(AuctionOrder.payment_id == locked_payment.id))
        if order:
            return order
    if locked_payment.status not in (PaymentStatus.PENDING, PaymentStatus.FAILED):
        raise HTTPException(status_code=409, detail="This payment is no longer available")
    if data.outcome == "failure":
        locked_payment.status = PaymentStatus.FAILED
        await db.commit()
        raise HTTPException(status_code=402, detail="The mock gateway declined this payment. Try again or choose cash on delivery.")

    locked_payment.status = PaymentStatus.SUCCESS
    locked_payment.gateway_payment_id = data.mock_payment_id
    locked_payment.paid_at = datetime.now(timezone.utc)
    order = AuctionOrder(
        payment_id=locked_payment.id,
        auction_id=locked_payment.auction_id,
        buyer_id=locked_payment.buyer_id,
        amount=locked_payment.amount,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


@router.post("/auctions/{auction_id}/cod", response_model=PaymentStateResponse)
async def create_cod_order(
    auction_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    auction = await db.scalar(select(Auction).where(Auction.id == auction_id).with_for_update())
    if auction is None:
        raise HTTPException(status_code=404, detail="Auction not found")
    if get_auction_status(auction) != AuctionStatus.ENDED:
        raise HTTPException(status_code=409, detail="Cash on delivery is available after the auction ends")
    winning_bid = await _winning_bid(db, auction.id)
    if winning_bid is None or winning_bid.bidder_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the winning bidder can place this order")
    existing = await db.scalar(
        select(Payment).where(Payment.auction_id == auction.id, Payment.buyer_id == current_user.id)
        .options(selectinload(Payment.order)).order_by(Payment.created_at.desc())
    )
    if existing and existing.order:
        return PaymentStateResponse(
            payment_id=existing.id, status=existing.status, amount=existing.amount,
            method=existing.method, gateway_order_id=existing.gateway_order_id,
            paid_at=existing.paid_at, order=existing.order,
        )
    if existing and existing.method == PaymentMethod.CASH_ON_DELIVERY:
        payment = existing
    else:
        payment = Payment(
            auction_id=auction.id, buyer_id=current_user.id, amount=winning_bid.amount,
            method=PaymentMethod.CASH_ON_DELIVERY, gateway_order_id=f"cod_order_{uuid.uuid4().hex}",
            status=PaymentStatus.PENDING,
        )
        db.add(payment)
        await db.flush()
    auction.status = AuctionStatus.ENDED
    auction.winner_id = current_user.id
    auction.final_price = winning_bid.amount
    order = AuctionOrder(payment_id=payment.id, auction_id=auction.id, buyer_id=current_user.id, amount=payment.amount)
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return PaymentStateResponse(
        payment_id=payment.id, status=payment.status, amount=payment.amount,
        method=payment.method, gateway_order_id=payment.gateway_order_id,
        paid_at=payment.paid_at, order=order,
    )


@router.get("/auctions/{auction_id}/mine", response_model=PaymentStateResponse | None)
async def get_my_auction_payment(
    auction_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    auction = await db.get(Auction, auction_id)
    if auction is None:
        raise HTTPException(status_code=404, detail="Auction not found")
    if auction.winner_id != current_user.id:
        winning_bid = await _winning_bid(db, auction.id)
        if winning_bid is None or winning_bid.bidder_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only the winning bidder can view payment status")
    payment = await db.scalar(
        select(Payment)
        .where(Payment.auction_id == auction_id, Payment.buyer_id == current_user.id)
        .options(selectinload(Payment.order))
        .order_by(Payment.created_at.desc())
    )
    if payment is None:
        return None
    return PaymentStateResponse(
        payment_id=payment.id,
        status=payment.status,
        amount=payment.amount,
        method=payment.method,
        gateway_order_id=payment.gateway_order_id,
        paid_at=payment.paid_at,
        order=payment.order,
    )

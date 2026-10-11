import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.payment import PaymentMethod, PaymentStatus


class CheckoutResponse(BaseModel):
    payment_id: uuid.UUID
    gateway_order_id: str
    amount: int
    method: PaymentMethod
    currency: str = "INR"


class VerifyPaymentRequest(BaseModel):
    payment_id: uuid.UUID
    mock_payment_id: str
    outcome: str


class OrderResponse(BaseModel):
    id: uuid.UUID
    payment_id: uuid.UUID
    auction_id: uuid.UUID
    buyer_id: uuid.UUID
    amount: Decimal
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PaymentStateResponse(BaseModel):
    payment_id: uuid.UUID
    status: PaymentStatus
    amount: Decimal
    method: PaymentMethod
    gateway_order_id: str
    paid_at: datetime | None
    order: OrderResponse | None

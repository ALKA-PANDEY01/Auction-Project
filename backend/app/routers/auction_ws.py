from uuid import UUID

import anyio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.database import AsyncSessionLocal
from app.core.redis import redis
from app.models.auction import Auction


router = APIRouter(
    prefix="/auctions",
    tags=["Auction Updates"],
)


@router.websocket("/{auction_id}/ws")
async def auction_bid_updates(websocket: WebSocket, auction_id: UUID):
    async with AsyncSessionLocal() as db:
        auction = await db.get(Auction, auction_id)

    if auction is None:
        await websocket.close(code=1008, reason="Auction not found")
        return

    pubsub = redis.pubsub()
    channel = f"auction:{auction_id}:bids"
    await pubsub.subscribe(channel)
    await websocket.accept()

    async def forward_updates():
        async for message in pubsub.listen():
            if message["type"] == "message":
                await websocket.send_text(message["data"])

    async def wait_for_disconnect(task_group):
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            task_group.cancel_scope.cancel()

    try:
        async with anyio.create_task_group() as task_group:
            task_group.start_soon(forward_updates)
            task_group.start_soon(wait_for_disconnect, task_group)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()

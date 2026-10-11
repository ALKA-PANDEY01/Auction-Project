import anyio
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.redis import redis
from app.core.security import decode_access_token
from app.models.user import User


router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.websocket("/ws")
async def notification_updates(websocket: WebSocket):
    token = websocket.cookies.get("access_token")
    user_id = decode_access_token(token) if token else None
    if not user_id:
        await websocket.close(code=1008, reason="Authentication required")
        return

    try:
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid authentication token")
        return

    async with AsyncSessionLocal() as db:
        user = await db.scalar(select(User).where(User.id == user_uuid))
    if user is None:
        await websocket.close(code=1008, reason="User not found")
        return

    pubsub = redis.pubsub()
    channel = f"user:{user.id}:notifications"
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

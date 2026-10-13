from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import check_database_connection, engine
from app.models import Base
from app.routers.auth import router as auth_router
from app.routers.auction import router as auction_router
from app.routers.bid import router as bid_router
from app.routers.auction_ws import router as auction_ws_router
from app.routers.watchlist import router as watchlist_router
from app.routers.notification import router as notification_router
from app.routers.notification_ws import router as notification_ws_router
from app.routers.payment import router as payment_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield

app = FastAPI(
    title="Real-Time Auction Platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_origin_regex=r"https://auction-project-[a-z0-9-]+-nitrix-next-gen\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
# Register the static /auctions/my-bids route before the auction router's
# dynamic /auctions/{auction_id} route so it is not parsed as a UUID.
app.include_router(bid_router)
app.include_router(auction_router)
app.include_router(auction_ws_router)
app.include_router(watchlist_router)
app.include_router(notification_router)
app.include_router(notification_ws_router)
app.include_router(payment_router)


@app.get("/")
async def root():
    return {
        "message": "Auction API is running"
    }


@app.get("/health")
async def health_check():
    try:
        database_connected = await check_database_connection()

        if not database_connected:
            raise HTTPException(
                status_code=503,
                detail="Database connection failed",
            )

        return {
            "status": "healthy",
            "database": "connected",
        }

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )

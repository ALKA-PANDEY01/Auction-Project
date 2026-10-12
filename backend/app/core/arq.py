import os

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL")
if REDIS_URL:
    redis_settings = RedisSettings.from_dsn(REDIS_URL)
else:
    redis_settings = RedisSettings(
        host=os.getenv("REDIS_HOST", "localhost"),
        port=int(os.getenv("REDIS_PORT", "6379")),
    )


async def create_arq_pool() -> ArqRedis:
    return await create_pool(redis_settings)

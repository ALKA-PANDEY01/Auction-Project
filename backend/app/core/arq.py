import os
from dotenv import load_dotenv
from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

load_dotenv()

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")

redis_settings = RedisSettings(
    host=REDIS_HOST,
    port=6379,
)




async def create_arq_pool():
    return await create_pool(redis_settings)
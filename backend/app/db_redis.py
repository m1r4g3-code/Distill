from typing import AsyncGenerator
import structlog
from redis.asyncio import Redis, ConnectionPool

from app.config import settings

logger = structlog.get_logger("app")

# Global variables for the connection pool and client
_redis_pool: ConnectionPool | None = None
_redis_client: Redis | None = None

async def init_redis() -> None:
    """Initialize the Redis connection pool."""
    global _redis_pool, _redis_client
    if _redis_pool is None:
        _redis_pool = ConnectionPool.from_url(
            settings.redis_url,
            max_connections=20,
            decode_responses=True
        )
        _redis_client = Redis(connection_pool=_redis_pool)
        logger.info("db.redis.initialized", url=settings.redis_url)

async def close_redis() -> None:
    """Close the Redis connection pool."""
    global _redis_pool, _redis_client
    if _redis_client:
        await _redis_client.close()
    if _redis_pool:
        await _redis_pool.disconnect()
        _redis_pool = None
        _redis_client = None
        logger.info("db.redis.closed")

async def get_redis() -> AsyncGenerator[Redis, None]:
    """Dependency injection for Redis client."""
    global _redis_client
    if _redis_client is None:
        await init_redis()
    yield _redis_client

async def ping_redis() -> bool:
    """Perform a health check ping against Redis."""
    global _redis_client
    if _redis_client is None:
        try:
            await init_redis()
        except Exception:
            return False
            
    try:
        return await _redis_client.ping()
    except Exception as e:
        logger.error("db.redis.ping_failed", error=str(e))
        return False

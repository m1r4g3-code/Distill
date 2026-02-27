import structlog
from arq.connections import RedisSettings
from app.config import settings
from app.worker.tasks import run_scrape_job, run_map_job, run_agent_job
from app.db.session import engine
from app.db_redis import init_redis, close_redis
from app.worker.playwright_pool import PlaywrightBrowserPool

logger = structlog.get_logger("app.worker")

async def startup(ctx):
    """Worker startup routine."""
    logger.info("worker.startup", redis_url=settings.redis_url)
    await init_redis()
    
    # Initialize Playwright Browser Pool
    ctx["pw_pool"] = PlaywrightBrowserPool(max_contexts=3)
    await ctx["pw_pool"].start()

async def shutdown(ctx):
    """Worker shutdown routine."""
    logger.info("worker.shutdown")
    if "pw_pool" in ctx:
        await ctx["pw_pool"].stop()
        
    await close_redis()
    await engine.dispose()

class WorkerSettings:
    """Configures the ARQ worker settings."""
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [run_scrape_job, run_map_job, run_agent_job]
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 10
    job_timeout = 300
    keep_result = 3600  # keep job result in Redis for 1hr as backup
    retry_jobs = False  # internal retry logic used where suitable

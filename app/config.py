from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://postgres:dev@localhost:5432/webextract"
    secret_key: str = "change-me-32-chars-minimum"
    redis_url: str = "redis://localhost:6379/0"

    cache_ttl_seconds: int = 3600
    job_cleanup_interval_hours: int = 1

    fetch_connect_timeout: float = 5.0
    fetch_read_timeout: float = 20.0

    proxy_enabled: bool = False
    proxy_url: str | None = None
    proxy_rotate: bool = False

    playwright_timeout: float = 30.0

    domain_delay_ms: int = 500

    serper_api_key: str | None = None
    serpapi_api_key: str | None = None
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"
    search_timeout: float = 10.0

    default_rate_limit: int = 60

    log_level: str = "INFO"
    app_env: str = "development"
    app_version: str = "1.2.0"
    sentry_dsn: str | None = None


settings = Settings()

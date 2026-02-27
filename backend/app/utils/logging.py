import logging
import structlog
from app.config import settings

def configure_logging():
    """Confingures structlog globally for the application."""
    
    # Choose the structlog renderer based on environment
    if settings.app_env.lower() in ["production", "staging"]:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars, # Allows binding request_id
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            # sanitize huge strings right before rendering
            sanitize_long_strings,
            renderer,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    # Set base library logging
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", level=log_level)


def sanitize_long_strings(logger, log_method, event_dict):
    """
    Sanitizer hooked into structlog processing chain to 
    prevent extreme HTML/JSON dumps or long API keys.
    """
    for key, value in event_dict.items():
        if isinstance(value, str) and len(value) > 200:
            # specifically truncate massive raw strings in log context
            event_dict[key] = value[:200] + "... [TRUNCATED]"
    return event_dict


# Simple helper
def get_logger(name: str):
    return structlog.get_logger(name)

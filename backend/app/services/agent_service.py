"""
agent_service.py — Stealth-browser scraping + Gemini structured extraction.

Called by the background worker for 'agent_extract' jobs.
"""
import structlog

from app.services.browser import fetch_page
from app.services.llm import extract_structured_data as _llm_extract, LLMExtractionError
from app.utils.text import sanitize_text

logger = structlog.get_logger("agent_service")


async def extract_structured_data(
    url: str,
    prompt: str,
    schema: dict | None = None,
) -> dict:
    """
    Scrapes the target URL with stealth browser then uses Gemini
    to extract structured data based on the provided prompt.

    Args:
        url:    The page to scrape
        prompt: Natural language extraction instruction
        schema: Optional JSON Schema to constrain the output

    Returns:
        {
            "url": url,
            "prompt": prompt,
            "schema": schema,
            "extracted": {...},   <- the Gemini-extracted data
            "word_count": int,
            "pages_scraped": 1,
        }
    """
    logger.info("agent_service.fetch", url=url)
    page_data = await fetch_page(url, wait_for_idle=True, extra_wait_ms=1500)
    content = sanitize_text(page_data["markdown"])

    if not content or len(content.split()) < 20:
        raise LLMExtractionError(
            "Page content too thin to extract from. "
            "The site may be blocking access."
        )

    logger.info(
        "agent_service.extract",
        word_count=page_data["word_count"],
        prompt=prompt[:80],
    )

    extracted = await _llm_extract(
        content=content[:12000],
        prompt=prompt,
        schema=schema,
    )

    return {
        "url": url,
        "prompt": prompt,
        "schema": schema,
        "extracted": extracted,
        "word_count": page_data["word_count"],
        "pages_scraped": 1,
    }

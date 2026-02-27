import asyncio
import threading
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import requests

_robot_cache: dict[str, RobotFileParser] = {}
_cache_lock = threading.Lock()


def is_allowed_by_robots(url: str, user_agent: str = "WebExtractBot/1.0") -> bool:
    """
    Checks if a URL is allowed by robots.txt.
    Uses a thread-safe cache for RobotFileParser objects.
    """
    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return True

    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

    with _cache_lock:
        if robots_url in _robot_cache:
            return _robot_cache[robots_url].can_fetch(user_agent, url)

    # Fetch and parse robots.txt
    parser = RobotFileParser()
    try:
        # Using requests for robots.txt fetch as it's a simple synchronous operation
        # and RobotFileParser doesn't have an async fetch out of the box.
        response = requests.get(robots_url, timeout=5, headers={"User-Agent": user_agent})
        if response.status_code == 200:
            parser.parse(response.text.splitlines())
        elif response.status_code == 404:
            # If robots.txt is missing, everything is allowed
            parser.allow_all = True
        else:
            # For other errors, we default to allowing (optimistic)
            parser.allow_all = True
    except Exception:
        # In case of connection errors, we default to allowing
        parser.allow_all = True

    with _cache_lock:
        _robot_cache[robots_url] = parser
        return parser.can_fetch(user_agent, url)


async def is_allowed_by_robots_async(url: str, user_agent: str = "WebExtractBot/1.0") -> bool:
    """
    Async wrapper for robots.txt check.
    """
    return await asyncio.to_thread(is_allowed_by_robots, url, user_agent)

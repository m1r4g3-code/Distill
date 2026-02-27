import asyncio
import hashlib
import ipaddress
import socket
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse
from fastapi import HTTPException


class SSRFBlockedError(Exception):
    pass


BLOCKED_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

BLOCKED_SCHEMES = {"file", "ftp", "data", "javascript"}
TRACKING_PREFIXES = ("utm_", "mc_")
TRACKING_KEYS = {"fbclid", "gclid", "ref", "source"}


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def validate_ssrf(url: str) -> None:
    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(
            status_code=403,
            detail={
                "error": {
                    "code": "SSRF_BLOCKED",
                    "message": "Only http and https are allowed",
                }
            },
        )

    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_URL",
                    "message": "Could not parse hostname from URL",
                }
            },
        )

    # Block raw IPs that are in private ranges without DNS lookup
    try:
        ip_obj = ipaddress.ip_address(hostname)
        for blocked in BLOCKED_RANGES:
            if ip_obj in blocked:
                from app.routers.metrics import increment_counter
                await increment_counter("crawlclean_ssrf_blocked_total")
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": {
                            "code": "SSRF_BLOCKED",
                            "message": "URL resolves to a blocked IP range",
                        }
                    },
                )
        return  # It's a valid public IP, allow it
    except ValueError:
        pass  # Not a raw IP — it's a hostname, continue to DNS check

    # DNS resolution for hostnames
    try:
        loop = asyncio.get_event_loop()
        resolved = await loop.run_in_executor(None, lambda: socket.getaddrinfo(hostname, None))
        for info in resolved:
            ip = ipaddress.ip_address(info[4][0])
            for blocked in BLOCKED_RANGES:
                if ip in blocked:
                    from app.routers.metrics import increment_counter
                    await increment_counter("crawlclean_ssrf_blocked_total")
                    raise HTTPException(
                        status_code=403,
                        detail={
                            "error": {
                                "code": "SSRF_BLOCKED",
                                "message": "URL resolves to a blocked IP range",
                            }
                        },
                    )
    except HTTPException:
        raise
    except OSError:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "DNS_RESOLUTION_FAILED",
                    "message": "Could not resolve hostname. Check the URL and try again.",
                }
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": f"Validation error: {str(e)}",
                }
            },
        )


def normalize_url(url: str, base_url: str | None = None, strip_www: bool = True) -> str:
    absolute = urljoin(base_url, url) if base_url else url
    parsed = urlparse(absolute)

    scheme = (parsed.scheme or "").lower()
    netloc = (parsed.netloc or "").lower()

    if strip_www and netloc.startswith("www."):
        netloc = netloc[4:]

    host = parsed.hostname.lower() if parsed.hostname else ""
    port = parsed.port
    if port and ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc = host

    query_items = parse_qsl(parsed.query, keep_blank_values=True)
    filtered = []
    for k, v in query_items:
        lk = k.lower()
        if lk in TRACKING_KEYS or any(lk.startswith(p) for p in TRACKING_PREFIXES):
            continue
        filtered.append((k, v))

    filtered.sort(key=lambda x: x[0])
    query = urlencode(filtered, doseq=True)

    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path[:-1]

    cleaned = parsed._replace(scheme=scheme, netloc=netloc, path=path, query=query, fragment="")
    return urlunparse(cleaned)


def compute_url_hash(normalized_url: str) -> str:
    return sha256_hex(normalized_url)

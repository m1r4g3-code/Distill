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


def validate_ssrf(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme in BLOCKED_SCHEMES:
        raise SSRFBlockedError(f"Scheme '{parsed.scheme}' is not allowed")
    if parsed.scheme not in {"http", "https"}:
        raise SSRFBlockedError("Only http and https are allowed")
    if not parsed.hostname:
        raise SSRFBlockedError("URL must include a hostname")

    try:
        resolved = socket.getaddrinfo(parsed.hostname, None)
        for info in resolved:
            ip = ipaddress.ip_address(info[4][0])
            for blocked in BLOCKED_RANGES:
                if ip in blocked:
                    raise HTTPException(
                        status_code=403,
                        detail={"code": "SSRF_BLOCKED", "message": "URL resolves to a blocked IP range"},
                    )
    except socket.gaierror:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "DNS_RESOLUTION_FAILED",
                "message": "Could not resolve hostname. Check the URL and try again.",
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise SSRFBlockedError(f"Validation error: {str(e)}")


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

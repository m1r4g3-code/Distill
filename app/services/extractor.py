import re
import json
from dataclasses import dataclass
from urllib.parse import urlparse

from lxml import html
from markdownify import markdownify as md
from readability import Document
import trafilatura

from app.services.url_utils import normalize_url


@dataclass
class ExtractedLinks:
    internal: list[str]
    external: list[str]


def extract_links(raw_html: str, base_url: str) -> ExtractedLinks:
    tree = html.fromstring(raw_html)
    hrefs = tree.xpath("//a[@href]/@href")

    internal: set[str] = set()
    external: set[str] = set()

    base_norm = normalize_url(base_url)
    base_host = urlparse(base_norm).hostname

    for href in hrefs:
        h = href.strip()
        if not h or h.startswith("#"):
            continue
        lower = h.lower()
        if lower.startswith(("mailto:", "tel:", "javascript:", "data:")):
            continue

        try:
            normalized = normalize_url(h, base_url=base_norm)
        except Exception:
            continue

        host = urlparse(normalized).hostname
        if host and base_host and host == base_host:
            internal.add(normalized)
        else:
            external.add(normalized)

    return ExtractedLinks(internal=sorted(internal), external=sorted(external))


def parse_author(html_text: str) -> str | None:
    tree = html.fromstring(html_text)
    # Check common meta tags
    author = tree.xpath("//meta[@name='author']/@content")
    if author:
        return author[0].strip()
    # Check JSON-LD
    json_ld = tree.xpath("//script[@type='application/ld+json']/text()")
    for ld in json_ld:
        try:
            data = json.loads(ld)
            if isinstance(data, dict):
                if "author" in data:
                    auth = data["author"]
                    if isinstance(auth, dict) and "name" in auth:
                        return auth["name"]
                    if isinstance(auth, str):
                        return auth
        except:
            continue
    return None


def parse_published_at(html_text: str) -> str | None:
    tree = html.fromstring(html_text)
    # Check meta tags
    tags = [
        "article:published_time",
        "og:published_time",
        "publication_date",
        "datePublished",
    ]
    for tag in tags:
        val = tree.xpath(f"//meta[@property='{tag}' or @name='{tag}']/@content")
        if val:
            return val[0].strip()
    return None


def parse_language(html_text: str) -> str | None:
    tree = html.fromstring(html_text)
    lang = tree.xpath("//html/@lang")
    if lang:
        return lang[0].strip()
    return None


def clean_html(raw_html: str) -> str:
    tree = html.fromstring(raw_html)

    for bad in tree.xpath("//script|//style|//noscript|//iframe|//svg|//nav|//header|//footer|//aside|//form|//button"):
        bad.getparent().remove(bad)

    pattern = re.compile(r"(nav|navbar|menu|sidebar|footer|header|cookie|banner|popup|modal|\bad\b|advertisement)", re.I)
    for el in tree.xpath("//*[@class or @id]"):
        cls = (el.get("class") or "") + " " + (el.get("id") or "")
        if pattern.search(cls):
            parent = el.getparent()
            if parent is not None:
                parent.remove(el)

    return html.tostring(tree, encoding="unicode", method="html")


def extract_content(cleaned_html: str) -> str:
    extracted = trafilatura.extract(
        cleaned_html,
        include_comments=False,
        include_tables=True,
        output_format="xml",
    )
    if extracted and len(extracted) >= 100:
        return extracted

    doc = Document(cleaned_html)
    return doc.summary(html_partial=True)


def html_to_markdown(extracted_html: str) -> str:
    markdown = md(
        extracted_html,
        heading_style="ATX",
        bullets="-",
        strip=["script", "style", "nav", "footer", "header"],
        convert_links=True,
    )

    markdown = re.sub(r"\n{3,}", "\n\n", markdown)
    lines = [ln.strip() for ln in markdown.splitlines()]
    lines = [ln for ln in lines if ln and not re.fullmatch(r"[\W_]+", ln)]
    return "\n".join(lines).strip()

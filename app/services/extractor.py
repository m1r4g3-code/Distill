import re
import json
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from lxml import html
from bs4 import BeautifulSoup
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


def extract_title(html_text: str, og_data: dict) -> str | None:
    # 1. Try OG title first
    if og_data.get("og_title"):
        return og_data["og_title"]
    
    # 2. Try <title> tag using BeautifulSoup
    soup = BeautifulSoup(html_text, "lxml")
    title_tag = soup.find("title")
    if title_tag and title_tag.text.strip():
        return title_tag.text.strip()
    
    # 3. Try first <h1>
    h1 = soup.find("h1")
    if h1 and h1.text.strip():
        return h1.text.strip()
    
    return None


def extract_tables(html_text: str) -> str:
    soup = BeautifulSoup(html_text, "lxml")
    tables = soup.find_all("table")
    if not tables:
        return ""
    table_mds = []
    for table in tables[:3]:  # limit to first 3 tables
        try:
            md_text = md(str(table), heading_style="ATX")
            if "|" in md_text:
                table_mds.append(md_text)
        except Exception:
            pass
    return "\n\n".join(table_mds)


def extract_metadata(html_text: str, url: str) -> dict:
    tree = html.fromstring(html_text)

    def get_meta(property=None, name=None):
        if property:
            res = tree.xpath(f"//meta[@property='{property}']/@content")
            if res:
                return res[0].strip()
        if name:
            res = tree.xpath(f"//meta[@name='{name}']/@content")
            if res:
                return res[0].strip()
        return None

    og_title = get_meta(property="og:title")
    
    description = get_meta(property="og:description", name="description")
    image = get_meta(property="og:image")
    author = get_meta(name="author")
    published_at = get_meta(property="article:published_time")
    site_name = get_meta(property="og:site_name")
    language = parse_language(html_text)
    canonical_url = tree.xpath("//link[@rel='canonical']/@href")
    canonical_url = canonical_url[0].strip() if canonical_url else None

    # Favicon extraction
    favicon_url = tree.xpath("//link[@rel='icon']/@href") or tree.xpath("//link[@rel='shortcut icon']/@href")
    if favicon_url:
        favicon_url = urljoin(url, favicon_url[0].strip())
    else:
        parsed_url = urlparse(url)
        favicon_url = f"{parsed_url.scheme}://{parsed_url.netloc}/favicon.ico"

    # Fix 1: Title fallback logic
    meta_dict = {
        "og_title": og_title,
        "description": description,
        "og_image": image,
        "author": author,
        "published_at": published_at,
        "site_name": site_name,
        "language": language,
        "canonical_url": canonical_url,
        "favicon_url": favicon_url,
    }
    
    title = extract_title(html_text, meta_dict)
    meta_dict["title"] = title
    
    return meta_dict


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


@dataclass
class ContentResult:
    content: str
    tables_md: str | None = None


def extract_content(cleaned_html: str) -> ContentResult:
    # Fix 2: Extract tables separately before trafilatura
    tables_md = extract_tables(cleaned_html)

    extracted = trafilatura.extract(
        cleaned_html,
        include_comments=False,
        include_tables=True,
        include_links=False,
        include_images=False,
        no_fallback=False,        # allow fallback to readability
        favor_recall=True,        # extract more content even if less precise
        output_format="html",      # get HTML output so markdownify preserves tables
    )
    
    if extracted and len(extracted) >= 100:
        return ContentResult(content=extracted, tables_md=tables_md)

    doc = Document(cleaned_html)
    return ContentResult(content=doc.summary(html_partial=True), tables_md=tables_md)


def html_to_markdown(extracted: ContentResult) -> str:
    markdown = md(
        extracted.content,
        heading_style="ATX",
        bullets="-",
        strip=["script", "style", "nav", "footer", "header"],
        convert_links=True,
    )

    # Post-processing steps
    # 1. Collapse 3+ consecutive blank lines into 2
    markdown = re.sub(r"\n{3,}", "\n\n", markdown)

    lines = markdown.splitlines()
    processed_lines = []
    last_line = None
    repeat_count = 0

    # Patterns for cleaning
    symbol_line_pattern = re.compile(r"^[ \t]*[\-\*\/\=\_\~\+\#\>\.]+ [ \t]*$")
    breadcrumb_pattern = re.compile(r"^.*?\s*>\s*.*?\s*>\s*.*?$")
    cookie_patterns = ["we use cookies", "accept all", "privacy policy", "cookie settings", "manage cookies"]

    for line in lines:
        stripped = line.strip()

        # 2. Remove lines that contain only symbols or punctuation
        if stripped and symbol_line_pattern.match(stripped):
            continue

        # 3. Remove lines that are only whitespace
        if not stripped and not line:
            processed_lines.append("")
            continue
        if not stripped:
            continue

        # 4. Strip cookie consent text patterns
        lower_stripped = stripped.lower()
        if any(p in lower_stripped for p in cookie_patterns) and len(stripped) < 100:
            continue

        # 5. Remove navigation breadcrumb patterns
        if breadcrumb_pattern.match(stripped) and len(stripped) < 100:
            continue

        # 6. Strip repeated duplicate lines (same line appearing 3+ times in a row)
        if stripped == last_line:
            repeat_count += 1
            if repeat_count >= 2:  # Already seen twice, this is the 3rd time
                continue
        else:
            repeat_count = 0

        # 7. Ensure all heading levels are properly spaced
        if stripped.startswith("#"):
            if processed_lines and processed_lines[-1] != "":
                processed_lines.append("")
            processed_lines.append(stripped)
            processed_lines.append("")
            last_line = stripped
            continue

        processed_lines.append(stripped)
        last_line = stripped

    # Join and final cleanup
    markdown = "\n".join(processed_lines).strip()
    
    # Fix 2: Append tables at the end
    if extracted.tables_md:
        if markdown:
            markdown += "\n\n"
        markdown += extracted.tables_md

    markdown = re.sub(r"\n{3,}", "\n\n", markdown)

    return markdown

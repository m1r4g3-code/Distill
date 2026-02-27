# WebExtract Engine: Backend MVP Specification (Firecrawl-like)

## 1. Vision & Scope
**Vision**: A high-performance, developer-first web extraction engine that converts the messy web into clean, structured data (Markdown/JSON) for LLMs and AI Agents.

### MVP Goals:
- High-quality HTML-to-Markdown extraction.
- Intelligent fetching (HTTPX + Playwright fallback).
- Asynchronous site mapping (discovery).
- Search-integrated scraping.
- LLM-powered structured data extraction (Agent Extract).
- Production-ready reliability (retries, idempotency, rate limiting).

### Explicit Non-Goals:
- No Frontend/Dashboard (API-only).
- No bypass of paywalls or anti-bot systems (CAPTCHAs).
- No complex browser automation beyond page loading.
- No multi-tenant user management (API keys only).

---

## 2. Primary User Stories
- **As a Developer**, I want to send a URL and get clean Markdown so my LLM can process the page content without noise.
- **As a Developer**, I want to map an entire site so I can build a local index of all its pages.
- **As a Developer**, I want to search for a topic and get the top 3 results scraped into Markdown in one call.
- **As a Developer**, I want to provide a JSON schema and have the engine extract specific data points from a URL using Gemini.

---

## 3. API Contract

### Common Headers
- `X-API-Key`: Required for all requests.
- `X-Request-ID`: Optional, for tracing.

### Error Format (Standard)
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "request_id": "req_123",
    "details": {}
  }
}
```

### Endpoints

#### `POST /api/v1/scrape` (Synchronous)
Scrapes a single URL.
- **Request**:
  ```json
  {
    "url": "https://example.com",
    "use_playwright": "auto", // auto, always, never
    "include_raw_html": false,
    "respect_robots": true
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "url": "https://example.com",
    "title": "Example Title",
    "markdown": "# Content...",
    "metadata": { "author": "...", "word_count": 123 },
    "links": { "internal": [], "external": [] },
    "cached": false
  }
  ```

#### `POST /api/v1/map` (Asynchronous)
Starts a site discovery job.
- **Request**:
  ```json
  {
    "url": "https://example.com",
    "max_depth": 2,
    "max_pages": 100
  }
  ```
- **Response (202 Accepted)**:
  ```json
  {
    "job_id": "uuid-123",
    "status": "queued"
  }
  ```

#### `POST /api/v1/search` (Synchronous)
Searches and optionally scrapes.
- **Request**:
  ```json
  {
    "query": "fastapi tutorial",
    "scrape_top_n": 3
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "query": "...",
    "results": [
      { "url": "...", "title": "...", "scraped": { "markdown": "..." } }
    ]
  }
  ```

#### `POST /api/v1/agent/extract` (Asynchronous)
Extracts structured JSON using Gemini.
- **Justification**: Asynchronous is preferred because LLM extraction + scraping can easily exceed 30s gateway timeouts.
- **Request**:
  ```json
  {
    "url": "https://news.ycombinator.com",
    "prompt": "Extract the top 5 stories",
    "schema": { "type": "object", "properties": { "stories": { "type": "array" } } }
  }
  ```
- **Response (202 Accepted)**:
  ```json
  { "job_id": "uuid-456", "status": "queued" }
  ```

#### `GET /api/v1/jobs/{id}`
Returns job status and metadata.

#### `GET /api/v1/jobs/{id}/results`
Returns the actual data produced by the job (e.g., list of URLs for `map`, JSON for `agent/extract`).

---

## 4. Data Model

### `api_keys`
- `id` (UUID, PK)
- `key_hash` (Text, Unique)
- `scopes` (Array[Text])
- `rate_limit` (Int)
- `is_active` (Bool)

### `jobs`
- `id` (UUID, PK)
- `api_key_id` (FK)
- `type` (Enum: map, agent_extract)
- `status` (Enum: queued, running, completed, failed)
- `input_params` (JSONB)
- `idempotency_key` (Text, Unique)
- `created_at`, `started_at`, `completed_at`

### `pages` (Cache Layer)
- `url_hash` (Text, PK/Unique)
- `url` (Text)
- `title`, `description`, `markdown`, `raw_html`
- `links_internal`, `links_external` (JSONB)
- `fetched_at` (Timestamp)

---

## 5. Core Pipeline Design

### 5.1 URL Normalization
- Lowercase hostname, strip trailing slashes, remove tracking params (utm_*).
- **Dedupe**: Use SHA256 of normalized URL as `url_hash`.

### 5.2 Fetching Strategy (Heuristics)
1. **Try HTTPX first**.
2. **Fallback to Playwright if**:
   - Content length < 500 bytes (likely SPA shell).
   - Presence of `<div id="app">` or `window.__next_data__`.
   - Meta refresh redirects.

### 5.3 Content Cleaning
- Remove: `<script>`, `<style>`, `<nav>`, `<footer>`, `<header>`, `<aside>`, `<form>`, `<ads>`.
- Use `trafilatura` for main content identification.

### 5.4 HTML → Markdown
- Use `markdownify` with strict filtering of unwanted tags.
- Preserve table structures and link formatting.

---

## 6. Reliability Design
- **Retries**: 3 attempts with exponential backoff (2s, 4s, 8s) for network errors.
- **Idempotency**: Clients can provide `X-Idempotency-Key`. Server stores hash of key + params to prevent duplicate job creation.
- **Concurrency**: Limit per-domain concurrency to 5 simultaneous requests.
- **Caching**: 1-hour default TTL for scraped pages based on `url_hash`.

---

## 7. Security & Compliance
- **SSRF Protection**: Custom `httpx` transport or validation layer to block:
  - `127.0.0.1`, `localhost`, `169.254.169.254` (Cloud metadata).
  - Private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
- **Robots.txt**: Implementation of `urllib.robotparser` with an optional `respect_robots` toggle.

---

## 8. Implementation Plan

### Milestone 1: Core Scraper
- **Goal**: Functional `/scrape` endpoint with HTTPX.
- **Files**: `app/main.py`, `app/routers/scrape.py`, `app/services/fetcher.py`.
- **Next Command**: `vibecode: implement the /scrape router and fetcher service using httpx.`

### Milestone 2: Extraction & Markdown
- **Goal**: Clean content and convert to Markdown.
- **Files**: `app/services/extractor.py`.
- **Next Command**: `vibecode: integrate trafilatura and markdownify into the extraction service.`

### Milestone 3: Storage & Cache
- **Goal**: Persist results and implement URL-based caching.
- **Files**: `app/db/models.py`, `app/db/session.py`.
- **Next Command**: `vibecode: set up sqlalchemy models for pages and implement caching in /scrape.`

### Milestone 4: Async Job System
- **Goal**: Implement `/map` with background tasks.
- **Files**: `app/routers/map.py`, `app/services/crawler.py`, `app/services/job_runner.py`.
- **Next Command**: `vibecode: build the async job runner and the site mapping crawler.`

### Milestone 5: Agent Extract (LLM) (COMPLETED)
- **Goal**: Implement structured extraction with Gemini.
- **Files**: `app/routers/agent.py`, `app/services/llm.py`.
- **Status**: Done. Gemini integration for structured JSON extraction is functional and integrated with the job system.

### Milestone 6: Security & API Keys (COMPLETED)
- **Goal**: Add SSRF protection and API key middleware.
- **Files**: `app/middleware/auth.py`, `app/services/url_utils.py`.
- **Status**: Done. SSRF protection is integrated into the core fetching pipeline, and API key header authentication with rate limiting is implemented.

---

## 9. Testing Plan
- **Unit**: URL normalization, Markdown conversion quality.
- **Integration**: Real scrape of `example.com`, full site map of a local test server.
- **Mocks**: `pytest-mock` for Gemini and Serper API calls.
- **Failures**: Test 404s, 500s, and SSRF-blocked IPs.

---

## 10. Deployment Plan
- **Env Vars**: `DATABASE_URL`, `GEMINI_API_KEY`, `SERPER_API_KEY`, `SECRET_KEY`.
- **Run Config**: `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- **Observability**: JSON structured logging using `structlog`.

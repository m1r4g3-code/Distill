/* ===================================================================
   Types — Single source of truth matching backend Pydantic schemas
   =================================================================== */

// ── Scrape ──
export interface ScrapeRequest {
    url: string;
    respect_robots?: boolean;
    use_playwright?: "auto" | "always" | "never";
    include_links?: boolean;
    include_raw_html?: boolean;
    timeout_ms?: number;
    cache_ttl_seconds?: number | null;
    force_refresh?: boolean;
}

export interface LinksModel {
    internal: string[];
    external: string[];
}

export interface MetadataModel {
    description: string | null;
    og_image: string | null;
    author: string | null;
    published_at: string | null;
    site_name: string | null;
    language: string | null;
    favicon_url: string | null;
    word_count: number | null;
    read_time_minutes: number | null;
    fetch_duration_ms: number;
    renderer: string;
}

export interface ScrapeResponse {
    url: string;
    canonical_url: string;
    status_code: number;
    title: string | null;
    markdown: string;
    metadata: MetadataModel;
    links: LinksModel | null;
    cached: boolean;
    cache_layer: string | null;
    request_id: string;
}

// ── Map ──
export interface MapRequest {
    url: string;
    max_depth?: number;
    max_pages?: number;
    include_raw_html?: boolean;
    respect_robots?: boolean;
    use_playwright?: "auto" | "always" | "never";
    timeout_ms?: number;
    include_patterns?: string[];
    exclude_patterns?: string[];
    concurrency?: number;
    force?: boolean;
}

export interface MapResponse {
    job_id: string;
    status: string;
    request_id: string;
}

// ── Search ──
export interface SearchRequest {
    query: string;
    num_results?: number;
    scrape_top_n?: number;
    search_type?: "search" | "news";
    search_provider?: string;
    respect_robots?: boolean;
}

export interface ScrapedModel {
    markdown: string;
    title: string | null;
}

export interface SearchResultModel {
    rank: number;
    title: string;
    url: string;
    snippet: string | null;
    scraped: ScrapedModel | null;
}

export interface SearchResponse {
    query: string;
    results: SearchResultModel[];
    request_id: string;
    task_id: string | null;
    scrape_status: string | null;
    message: string | null;
}

export interface SearchTaskResultResponse {
    task_id: string;
    scrape_status: string;
    results: Record<string, unknown>[] | null;
}

// ── Agent Extract ──
export interface AgentExtractRequest {
    url: string;
    prompt: string;
    schema_definition?: Record<string, unknown> | null;
    use_playwright?: "auto" | "always" | "never";
    timeout_ms?: number;
    force?: boolean;
}

export interface AgentExtractResponse {
    job_id: string;
    status: string;
    request_id: string;
}

// ── Jobs ──
export type JobType = "map" | "agent_extract" | "search_scrape";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface JobStatusResponse {
    job_id: string;
    type: JobType;
    status: JobStatus;
    created_at: string;
    started_at: string | null;
    completed_at: string | null;
    pages_discovered: number | null;
    pages_total: number | null;
    error: { code: string; message: string } | null;
}

export interface MapResultsResponse {
    job_id: string;
    type: string;
    urls: string[];
    total: number;
}

export interface ExtractionResultsResponse {
    job_id: string;
    type: string;
    data: Record<string, unknown>;
}

// ── Admin / API Keys ──
export interface ApiKeyCreate {
    name?: string | null;
    rate_limit?: number | null;
    scopes?: string[] | null;
}

export interface ApiKeyUpdate {
    name?: string | null;
    rate_limit?: number | null;
    scopes?: string[] | null;
    is_active?: boolean | null;
}

export interface ApiKeyResponse {
    id: string;
    name: string | null;
    rate_limit: number | null;
    scopes: string[] | null;
    is_active: boolean;
    created_at: string;
    last_used_at: string | null;
}

export interface ApiKeyCreateResponse extends ApiKeyResponse {
    raw_key: string;
}

// ── Error ──
export interface ApiError {
    code: string;
    message: string;
    request_id: string;
    details?: Record<string, unknown>;
}

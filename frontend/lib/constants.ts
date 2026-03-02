/* ===================================================================
   Mock Data & Constants — matches backend response shapes exactly
   =================================================================== */

import type {
    ScrapeResponse,
    SearchResponse,
    JobStatusResponse,
    ApiKeyResponse,
} from "@/types";

// ── Mock Scrape Response ──
export const MOCK_SCRAPE_RESPONSE: ScrapeResponse = {
    url: "https://openai.com/research/gpt-4",
    canonical_url: "https://openai.com/research/gpt-4",
    status_code: 200,
    title: "GPT-4 — OpenAI Research",
    markdown:
        "# GPT-4\n\nGPT-4 is OpenAI's most advanced system, producing safer and more useful responses.\n\n## Overview\n\nGPT-4 can solve difficult problems with greater accuracy, thanks to its broader general knowledge and problem solving abilities.\n\n## Capabilities\n\n- **Creative writing** — poems, stories, screenplays\n- **Visual understanding** — analyze images\n- **Extended context** — up to 128k tokens\n\n## Safety\n\nGPT-4 is 82% less likely to respond to requests for disallowed content.",
    metadata: {
        description:
            "GPT-4 is OpenAI's most advanced model, offering improved reasoning and creative capabilities.",
        og_image: "https://openai.com/content/images/2023/03/gpt-4.png",
        author: "OpenAI",
        published_at: "2023-03-14T12:00:00Z",
        site_name: "OpenAI",
        language: "en",
        favicon_url: "https://openai.com/favicon.ico",
        word_count: 1247,
        read_time_minutes: 6,
        fetch_duration_ms: 342,
        renderer: "httpx",
    },
    links: {
        internal: [
            "https://openai.com/research",
            "https://openai.com/blog",
            "https://openai.com/api",
        ],
        external: [
            "https://arxiv.org/abs/2303.08774",
            "https://github.com/openai/evals",
        ],
    },
    cached: false,
    cache_layer: "none",
    request_id: "req_abc123def456",
};

// ── Mock Map Response ──
export const MOCK_MAP_RESPONSE = {
    job_id: "job_map_001",
    status: "queued" as const,
    request_id: "req_map_001",
};

// ── Mock Search Response ──
export const MOCK_SEARCH_RESPONSE: SearchResponse = {
    query: "Latest advancements in AI 2025",
    results: [
        {
            rank: 1,
            title: "The State of AI in 2025 — Stanford HAI",
            url: "https://hai.stanford.edu/ai-index-2025",
            snippet:
                "The annual AI Index report tracks trends in artificial intelligence across research, industry, and policy.",
            scraped: null,
        },
        {
            rank: 2,
            title: "AI Breakthroughs of 2025 — MIT Technology Review",
            url: "https://www.technologyreview.com/2025/01/ai-breakthroughs",
            snippet:
                "From multimodal reasoning to autonomous agents, here are the most important AI developments.",
            scraped: null,
        },
        {
            rank: 3,
            title: "DeepMind's Gemini 2.0 capabilities",
            url: "https://deepmind.google/gemini-2",
            snippet:
                "Gemini 2.0 introduces native tool use and agentic capabilities for complex real-world tasks.",
            scraped: null,
        },
        {
            rank: 4,
            title: "Anthropic Claude 3.5 — New Benchmarks",
            url: "https://anthropic.com/claude-3-5",
            snippet:
                "Claude 3.5 Sonnet sets new industry benchmarks on graduate-level reasoning and coding.",
            scraped: null,
        },
        {
            rank: 5,
            title: "Open Source AI Models Surging — HuggingFace",
            url: "https://huggingface.co/blog/open-source-ai-2025",
            snippet:
                "Open-weight models are closing the gap with proprietary systems across multiple benchmarks.",
            scraped: null,
        },
    ],
    request_id: "req_search_001",
    task_id: null,
    scrape_status: null,
    message: null,
};

// ── Mock Agent Response ──
export const MOCK_AGENT_RESPONSE = {
    job_id: "job_agent_001",
    status: "queued" as const,
    request_id: "req_agent_001",
};

// ── Mock Jobs ──
export const MOCK_JOBS: JobStatusResponse[] = [
    {
        job_id: "job_001",
        type: "map",
        status: "completed",
        created_at: "2025-03-01T10:30:00Z",
        started_at: "2025-03-01T10:30:02Z",
        completed_at: "2025-03-01T10:32:15Z",
        pages_discovered: 47,
        pages_total: 47,
        error: null,
    },
    {
        job_id: "job_002",
        type: "agent_extract",
        status: "completed",
        created_at: "2025-03-01T09:15:00Z",
        started_at: "2025-03-01T09:15:01Z",
        completed_at: "2025-03-01T09:15:08Z",
        pages_discovered: 1,
        pages_total: 1,
        error: null,
    },
    {
        job_id: "job_003",
        type: "search_scrape",
        status: "running",
        created_at: "2025-03-01T11:00:00Z",
        started_at: "2025-03-01T11:00:01Z",
        completed_at: null,
        pages_discovered: 3,
        pages_total: 5,
        error: null,
    },
    {
        job_id: "job_004",
        type: "map",
        status: "failed",
        created_at: "2025-02-28T14:00:00Z",
        started_at: "2025-02-28T14:00:02Z",
        completed_at: "2025-02-28T14:01:30Z",
        pages_discovered: 12,
        pages_total: 100,
        error: { code: "FETCH_TIMEOUT", message: "Target URL did not respond within 20000ms" },
    },
    {
        job_id: "job_005",
        type: "agent_extract",
        status: "completed",
        created_at: "2025-02-28T12:00:00Z",
        started_at: "2025-02-28T12:00:01Z",
        completed_at: "2025-02-28T12:00:06Z",
        pages_discovered: 1,
        pages_total: 1,
        error: null,
    },
    {
        job_id: "job_006",
        type: "map",
        status: "completed",
        created_at: "2025-02-27T08:00:00Z",
        started_at: "2025-02-27T08:00:03Z",
        completed_at: "2025-02-27T08:05:22Z",
        pages_discovered: 213,
        pages_total: 213,
        error: null,
    },
];

// ── Mock API Keys ──
export const MOCK_API_KEYS: ApiKeyResponse[] = [
    {
        id: "key_001",
        name: "Production API Key",
        rate_limit: 120,
        scopes: ["scrape", "map", "agent"],
        is_active: true,
        created_at: "2025-01-15T10:00:00Z",
        last_used_at: "2025-03-01T11:30:00Z",
    },
    {
        id: "key_002",
        name: "Development Key",
        rate_limit: 60,
        scopes: ["scrape", "map"],
        is_active: true,
        created_at: "2025-02-01T09:00:00Z",
        last_used_at: "2025-03-01T10:00:00Z",
    },
    {
        id: "key_003",
        name: "Testing Key (Revoked)",
        rate_limit: 30,
        scopes: ["scrape"],
        is_active: false,
        created_at: "2025-01-10T08:00:00Z",
        last_used_at: "2025-02-15T14:00:00Z",
    },
];

// ── Mock Usage Data ──
export const MOCK_USAGE_DATA = {
    totalRequests: 12847,
    successRate: 97.3,
    cacheHits: 4231,
    pagesExtracted: 8942,
    requestsOverTime: [
        { date: "Feb 23", requests: 320, success: 312 },
        { date: "Feb 24", requests: 450, success: 441 },
        { date: "Feb 25", requests: 380, success: 370 },
        { date: "Feb 26", requests: 520, success: 507 },
        { date: "Feb 27", requests: 610, success: 594 },
        { date: "Feb 28", requests: 480, success: 469 },
        { date: "Mar 01", requests: 590, success: 573 },
    ],
    requestsByEndpoint: [
        { endpoint: "Scrape", count: 6420 },
        { endpoint: "Map", count: 2180 },
        { endpoint: "Search", count: 2847 },
        { endpoint: "Agent", count: 1400 },
    ],
    topUrls: [
        { url: "https://docs.python.org/3/", count: 234 },
        { url: "https://developer.mozilla.org/", count: 189 },
        { url: "https://react.dev/", count: 156 },
        { url: "https://nextjs.org/docs", count: 134 },
        { url: "https://tailwindcss.com/docs", count: 98 },
    ],
};

// ── Dashboard Stats ──
export const MOCK_DASHBOARD_STATS = {
    totalJobs: 847,
    successRate: 97.3,
    pagesExtracted: 8942,
    cacheHitRate: 32.9,
};

// ── Code Snippets for Landing Page ──
export const CODE_SNIPPETS = {
    scrape: {
        request: `curl -X POST https://api.distill.dev/api/v1/scrape \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://openai.com/research/gpt-4",
    "include_links": true
  }'`,
        response: `{
  "url": "https://openai.com/research/gpt-4",
  "title": "GPT-4 — OpenAI Research",
  "markdown": "# GPT-4\\n\\nGPT-4 is OpenAI's most...",
  "metadata": {
    "word_count": 1247,
    "fetch_duration_ms": 342,
    "renderer": "httpx"
  },
  "cached": false,
  "request_id": "req_abc123"
}`,
    },
    map: {
        request: `curl -X POST https://api.distill.dev/api/v1/map \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://docs.python.org/3/",
    "max_depth": 2,
    "max_pages": 50
  }'`,
        response: `{
  "job_id": "job_map_001",
  "status": "queued",
  "request_id": "req_map_001"
}`,
    },
    search: {
        request: `curl -X POST https://api.distill.dev/api/v1/search \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "Latest AI breakthroughs 2025",
    "num_results": 5
  }'`,
        response: `{
  "query": "Latest AI breakthroughs 2025",
  "results": [
    {
      "rank": 1,
      "title": "State of AI 2025",
      "url": "https://hai.stanford.edu/...",
      "snippet": "The annual AI Index..."
    }
  ],
  "request_id": "req_search_001"
}`,
    },
    agent: {
        request: `curl -X POST https://api.distill.dev/api/v1/agent/extract \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://en.wikipedia.org/wiki/AI",
    "prompt": "Extract the main definition"
  }'`,
        response: `{
  "job_id": "job_agent_001",
  "status": "queued",
  "request_id": "req_agent_001"
}`,
    },
};

// ── Navigation ──
export const MARKETING_NAV_ITEMS = [
    { label: "Features", href: "#features" },
    { label: "Docs", href: "/dashboard/docs" },
    { label: "Pricing", href: "#pricing" },
];

export const DASHBOARD_NAV_ITEMS = [
    { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
    { label: "Playground", href: "/dashboard/playground", icon: "Play" },
    { label: "Jobs", href: "/dashboard/jobs", icon: "ListTodo" },
    { label: "API Keys", href: "/dashboard/api-keys", icon: "Key" },
    { label: "Docs", href: "/dashboard/docs", icon: "BookOpen" },
    { label: "Usage", href: "/dashboard/usage", icon: "BarChart3" },
    { label: "Settings", href: "/dashboard/settings", icon: "Settings" },
    { label: "Billing", href: "/dashboard/billing", icon: "CreditCard" },
];

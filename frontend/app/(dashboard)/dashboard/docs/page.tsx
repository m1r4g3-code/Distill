"use client";

import { useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { cn } from "@/lib/utils";
import {
    BookOpen,
    Key,
    Globe,
    AlertCircle,
    FileText,
    Search,
    Bot,
    Clock,
    ChevronRight,
} from "lucide-react";

const sections = [
    {
        group: "Introduction",
        items: [
            { id: "what-is-distill", label: "What is Distill", icon: BookOpen },
            { id: "authentication", label: "Authentication", icon: Key },
            { id: "base-url", label: "Base URL", icon: Globe },
            { id: "rate-limits", label: "Rate Limits", icon: Clock },
            { id: "error-codes", label: "Error Codes", icon: AlertCircle },
        ],
    },
    {
        group: "Endpoints",
        items: [
            { id: "scrape", label: "Scrape", icon: FileText },
            { id: "map", label: "Map", icon: Globe },
            { id: "search", label: "Search", icon: Search },
            { id: "agent-extract", label: "Agent Extract", icon: Bot },
        ],
    },
    {
        group: "Jobs",
        items: [
            { id: "job-lifecycle", label: "Job Lifecycle", icon: Clock },
            { id: "polling", label: "Polling", icon: Clock },
        ],
    },
    {
        group: "API Keys",
        items: [
            { id: "creating-keys", label: "Creating Keys", icon: Key },
            { id: "revoking-keys", label: "Revoking Keys", icon: Key },
        ],
    },
];

const codeTabs = ["curl", "python", "javascript"] as const;

type CodeLang = (typeof codeTabs)[number];

const endpointDocs: Record<
    string,
    {
        title: string;
        method: string;
        path: string;
        description: string;
        params: { name: string; type: string; required: boolean; desc: string }[];
        examples: Record<CodeLang, string>;
        response: string;
    }
> = {
    scrape: {
        title: "Scrape",
        method: "POST",
        path: "/api/v1/scrape",
        description:
            "Synchronously scrape textual content and metadata from a given URL. Auto-detects JavaScript rendering requirements.",
        params: [
            { name: "url", type: "string", required: true, desc: "The URL to scrape" },
            { name: "respect_robots", type: "boolean", required: false, desc: "Check robots.txt before scraping" },
            { name: "use_playwright", type: '"auto"|"always"|"never"', required: false, desc: "JS rendering mode" },
            { name: "include_links", type: "boolean", required: false, desc: "Extract internal and external links" },
            { name: "include_raw_html", type: "boolean", required: false, desc: "Include raw HTML in response" },
            { name: "timeout_ms", type: "integer", required: false, desc: "Page load timeout (1000-60000)" },
            { name: "cache_ttl_seconds", type: "integer|null", required: false, desc: "Override default cache TTL" },
            { name: "force_refresh", type: "boolean", required: false, desc: "Bypass cache entirely" },
        ],
        examples: {
            curl: `curl -X POST https://api.distill.dev/api/v1/scrape \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://openai.com/research/gpt-4",
    "include_links": true
  }'`,
            python: `import requests

response = requests.post(
    "https://api.distill.dev/api/v1/scrape",
    headers={"X-API-Key": "sk_your_key"},
    json={
        "url": "https://openai.com/research/gpt-4",
        "include_links": True
    }
)
data = response.json()
print(data["markdown"])`,
            javascript: `const response = await fetch("https://api.distill.dev/api/v1/scrape", {
  method: "POST",
  headers: {
    "X-API-Key": "sk_your_key",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    url: "https://openai.com/research/gpt-4",
    include_links: true
  })
});
const data = await response.json();
console.log(data.markdown);`,
        },
        response: `{
  "url": "https://openai.com/research/gpt-4",
  "canonical_url": "https://openai.com/research/gpt-4",
  "status_code": 200,
  "title": "GPT-4 — OpenAI Research",
  "markdown": "# GPT-4\\n\\nGPT-4 is OpenAI's most advanced system...",
  "metadata": {
    "description": "GPT-4 overview",
    "word_count": 1247,
    "read_time_minutes": 6,
    "fetch_duration_ms": 342,
    "renderer": "httpx"
  },
  "links": {
    "internal": ["https://openai.com/research"],
    "external": ["https://arxiv.org/abs/2303.08774"]
  },
  "cached": false,
  "cache_layer": "none",
  "request_id": "req_abc123"
}`,
    },
    map: {
        title: "Map",
        method: "POST",
        path: "/api/v1/map",
        description:
            "Enqueue an asynchronous job to crawl a website starting from the seed URL. Respects robots.txt and discovers internal links up to max_depth.",
        params: [
            { name: "url", type: "string", required: true, desc: "The seed URL to begin mapping from" },
            { name: "max_depth", type: "integer", required: false, desc: "Maximum link-hop depth (0-5)" },
            { name: "max_pages", type: "integer", required: false, desc: "Maximum pages to index (1-1000)" },
            { name: "respect_robots", type: "boolean", required: false, desc: "Adhere to robots.txt" },
            { name: "use_playwright", type: '"auto"|"always"|"never"', required: false, desc: "JS rendering mode" },
            { name: "timeout_ms", type: "integer", required: false, desc: "Timeout per page fetch" },
            { name: "concurrency", type: "integer", required: false, desc: "Max concurrent connections (1-10)" },
        ],
        examples: {
            curl: `curl -X POST https://api.distill.dev/api/v1/map \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://docs.python.org/3/", "max_depth": 2, "max_pages": 50}'`,
            python: `import requests

response = requests.post(
    "https://api.distill.dev/api/v1/map",
    headers={"X-API-Key": "sk_your_key"},
    json={"url": "https://docs.python.org/3/", "max_depth": 2}
)
job = response.json()
print(f"Job {job['job_id']} — {job['status']}")`,
            javascript: `const response = await fetch("https://api.distill.dev/api/v1/map", {
  method: "POST",
  headers: {
    "X-API-Key": "sk_your_key",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ url: "https://docs.python.org/3/", max_depth: 2 })
});
const job = await response.json();`,
        },
        response: `{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "request_id": "req_map_001"
}`,
    },
    search: {
        title: "Search",
        method: "POST",
        path: "/api/v1/search",
        description: "Execute a web search using configured upstream providers and return normalized results.",
        params: [
            { name: "query", type: "string", required: true, desc: "The search query" },
            { name: "num_results", type: "integer", required: false, desc: "Number of results (1-20)" },
            { name: "scrape_top_n", type: "integer", required: false, desc: "Scrape top N results (0-10)" },
            { name: "search_type", type: '"search"|"news"', required: false, desc: "Type of search" },
        ],
        examples: {
            curl: `curl -X POST https://api.distill.dev/api/v1/search \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "AI breakthroughs 2025", "num_results": 5}'`,
            python: `import requests

response = requests.post(
    "https://api.distill.dev/api/v1/search",
    headers={"X-API-Key": "sk_your_key"},
    json={"query": "AI breakthroughs 2025", "num_results": 5}
)
for result in response.json()["results"]:
    print(f"{result['rank']}. {result['title']}")`,
            javascript: `const response = await fetch("https://api.distill.dev/api/v1/search", {
  method: "POST",
  headers: {
    "X-API-Key": "sk_your_key",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ query: "AI breakthroughs 2025", num_results: 5 })
});
const data = await response.json();`,
        },
        response: `{
  "query": "AI breakthroughs 2025",
  "results": [
    {
      "rank": 1,
      "title": "State of AI 2025",
      "url": "https://hai.stanford.edu/...",
      "snippet": "The annual AI Index report..."
    }
  ],
  "request_id": "req_search_001"
}`,
    },
    "agent-extract": {
        title: "Agent Extract",
        method: "POST",
        path: "/api/v1/agent/extract",
        description:
            "Dispatch an AI agent to perform intelligent structured data extraction using natural language prompts.",
        params: [
            { name: "url", type: "string", required: true, desc: "The URL to extract data from" },
            { name: "prompt", type: "string", required: true, desc: "Natural language extraction instruction" },
            { name: "schema_definition", type: "object|null", required: false, desc: "JSON Schema for structured output" },
            { name: "use_playwright", type: '"auto"|"always"|"never"', required: false, desc: "JS rendering mode" },
            { name: "timeout_ms", type: "integer", required: false, desc: "Timeout (1000-60000)" },
        ],
        examples: {
            curl: `curl -X POST https://api.distill.dev/api/v1/agent/extract \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://en.wikipedia.org/wiki/Web_scraping",
    "prompt": "Extract the main definition in two sentences"
  }'`,
            python: `import requests

response = requests.post(
    "https://api.distill.dev/api/v1/agent/extract",
    headers={"X-API-Key": "sk_your_key"},
    json={
        "url": "https://en.wikipedia.org/wiki/Web_scraping",
        "prompt": "Extract the main definition"
    }
)
job = response.json()
print(f"Job ID: {job['job_id']}")`,
            javascript: `const response = await fetch("https://api.distill.dev/api/v1/agent/extract", {
  method: "POST",
  headers: {
    "X-API-Key": "sk_your_key",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    url: "https://en.wikipedia.org/wiki/Web_scraping",
    prompt: "Extract the main definition"
  })
});
const job = await response.json();`,
        },
        response: `{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "request_id": "req_agent_001"
}`,
    },
};

export default function DocsPage() {
    const [activeSection, setActiveSection] = useState("what-is-distill");
    const [codeLang, setCodeLang] = useState<CodeLang>("curl");

    const currentEndpoint = endpointDocs[activeSection];

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex gap-0 min-h-[calc(100vh-8rem)]">
                {/* Left Sidebar */}
                <aside className="w-56 shrink-0 border-r border-border pr-4 hidden md:block sticky top-20 self-start max-h-[calc(100vh-8rem)] overflow-y-auto">
                    <nav className="space-y-6 py-2">
                        {sections.map((section) => (
                            <div key={section.group}>
                                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                                    {section.group}
                                </h3>
                                <ul className="space-y-0.5">
                                    {section.items.map((item) => (
                                        <li key={item.id}>
                                            <button
                                                onClick={() => setActiveSection(item.id)}
                                                className={cn(
                                                    "flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer text-left",
                                                    activeSection === item.id
                                                        ? "bg-accent-subtle text-text-primary font-medium"
                                                        : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                                                )}
                                            >
                                                <item.icon size={14} />
                                                {item.label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </nav>
                </aside>

                {/* Center Content */}
                <div className="flex-1 px-6 lg:px-10 max-w-3xl">
                    {activeSection === "what-is-distill" && (
                        <div className="space-y-6">
                            <h1 className="text-3xl font-bold text-text-primary">
                                What is Distill?
                            </h1>
                            <p className="text-text-secondary leading-relaxed">
                                Distill is a scalable web extraction and intelligence engine. It provides a
                                RESTful API for high-speed URL content extraction, website architecture
                                discovery, web search integration, and AI-powered structured data extraction.
                            </p>
                            <GlassCard>
                                <h3 className="font-semibold text-text-primary mb-2">Core Capabilities</h3>
                                <ul className="space-y-2 text-sm text-text-secondary">
                                    <li className="flex items-start gap-2">
                                        <ChevronRight size={14} className="mt-0.5 text-text-muted" />
                                        <span><strong>Scrape</strong> — Extract clean markdown from any URL with auto JS detection</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <ChevronRight size={14} className="mt-0.5 text-text-muted" />
                                        <span><strong>Map</strong> — Crawl entire websites with BFS and discover all pages</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <ChevronRight size={14} className="mt-0.5 text-text-muted" />
                                        <span><strong>Search</strong> — Web search with optional content scraping</span>
                                    </li>
                                    <li className="flex items-start gap-2">
                                        <ChevronRight size={14} className="mt-0.5 text-text-muted" />
                                        <span><strong>Agent Extract</strong> — Gemini-powered structured data extraction</span>
                                    </li>
                                </ul>
                            </GlassCard>
                        </div>
                    )}

                    {activeSection === "authentication" && (
                        <div className="space-y-6">
                            <h1 className="text-3xl font-bold text-text-primary">Authentication</h1>
                            <p className="text-text-secondary leading-relaxed">
                                All API requests require an API key passed via the <code className="px-1.5 py-0.5 rounded bg-surface-elevated font-mono text-xs">X-API-Key</code> header.
                            </p>
                            <CodeBlock
                                code={`curl -H "X-API-Key: sk_your_key" https://api.distill.dev/api/v1/scrape`}
                                language="bash"
                            />
                        </div>
                    )}

                    {activeSection === "base-url" && (
                        <div className="space-y-6">
                            <h1 className="text-3xl font-bold text-text-primary">Base URL</h1>
                            <p className="text-text-secondary">All API endpoints use the following base URL:</p>
                            <CodeBlock code="https://api.distill.dev/api/v1" language="text" />
                        </div>
                    )}

                    {activeSection === "rate-limits" && (
                        <div className="space-y-6">
                            <h1 className="text-3xl font-bold text-text-primary">Rate Limits</h1>
                            <p className="text-text-secondary leading-relaxed">
                                Rate limits are applied per API key using a sliding window of 60 seconds.
                                The default limit is 60 requests per minute. Contact us for higher limits.
                            </p>
                            <GlassCard>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-text-muted border-b border-border-subtle">
                                            <th className="pb-2 font-medium">Header</th>
                                            <th className="pb-2 font-medium">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-text-secondary">
                                        <tr className="border-b border-border-subtle">
                                            <td className="py-2 font-mono text-xs">429 Too Many Requests</td>
                                            <td className="py-2">Rate limit exceeded</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </GlassCard>
                        </div>
                    )}

                    {activeSection === "error-codes" && (
                        <div className="space-y-6">
                            <h1 className="text-3xl font-bold text-text-primary">Error Codes</h1>
                            <p className="text-text-secondary">All errors follow a standard format:</p>
                            <CodeBlock
                                code={`{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "URL must start with http:// or https://",
    "request_id": "req_abc123",
    "details": {}
  }
}`}
                                language="json"
                            />
                            <GlassCard>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-text-muted border-b border-border-subtle">
                                            <th className="pb-2 font-medium">Code</th>
                                            <th className="pb-2 font-medium">HTTP</th>
                                            <th className="pb-2 font-medium">Description</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-text-secondary divide-y divide-border-subtle">
                                        <tr><td className="py-2 font-mono text-xs">UNAUTHORIZED</td><td className="py-2">401</td><td className="py-2">Missing or invalid API key</td></tr>
                                        <tr><td className="py-2 font-mono text-xs">FORBIDDEN</td><td className="py-2">403</td><td className="py-2">Missing required scope</td></tr>
                                        <tr><td className="py-2 font-mono text-xs">SSRF_BLOCKED</td><td className="py-2">403</td><td className="py-2">URL targets internal network</td></tr>
                                        <tr><td className="py-2 font-mono text-xs">ROBOTS_BLOCKED</td><td className="py-2">403</td><td className="py-2">robots.txt disallows URL</td></tr>
                                        <tr><td className="py-2 font-mono text-xs">RATE_LIMITED</td><td className="py-2">429</td><td className="py-2">Rate limit exceeded</td></tr>
                                        <tr><td className="py-2 font-mono text-xs">VALIDATION_ERROR</td><td className="py-2">422</td><td className="py-2">Invalid request parameters</td></tr>
                                        <tr><td className="py-2 font-mono text-xs">FETCH_TIMEOUT</td><td className="py-2">504</td><td className="py-2">Target URL timed out</td></tr>
                                        <tr><td className="py-2 font-mono text-xs">FETCH_ERROR</td><td className="py-2">502</td><td className="py-2">Failed to fetch URL</td></tr>
                                        <tr><td className="py-2 font-mono text-xs">INTERNAL_ERROR</td><td className="py-2">500</td><td className="py-2">Unexpected server error</td></tr>
                                    </tbody>
                                </table>
                            </GlassCard>
                        </div>
                    )}

                    {/* Endpoint docs */}
                    {currentEndpoint && (
                        <div className="space-y-8">
                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="px-2.5 py-1 rounded-lg bg-success/15 text-success font-mono font-medium text-xs">
                                        {currentEndpoint.method}
                                    </span>
                                    <code className="text-sm font-mono text-text-secondary">
                                        {currentEndpoint.path}
                                    </code>
                                </div>
                                <h1 className="text-3xl font-bold text-text-primary mb-2">
                                    {currentEndpoint.title}
                                </h1>
                                <p className="text-text-secondary leading-relaxed">
                                    {currentEndpoint.description}
                                </p>
                            </div>

                            {/* Params table */}
                            <div>
                                <h2 className="text-lg font-semibold text-text-primary mb-3">Parameters</h2>
                                <GlassCard className="p-0 overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-left text-text-muted text-xs uppercase border-b border-border-subtle">
                                                <th className="px-4 py-2.5 font-medium">Name</th>
                                                <th className="px-4 py-2.5 font-medium">Type</th>
                                                <th className="px-4 py-2.5 font-medium">Required</th>
                                                <th className="px-4 py-2.5 font-medium">Description</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border-subtle">
                                            {currentEndpoint.params.map((p) => (
                                                <tr key={p.name}>
                                                    <td className="px-4 py-2.5 font-mono text-xs text-text-primary">
                                                        {p.name}
                                                    </td>
                                                    <td className="px-4 py-2.5 font-mono text-xs text-text-muted">
                                                        {p.type}
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {p.required ? (
                                                            <span className="text-xs text-warning font-medium">Yes</span>
                                                        ) : (
                                                            <span className="text-xs text-text-muted">No</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-text-secondary text-xs">
                                                        {p.desc}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </GlassCard>
                            </div>

                            {/* Code examples */}
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-lg font-semibold text-text-primary">Request Example</h2>
                                    <div className="flex gap-1 p-0.5 rounded-lg bg-surface-elevated">
                                        {codeTabs.map((tab) => (
                                            <button
                                                key={tab}
                                                onClick={() => setCodeLang(tab)}
                                                className={cn(
                                                    "px-3 py-1 rounded-md text-xs transition-colors cursor-pointer capitalize",
                                                    codeLang === tab
                                                        ? "bg-surface text-text-primary shadow-sm"
                                                        : "text-text-muted"
                                                )}
                                            >
                                                {tab}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <CodeBlock
                                    code={currentEndpoint.examples[codeLang]}
                                    language={codeLang === "curl" ? "bash" : codeLang}
                                />
                            </div>

                            {/* Response */}
                            <div>
                                <h2 className="text-lg font-semibold text-text-primary mb-3">Response</h2>
                                <CodeBlock
                                    code={currentEndpoint.response}
                                    language="json"
                                    showLineNumbers
                                />
                            </div>
                        </div>
                    )}

                    {/* Job lifecycle / polling / keys docs */}
                    {activeSection === "job-lifecycle" && (
                        <div className="space-y-6">
                            <h1 className="text-3xl font-bold text-text-primary">Job Lifecycle</h1>
                            <p className="text-text-secondary leading-relaxed">
                                Long-running operations (Map, Agent Extract) create background jobs.
                                Jobs progress through these states:
                            </p>
                            <div className="flex items-center gap-3 flex-wrap">
                                {["queued", "running", "completed", "failed", "cancelled"].map((s) => (
                                    <span key={s} className="px-3 py-1.5 rounded-lg bg-surface-elevated text-sm font-mono text-text-secondary">
                                        {s}
                                    </span>
                                ))}
                            </div>
                            <CodeBlock
                                code={`GET /api/v1/jobs/{job_id}\n\n// Response\n{\n  "job_id": "...",\n  "type": "map",\n  "status": "running",\n  "pages_discovered": 23,\n  "pages_total": 50\n}`}
                                language="json"
                            />
                        </div>
                    )}

                    {activeSection === "polling" && (
                        <div className="space-y-6">
                            <h1 className="text-3xl font-bold text-text-primary">Polling</h1>
                            <p className="text-text-secondary leading-relaxed">
                                Poll <code className="px-1 py-0.5 rounded bg-surface-elevated font-mono text-xs">GET /api/v1/jobs/{"{job_id}"}</code> every
                                2-5 seconds until status is <code className="px-1 py-0.5 rounded bg-surface-elevated font-mono text-xs">completed</code> or <code className="px-1 py-0.5 rounded bg-surface-elevated font-mono text-xs">failed</code>.
                                Then fetch results from <code className="px-1 py-0.5 rounded bg-surface-elevated font-mono text-xs">GET /api/v1/jobs/{"{job_id}"}/results</code>.
                            </p>
                        </div>
                    )}

                    {activeSection === "creating-keys" && (
                        <div className="space-y-6">
                            <h1 className="text-3xl font-bold text-text-primary">Creating API Keys</h1>
                            <p className="text-text-secondary leading-relaxed">
                                API keys are created via the admin endpoint. The raw key is returned only once upon creation.
                            </p>
                            <CodeBlock
                                code={`POST /api/v1/admin/keys\n-H "X-Admin-Key: your_admin_key"\n\n{\n  "name": "Production Key",\n  "scopes": ["scrape", "map", "agent"],\n  "rate_limit": 120\n}`}
                                language="bash"
                            />
                        </div>
                    )}

                    {activeSection === "revoking-keys" && (
                        <div className="space-y-6">
                            <h1 className="text-3xl font-bold text-text-primary">Revoking API Keys</h1>
                            <p className="text-text-secondary leading-relaxed">
                                Revoke a key by setting <code className="px-1 py-0.5 rounded bg-surface-elevated font-mono text-xs">is_active</code> to <code className="px-1 py-0.5 rounded bg-surface-elevated font-mono text-xs">false</code> via DELETE.
                                Revoked keys immediately stop working.
                            </p>
                            <CodeBlock
                                code={`DELETE /api/v1/admin/keys/{key_id}\n-H "X-Admin-Key: your_admin_key"`}
                                language="bash"
                            />
                        </div>
                    )}
                </div>

                {/* Right Code Panel — sticky */}
                <aside className="w-80 shrink-0 hidden xl:block border-l border-border pl-4 sticky top-20 self-start max-h-[calc(100vh-8rem)] overflow-y-auto">
                    <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                        Quick Reference
                    </h3>
                    <div className="space-y-4">
                        <GlassCard className="p-4 space-y-2">
                            <p className="text-xs font-medium text-text-secondary">Base URL</p>
                            <code className="text-xs font-mono text-text-primary block">
                                https://api.distill.dev/api/v1
                            </code>
                        </GlassCard>
                        <GlassCard className="p-4 space-y-2">
                            <p className="text-xs font-medium text-text-secondary">Authentication</p>
                            <code className="text-xs font-mono text-text-primary block">
                                X-API-Key: sk_your_key
                            </code>
                        </GlassCard>
                        <GlassCard className="p-4 space-y-2">
                            <p className="text-xs font-medium text-text-secondary">Endpoints</p>
                            <div className="space-y-1 text-xs font-mono text-text-muted">
                                <p>POST /scrape</p>
                                <p>POST /map</p>
                                <p>POST /search</p>
                                <p>POST /agent/extract</p>
                                <p>GET /jobs/{"{id}"}</p>
                                <p>GET /jobs/{"{id}"}/results</p>
                            </div>
                        </GlassCard>
                    </div>
                </aside>
            </div>
        </div>
    );
}

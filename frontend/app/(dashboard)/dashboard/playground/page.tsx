"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useAppStore } from "@/lib/store";
import { scrapeUrl, mapWebsite, searchWeb, agentExtract, getJobStatus, getJobResults } from "@/lib/api-client";
import type { PlaygroundTab } from "@/types/ui";
import { toast } from "sonner";
import {
    FileText,
    Globe,
    Search,
    Bot,
    Copy,
    Check,
    Terminal,
    AlertCircle,
} from "lucide-react";

const tabs: { id: PlaygroundTab; label: string; icon: React.ElementType }[] = [
    { id: "scrape", label: "Scrape", icon: FileText },
    { id: "map", label: "Map", icon: Globe },
    { id: "search", label: "Search", icon: Search },
    { id: "agent", label: "Agent Extract", icon: Bot },
];

/* ── Toggle Switch ── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button
            type="button"
            onClick={() => onChange(!checked)}
            className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 cursor-pointer ${checked ? "bg-accent" : "bg-border"
                }`}
        >
            <span
                className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-background transition-transform duration-200 shadow-sm"
                style={{ transform: checked ? "translateX(18px)" : "translateX(0)" }}
            />
        </button>
    );
}

export default function PlaygroundPage() {
    return (
        <Suspense
            fallback={
                <div className="flex items-center justify-center py-20">
                    <LoadingSpinner size="large" />
                </div>
            }
        >
            <PlaygroundContent />
        </Suspense>
    );
}

function PlaygroundContent() {
    const searchParams = useSearchParams();
    const initialTab = (searchParams.get("tab") as PlaygroundTab) || "scrape";
    const [activeTab, setActiveTab] = useState<PlaygroundTab>(initialTab);
    const [loading, setLoading] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [response, setResponse] = useState<Record<string, any> | null>(null);
    const [responseView, setResponseView] = useState<"markdown" | "json" | "raw">("json");
    const [copied, setCopied] = useState(false);
    const [codeLang, setCodeLang] = useState<"curl" | "python" | "javascript">("curl");
    const [codeCopied, setCodeCopied] = useState(false);
    const [duration, setDuration] = useState(0);
    const [pollingJobId, setPollingJobId] = useState<string | null>(null);
    const [pollingStatus, setPollingStatus] = useState<string>("");
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { apiKey, addTrackedJob, updateTrackedJob } = useAppStore();

    // Form states
    const [url, setUrl] = useState("https://example.com");
    const [usePlaywright, setUsePlaywright] = useState("auto");
    const [includeLinks, setIncludeLinks] = useState(false);
    const [includeImages, setIncludeImages] = useState(false);
    const [respectRobots, setRespectRobots] = useState(true);
    const [maxDepth, setMaxDepth] = useState(2);
    const [maxPages, setMaxPages] = useState(100);
    const [includeExternal, setIncludeExternal] = useState(false);
    const [query, setQuery] = useState("Latest AI research papers");
    const [numResults, setNumResults] = useState(5);
    const [scrapeResults, setScrapeResults] = useState(false);
    const [prompt, setPrompt] = useState("Extract the top 5 story titles and their URLs");
    const [schema, setSchema] = useState("");
    const [agentPlaywright, setAgentPlaywright] = useState("auto");

    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            if (pollingRef.current) clearInterval(pollingRef.current);
        };
    }, []);

    const handleTabChange = (tab: PlaygroundTab) => {
        setActiveTab(tab);
        setResponse(null);
        setPollingJobId(null);
        setPollingStatus("");
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    const startPolling = useCallback((jobId: string) => {
        setPollingJobId(jobId);
        setPollingStatus("queued");

        pollingRef.current = setInterval(async () => {
            try {
                const status = await getJobStatus(jobId, apiKey);
                setPollingStatus(status.status);
                updateTrackedJob(jobId, { status: status.status });

                if (status.status === "completed" || status.status === "failed") {
                    if (pollingRef.current) {
                        clearInterval(pollingRef.current);
                        pollingRef.current = null;
                    }
                    setLoading(false);

                    if (status.status === "completed") {
                        try {
                            const results = await getJobResults(jobId, apiKey);
                            setResponse(results);
                        } catch {
                            setResponse(status);
                        }
                    } else {
                        setResponse({
                            error: status.error?.message || "Job failed",
                            code: status.error?.code || "JOB_FAILED",
                        });
                    }
                }
            } catch (err) {
                // Don't stop polling on transient errors
                console.error("Polling error:", err);
            }
        }, 2000);
    }, [apiKey, updateTrackedJob]);

    const handleSubmit = async () => {
        if (!apiKey) {
            toast.error("No API key set. Please enter your API key.");
            return;
        }

        setLoading(true);
        setResponse(null);
        setPollingJobId(null);
        setPollingStatus("");
        const start = Date.now();

        try {
            switch (activeTab) {
                case "scrape": {
                    const result = await scrapeUrl({
                        url,
                        use_playwright: usePlaywright as "auto" | "always" | "never",
                        include_links: includeLinks,
                        respect_robots: respectRobots,
                    }, apiKey);
                    setDuration(Date.now() - start);
                    setResponse(result);
                    setLoading(false);
                    break;
                }
                case "map": {
                    const result = await mapWebsite({
                        url,
                        max_depth: maxDepth,
                        max_pages: maxPages,
                        respect_robots: respectRobots,
                    }, apiKey);
                    setDuration(Date.now() - start);
                    addTrackedJob({
                        jobId: result.job_id,
                        type: "map",
                        status: result.status,
                        createdAt: new Date().toISOString(),
                        url,
                    });
                    toast.success(`Map job started: ${result.job_id.slice(0, 8)}...`);
                    startPolling(result.job_id);
                    break;
                }
                case "search": {
                    const result = await searchWeb({
                        query,
                        num_results: numResults,
                    }, apiKey);
                    setDuration(Date.now() - start);
                    setResponse(result);
                    setLoading(false);
                    break;
                }
                case "agent": {
                    const params: Parameters<typeof agentExtract>[0] = {
                        url,
                        prompt,
                        use_playwright: agentPlaywright as "auto" | "always" | "never",
                    };
                    if (schema.trim()) {
                        try {
                            params.schema_definition = JSON.parse(schema);
                        } catch {
                            toast.error("Invalid JSON schema");
                            setLoading(false);
                            return;
                        }
                    }
                    const result = await agentExtract(params, apiKey);
                    setDuration(Date.now() - start);
                    addTrackedJob({
                        jobId: result.job_id,
                        type: "agent_extract",
                        status: result.status,
                        createdAt: new Date().toISOString(),
                        url,
                    });
                    toast.success(`Agent job started: ${result.job_id.slice(0, 8)}...`);
                    startPolling(result.job_id);
                    break;
                }
            }
        } catch (err) {
            setDuration(Date.now() - start);
            setResponse({
                error: err instanceof Error ? err.message : "Unknown error",
                code: (err as { code?: string })?.code || "UNKNOWN",
            });
            setLoading(false);
        }
    };

    const handleCopyResponse = () => {
        navigator.clipboard.writeText(JSON.stringify(response, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyCode = () => {
        navigator.clipboard.writeText(generateCode(codeLang));
        setCodeCopied(true);
        setTimeout(() => setCodeCopied(false), 2000);
    };

    const generateCode = (lang: "curl" | "python" | "javascript") => {
        const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        if (activeTab === "scrape") {
            if (lang === "curl")
                return `curl -X POST ${baseUrl}/api/v1/scrape \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "url": "${url}",\n    "use_playwright": "${usePlaywright}",\n    "include_links": ${includeLinks},\n    "respect_robots": ${respectRobots}\n  }'`;
            if (lang === "python")
                return `import requests\n\nresponse = requests.post(\n    "${baseUrl}/api/v1/scrape",\n    headers={"X-API-Key": "YOUR_API_KEY"},\n    json={\n        "url": "${url}",\n        "use_playwright": "${usePlaywright}",\n        "include_links": ${includeLinks ? "True" : "False"},\n    }\n)\nprint(response.json())`;
            return `const response = await fetch("${baseUrl}/api/v1/scrape", {\n  method: "POST",\n  headers: {\n    "X-API-Key": "YOUR_API_KEY",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    url: "${url}",\n    use_playwright: "${usePlaywright}",\n    include_links: ${includeLinks}\n  })\n});\nconst data = await response.json();`;
        }
        if (activeTab === "map") {
            if (lang === "curl")
                return `curl -X POST ${baseUrl}/api/v1/map \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "url": "${url}",\n    "max_depth": ${maxDepth},\n    "max_pages": ${maxPages}\n  }'`;
            if (lang === "python")
                return `import requests\n\nresponse = requests.post(\n    "${baseUrl}/api/v1/map",\n    headers={"X-API-Key": "YOUR_API_KEY"},\n    json={\n        "url": "${url}",\n        "max_depth": ${maxDepth},\n        "max_pages": ${maxPages},\n    }\n)\njob = response.json()\nprint(f"Job {job['job_id']} — {job['status']}")`;
            return `const response = await fetch("${baseUrl}/api/v1/map", {\n  method: "POST",\n  headers: {\n    "X-API-Key": "YOUR_API_KEY",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    url: "${url}",\n    max_depth: ${maxDepth},\n    max_pages: ${maxPages}\n  })\n});\nconst job = await response.json();`;
        }
        if (activeTab === "search") {
            if (lang === "curl")
                return `curl -X POST ${baseUrl}/api/v1/search \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "query": "${query}",\n    "num_results": ${numResults}\n  }'`;
            if (lang === "python")
                return `import requests\n\nresponse = requests.post(\n    "${baseUrl}/api/v1/search",\n    headers={"X-API-Key": "YOUR_API_KEY"},\n    json={\n        "query": "${query}",\n        "num_results": ${numResults},\n    }\n)\nfor r in response.json()["results"]:\n    print(f"{r['rank']}. {r['title']}")`;
            return `const response = await fetch("${baseUrl}/api/v1/search", {\n  method: "POST",\n  headers: {\n    "X-API-Key": "YOUR_API_KEY",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    query: "${query}",\n    num_results: ${numResults}\n  })\n});\nconst data = await response.json();`;
        }
        // agent
        if (lang === "curl")
            return `curl -X POST ${baseUrl}/api/v1/agent/extract \\\n  -H "X-API-Key: YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "url": "${url}",\n    "prompt": "${prompt}",\n    "use_playwright": "${agentPlaywright}"\n  }'`;
        if (lang === "python")
            return `import requests\n\nresponse = requests.post(\n    "${baseUrl}/api/v1/agent/extract",\n    headers={"X-API-Key": "YOUR_API_KEY"},\n    json={\n        "url": "${url}",\n        "prompt": "${prompt}",\n        "use_playwright": "${agentPlaywright}",\n    }\n)\njob = response.json()\nprint(f"Job ID: {job['job_id']}")`;
        return `const response = await fetch("${baseUrl}/api/v1/agent/extract", {\n  method: "POST",\n  headers: {\n    "X-API-Key": "YOUR_API_KEY",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    url: "${url}",\n    prompt: "${prompt}",\n    use_playwright: "${agentPlaywright}"\n  })\n});\nconst job = await response.json();`;
    };

    const hasError = response && "error" in response;
    const hasMarkdown = response && "markdown" in response;
    const isPolling = pollingJobId && loading;

    return (
        <div className="flex flex-col" style={{ height: "calc(100vh - 64px)" }}>
            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl w-fit mx-6 mt-2 mb-3 bg-surface-elevated">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer border ${activeTab === tab.id
                                ? "text-text-primary font-medium bg-surface border-border shadow-sm"
                                : "text-text-muted hover:text-text-secondary border-transparent"
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Split panels */}
            <div className="flex flex-1 min-h-0 mx-6 mb-4 gap-0 overflow-hidden rounded-2xl border border-border">
                {/* Left Panel — Form */}
                <div className="w-[45%] overflow-y-auto p-6 space-y-5 border-r border-border-subtle bg-glass-bg">
                    <p className="text-xs font-medium uppercase tracking-widest text-text-muted">
                        {activeTab.replace("_", " ")} Configuration
                    </p>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            {activeTab === "scrape" && (
                                <>
                                    <FieldBlock label="URL">
                                        <GlassInput type="url" value={url} onChange={setUrl} placeholder="https://example.com" />
                                    </FieldBlock>
                                    <FieldBlock label="JavaScript rendering">
                                        <GlassSelect value={usePlaywright} onChange={setUsePlaywright} options={[
                                            { value: "auto", label: "Auto" },
                                            { value: "always", label: "Always" },
                                            { value: "never", label: "Never" },
                                        ]} />
                                    </FieldBlock>
                                    <ToggleRow label="Include links" checked={includeLinks} onChange={setIncludeLinks} />
                                    <ToggleRow label="Include images" checked={includeImages} onChange={setIncludeImages} />
                                    <ToggleRow label="Respect robots.txt" checked={respectRobots} onChange={setRespectRobots} />
                                </>
                            )}
                            {activeTab === "map" && (
                                <>
                                    <FieldBlock label="URL">
                                        <GlassInput type="url" value={url} onChange={setUrl} placeholder="https://docs.example.com" />
                                    </FieldBlock>
                                    <div className="grid grid-cols-2 gap-3">
                                        <FieldBlock label="Max Depth">
                                            <GlassInput type="number" value={String(maxDepth)} onChange={(v) => setMaxDepth(Number(v))} min={1} max={10} />
                                        </FieldBlock>
                                        <FieldBlock label="Max Pages">
                                            <GlassInput type="number" value={String(maxPages)} onChange={(v) => setMaxPages(Number(v))} min={1} max={1000} />
                                        </FieldBlock>
                                    </div>
                                    <ToggleRow label="Include external links" checked={includeExternal} onChange={setIncludeExternal} />
                                    <ToggleRow label="Respect robots.txt" checked={respectRobots} onChange={setRespectRobots} />
                                </>
                            )}
                            {activeTab === "search" && (
                                <>
                                    <FieldBlock label="Query">
                                        <GlassInput type="text" value={query} onChange={setQuery} placeholder="Latest AI research papers" />
                                    </FieldBlock>
                                    <FieldBlock label="Number of results">
                                        <GlassInput type="number" value={String(numResults)} onChange={(v) => setNumResults(Number(v))} min={1} max={10} />
                                    </FieldBlock>
                                    <ToggleRow label="Scrape results" checked={scrapeResults} onChange={setScrapeResults} />
                                </>
                            )}
                            {activeTab === "agent" && (
                                <>
                                    <FieldBlock label="URL">
                                        <GlassInput type="url" value={url} onChange={setUrl} placeholder="https://example.com" />
                                    </FieldBlock>
                                    <FieldBlock label="Prompt">
                                        <GlassTextarea value={prompt} onChange={setPrompt} rows={4} placeholder="Extract the top 5 story titles and their URLs" />
                                    </FieldBlock>
                                    <FieldBlock label="Schema (optional)">
                                        <GlassTextarea value={schema} onChange={setSchema} rows={6} placeholder={'{\n  "type": "object",\n  "properties": {\n    "stories": { "type": "array" }\n  }\n}'} mono />
                                    </FieldBlock>
                                    <FieldBlock label="JavaScript rendering">
                                        <GlassSelect value={agentPlaywright} onChange={setAgentPlaywright} options={[
                                            { value: "auto", label: "Auto" },
                                            { value: "always", label: "Always" },
                                            { value: "never", label: "Never" },
                                        ]} />
                                    </FieldBlock>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {/* Run button */}
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="btn-neumorphic w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {loading ? (<><LoadingSpinner size="small" /> Running...</>) : "Run"}
                    </button>

                    {(activeTab === "map" || activeTab === "agent") && (
                        <p className="text-xs text-text-muted italic">
                            {activeTab === "map" ? "Map" : "Agent"} jobs are async — results will appear when complete
                        </p>
                    )}

                    {/* Code snippet */}
                    <div className="pt-3 border-t border-border-subtle space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex gap-1 p-0.5 rounded-lg bg-surface-elevated">
                                {(["curl", "python", "javascript"] as const).map((l) => (
                                    <button
                                        key={l}
                                        onClick={() => setCodeLang(l)}
                                        className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer ${codeLang === l ? "bg-surface text-text-primary shadow-sm" : "text-text-muted"
                                            }`}
                                    >
                                        {l}
                                    </button>
                                ))}
                            </div>
                            <button onClick={handleCopyCode} className="p-1.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
                                {codeCopied ? <Check size={14} /> : <Copy size={14} />}
                            </button>
                        </div>
                        <pre className="p-3 rounded-lg text-xs leading-relaxed overflow-x-auto bg-surface-elevated border border-border-subtle text-text-secondary font-mono">
                            {generateCode(codeLang)}
                        </pre>
                    </div>
                </div>

                {/* Right Panel — Response */}
                <div className="w-[55%] overflow-y-auto flex flex-col bg-background">
                    {!loading && !response && !isPolling && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center space-y-3">
                                <Terminal size={48} className="mx-auto text-text-muted opacity-40" />
                                <p className="text-text-secondary font-medium">Ready to run</p>
                                <p className="text-xs text-text-muted">Configure your request and click Run</p>
                            </div>
                        </div>
                    )}
                    {loading && !response && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center space-y-3">
                                <LoadingSpinner size="large" className="mx-auto" />
                                {isPolling ? (
                                    <>
                                        <p className="text-sm text-text-secondary font-medium">
                                            Job running...
                                        </p>
                                        <p className="text-xs text-text-muted font-mono">
                                            {pollingJobId?.slice(0, 12)}... — {pollingStatus}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm text-text-muted">Processing request...</p>
                                )}
                            </div>
                        </div>
                    )}
                    {!loading && response && (
                        <div className="flex flex-col flex-1">
                            <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle">
                                <div className="flex items-center gap-2">
                                    {hasError ? (
                                        <>
                                            <span className="w-2 h-2 rounded-full bg-error" />
                                            <span className="text-sm text-error font-medium">Failed</span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="w-2 h-2 rounded-full bg-success" />
                                            <span className="text-sm text-success font-medium">Success</span>
                                            <span className="text-xs text-text-muted font-mono">{duration}ms</span>
                                        </>
                                    )}
                                </div>
                                {!hasError && (
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1 p-0.5 rounded-lg bg-surface-elevated">
                                            {(hasMarkdown ? (["markdown", "json", "raw"] as const) : (["json", "raw"] as const)).map((view) => (
                                                <button
                                                    key={view}
                                                    onClick={() => setResponseView(view as typeof responseView)}
                                                    className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer capitalize ${responseView === view ? "bg-surface text-text-primary shadow-sm" : "text-text-muted"
                                                        }`}
                                                >
                                                    {view}
                                                </button>
                                            ))}
                                        </div>
                                        <button onClick={handleCopyResponse} className="p-1.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 overflow-auto p-5">
                                {hasError ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-error">
                                            <AlertCircle size={16} />
                                            <span className="text-sm font-medium">Error</span>
                                        </div>
                                        <p className="text-sm text-text-secondary font-mono">
                                            {response.code && <span className="text-text-muted">[{response.code}] </span>}
                                            {response.error}
                                        </p>
                                    </div>
                                ) : responseView === "markdown" && hasMarkdown ? (
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                                        {(response as { markdown: string }).markdown}
                                    </div>
                                ) : (
                                    <pre className="text-xs leading-relaxed text-text-secondary font-mono">
                                        {JSON.stringify(response, null, 2)}
                                    </pre>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── Sub-components ── */
function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">{label}</label>
            {children}
        </div>
    );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <div className="flex items-center justify-between py-1">
            <label className="text-sm text-text-secondary">{label}</label>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

function GlassInput({ type, value, onChange, placeholder, min, max }: {
    type: string; value: string; onChange: (v: string) => void; placeholder?: string; min?: number; max?: number;
}) {
    return (
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            min={min}
            max={max}
            className="w-full px-3.5 py-2.5 rounded-lg text-sm text-text-primary placeholder:text-text-muted outline-none transition-all duration-150 bg-glass-bg border border-glass-border focus:border-accent focus:ring-2 focus:ring-accent/10"
        />
    );
}

function GlassTextarea({ value, onChange, rows, placeholder, mono }: {
    value: string; onChange: (v: string) => void; rows: number; placeholder?: string; mono?: boolean;
}) {
    return (
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className={`w-full px-3.5 py-2.5 rounded-lg text-sm text-text-primary placeholder:text-text-muted outline-none transition-all duration-150 resize-none bg-glass-bg border border-glass-border focus:border-accent focus:ring-2 focus:ring-accent/10 ${mono ? "font-mono" : ""}`}
        />
    );
}

function GlassSelect({ value, onChange, options }: {
    value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg text-sm text-text-primary outline-none cursor-pointer bg-glass-bg border border-glass-border"
        >
            {options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
        </select>
    );
}

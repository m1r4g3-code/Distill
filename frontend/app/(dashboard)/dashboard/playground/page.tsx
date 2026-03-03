"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useAppStore } from "@/lib/store";
import { scrapeUrl, mapWebsite, searchWeb, agentExtract, getJob } from "@/lib/api-client";
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

// ─── Per-tab state ────────────────────────────────────────────────────────────
type TabState = {
    isRunning: boolean;
    result: Record<string, unknown> | null;
    error: string | null;
    duration: number;
    pollingJobId: string | null;
    pollingStatus: string;
};

const EMPTY_TAB: TabState = {
    isRunning: false, result: null, error: null,
    duration: 0, pollingJobId: null, pollingStatus: "",
};

const LS_KEY = "playground_results_v2";
const ONE_HOUR = 3_600_000;

function loadSaved(): Record<string, { result: Record<string, unknown>; timestamp: number }> {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; }
}
function saveTab(tab: string, result: Record<string, unknown>) {
    try {
        const all = loadSaved();
        all[tab] = { result, timestamp: Date.now() };
        localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
}
function clearTab(tab: string) {
    try {
        const all = loadSaved();
        delete all[tab];
        localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch { /* ignore */ }
}

function PlaygroundContent() {
    const searchParams = useSearchParams();
    const initialTab = (searchParams.get("tab") as PlaygroundTab) || "scrape";
    const [activeTab, setActiveTab] = useState<PlaygroundTab>(initialTab);

    const [tabStates, setTabStates] = useState<Record<string, TabState>>({
        scrape: { ...EMPTY_TAB },
        map: { ...EMPTY_TAB },
        search: { ...EMPTY_TAB },
        agent: { ...EMPTY_TAB },
    });
    const abortRefs = useRef<Record<string, AbortController>>({});
    const pollingTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

    const [responseView, setResponseView] = useState<"markdown" | "json" | "raw">("json");
    const [copied, setCopied] = useState(false);
    const [codeLang, setCodeLang] = useState<"curl" | "python" | "javascript">("curl");
    const [codeCopied, setCodeCopied] = useState(false);

    const { apiKey, addTrackedJob, updateTrackedJob } = useAppStore();

    // ── Form states ────────────────────────────────────────────────────────────
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

    // Restore saved results on mount (per-tab)
    useEffect(() => {
        const saved = loadSaved();
        setTabStates(prev => {
            const next = { ...prev };
            for (const [tab, data] of Object.entries(saved)) {
                if (Date.now() - data.timestamp < ONE_HOUR && tab in next) {
                    next[tab] = { ...EMPTY_TAB, result: data.result };
                }
            }
            return next;
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup all timers/controllers on unmount
    useEffect(() => {
        return () => {
            Object.values(pollingTimers.current).forEach(clearInterval);
            Object.values(abortRefs.current).forEach(c => c.abort());
        };
    }, []);

    const updateTab = useCallback((tab: string, update: Partial<TabState>) => {
        setTabStates(prev => ({ ...prev, [tab]: { ...prev[tab], ...update } }));
    }, []);

    const cancelTab = useCallback((tab: string) => {
        abortRefs.current[tab]?.abort();
        delete abortRefs.current[tab];
        if (pollingTimers.current[tab]) {
            clearInterval(pollingTimers.current[tab]);
            delete pollingTimers.current[tab];
        }
        updateTab(tab, { isRunning: false, pollingJobId: null, pollingStatus: "" });
    }, [updateTab]);

    // Tab switch NEVER cancels/resets other tabs
    const handleTabChange = (tab: PlaygroundTab) => setActiveTab(tab);

    const startPolling = useCallback((tab: string, jobId: string, controller: AbortController) => {
        updateTab(tab, { pollingJobId: jobId, pollingStatus: "queued" });

        pollingTimers.current[tab] = setInterval(async () => {
            if (controller.signal.aborted) {
                clearInterval(pollingTimers.current[tab]);
                delete pollingTimers.current[tab];
                return;
            }
            try {
                const job = await getJob(jobId, apiKey);
                updateTab(tab, { pollingStatus: job.status });
                updateTrackedJob(jobId, { status: job.status });

                if (job.status === "completed" || job.status === "failed") {
                    clearInterval(pollingTimers.current[tab]);
                    delete pollingTimers.current[tab];
                    delete abortRefs.current[tab];

                    if (job.status === "completed") {
                        const r = job.result_data || job.progress?.result || job.progress || {};
                        updateTab(tab, { isRunning: false, result: r, pollingJobId: null });
                        saveTab(tab, r);
                    } else {
                        updateTab(tab, {
                            isRunning: false,
                            error: job.error_message || "Job failed",
                            pollingJobId: null,
                        });
                    }
                }
            } catch (err) {
                console.error("Polling error:", err);
            }
        }, 3000);
    }, [apiKey, updateTab, updateTrackedJob]);

    const handleSubmit = async () => {
        if (!apiKey) {
            toast.error("No API key set. Go to API Keys to create one.");
            return;
        }

        const tab = activeTab;
        cancelTab(tab);
        clearTab(tab);

        const controller = new AbortController();
        abortRefs.current[tab] = controller;
        updateTab(tab, { isRunning: true, error: null, result: null, pollingJobId: null, pollingStatus: "" });
        const start = Date.now();

        try {
            switch (tab) {
                case "scrape": {
                    const result = await scrapeUrl({
                        url,
                        use_playwright: usePlaywright as "auto" | "always" | "never",
                        include_links: includeLinks,
                        respect_robots: respectRobots,
                    }, apiKey);
                    if (controller.signal.aborted) return;
                    const r = result as unknown as Record<string, unknown>;
                    updateTab(tab, { isRunning: false, result: r, duration: Date.now() - start });
                    saveTab(tab, r);
                    break;
                }
                case "map": {
                    const result = await mapWebsite({
                        url,
                        max_depth: maxDepth,
                        max_pages: maxPages,
                        respect_robots: respectRobots,
                    }, apiKey);
                    if (controller.signal.aborted) return;
                    updateTab(tab, { duration: Date.now() - start });
                    addTrackedJob({ jobId: result.job_id, type: "map", status: result.status, createdAt: new Date().toISOString(), url });
                    toast.success(`Map job started: ${result.job_id.slice(0, 8)}...`);
                    startPolling(tab, result.job_id, controller);
                    break;
                }
                case "search": {
                    const result = await searchWeb({ query, num_results: numResults }, apiKey);
                    if (controller.signal.aborted) return;
                    const r = result as unknown as Record<string, unknown>;
                    updateTab(tab, { isRunning: false, result: r, duration: Date.now() - start });
                    saveTab(tab, r);
                    break;
                }
                case "agent": {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const params: Parameters<typeof agentExtract>[0] = {
                        url,
                        prompt,
                        use_playwright: agentPlaywright as "auto" | "always" | "never",
                    };
                    if (schema.trim()) {
                        try { params.schema_definition = JSON.parse(schema); }
                        catch { toast.error("Invalid JSON schema"); updateTab(tab, { isRunning: false }); return; }
                    }
                    const result = await agentExtract(params, apiKey);
                    if (controller.signal.aborted) return;
                    updateTab(tab, { duration: Date.now() - start });
                    addTrackedJob({ jobId: result.job_id, type: "agent_extract", status: result.status, createdAt: new Date().toISOString(), url });
                    toast.success(`Agent job started: ${result.job_id.slice(0, 8)}...`);
                    startPolling(tab, result.job_id, controller);
                    break;
                }
            }
        } catch (err) {
            if (controller.signal.aborted) return;
            updateTab(tab, {
                isRunning: false,
                error: err instanceof Error ? err.message : "Unknown error",
                duration: Date.now() - start,
            });
        }
    };

    const cur = tabStates[activeTab];
    const hasError = cur.result && "error" in cur.result;
    const hasMarkdown = cur.result && "markdown" in cur.result;
    const isPolling = cur.isRunning && !!cur.pollingJobId;

    const handleCopyResponse = () => {
        navigator.clipboard.writeText(JSON.stringify(cur.result, null, 2));
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
                        {/* Activity dot on non-active running tabs */}
                        {tab.id !== activeTab && tabStates[tab.id]?.isRunning && (
                            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                        )}
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

                    {/* Run / Cancel */}
                    <div className="flex gap-2">
                        <button
                            onClick={handleSubmit}
                            disabled={cur.isRunning}
                            className="btn-neumorphic flex-1 py-3 rounded-lg text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {cur.isRunning ? (<><LoadingSpinner size="small" /> Running...</>) : "Run"}
                        </button>
                        {cur.isRunning && (
                            <button
                                onClick={() => cancelTab(activeTab)}
                                className="px-4 py-3 rounded-lg text-sm font-semibold border border-border text-text-muted hover:text-error hover:border-error transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                        )}
                    </div>

                    {(activeTab === "map" || activeTab === "agent") && (
                        <p className="text-xs text-text-muted italic">
                            {activeTab === "map" ? "Map" : "Agent"} jobs run in the background — you can switch tabs while waiting.
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
                    {!cur.isRunning && !cur.result && !cur.error && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center space-y-3">
                                <Terminal size={48} className="mx-auto text-text-muted opacity-40" />
                                <p className="text-text-secondary font-medium">Ready to run</p>
                                <p className="text-xs text-text-muted">Configure your request and click Run</p>
                            </div>
                        </div>
                    )}
                    {cur.isRunning && !cur.result && (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center space-y-3">
                                <LoadingSpinner size="large" className="mx-auto" />
                                {isPolling ? (
                                    <>
                                        <p className="text-sm text-text-secondary font-medium">Job running...</p>
                                        <p className="text-xs text-text-muted font-mono">
                                            {cur.pollingJobId?.slice(0, 12)}... — {cur.pollingStatus}
                                        </p>
                                    </>
                                ) : (
                                    <p className="text-sm text-text-muted">Processing request...</p>
                                )}
                            </div>
                        </div>
                    )}
                    {cur.error && !cur.result && (
                        <div className="flex-1 flex items-center justify-center p-6">
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-error">
                                    <AlertCircle size={16} />
                                    <span className="text-sm font-medium">Error</span>
                                </div>
                                <p className="text-sm text-text-secondary font-mono">{cur.error}</p>
                            </div>
                        </div>
                    )}
                    {!cur.isRunning && cur.result && (
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
                                            {cur.duration > 0 && <span className="text-xs text-text-muted font-mono">{cur.duration}ms</span>}
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
                                            {cur.result.code ? `[${String(cur.result.code)}] ` : ""}{String(cur.result.error)}
                                        </p>
                                    </div>
                                ) : responseView === "markdown" && hasMarkdown ? (
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                                        {(cur.result as { markdown: string }).markdown}
                                    </div>
                                ) : (
                                    <pre className="text-xs leading-relaxed text-text-secondary font-mono">
                                        {JSON.stringify(cur.result, null, 2)}
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

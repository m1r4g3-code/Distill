"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/shared/GlassCard";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { scrapeUrl, mapWebsite, searchWeb, agentExtract } from "@/lib/api-client";
import type { PlaygroundTab } from "@/types/ui";
import { FileText, Globe, Search, Bot, Send, Copy, Check } from "lucide-react";

const tabs: { id: PlaygroundTab; label: string; icon: React.ElementType }[] = [
    { id: "scrape", label: "Scrape", icon: FileText },
    { id: "map", label: "Map", icon: Globe },
    { id: "search", label: "Search", icon: Search },
    { id: "agent", label: "Agent Extract", icon: Bot },
];

export default function PlaygroundPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center py-20"><LoadingSpinner size="large" /></div>}>
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
    const [responseView, setResponseView] = useState<"rendered" | "json" | "code">("json");
    const [copied, setCopied] = useState(false);

    // Form states
    const [url, setUrl] = useState("https://openai.com/research/gpt-4");
    const [query, setQuery] = useState("Latest advancements in AI");
    const [prompt, setPrompt] = useState("Extract the main definition of the topic");
    const [maxDepth, setMaxDepth] = useState(2);
    const [maxPages, setMaxPages] = useState(100);
    const [numResults, setNumResults] = useState(5);

    const handleSubmit = async () => {
        setLoading(true);
        setResponse(null);
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let result: Record<string, any> | null = null;
            switch (activeTab) {
                case "scrape":
                    result = await scrapeUrl({ url });
                    break;
                case "map":
                    result = await mapWebsite({ url, max_depth: maxDepth, max_pages: maxPages });
                    break;
                case "search":
                    result = await searchWeb({ query, num_results: numResults });
                    break;
                case "agent":
                    result = await agentExtract({ url, prompt });
                    break;
            }
            setResponse(result);
        } catch (err) {
            setResponse({ error: err instanceof Error ? err.message : "Unknown error" });
        }
        setLoading(false);
    };

    const handleCopyResponse = () => {
        navigator.clipboard.writeText(JSON.stringify(response, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const generateCode = (lang: "curl" | "python" | "javascript") => {
        const baseUrl = "https://api.distill.dev/api/v1";
        if (activeTab === "scrape") {
            if (lang === "curl") return `curl -X POST ${baseUrl}/scrape \\\n  -H "X-API-Key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"url": "${url}"}'`;
            if (lang === "python") return `import requests\n\nresponse = requests.post(\n    "${baseUrl}/scrape",\n    headers={"X-API-Key": "YOUR_KEY"},\n    json={"url": "${url}"}\n)\nprint(response.json())`;
            return `const response = await fetch("${baseUrl}/scrape", {\n  method: "POST",\n  headers: {\n    "X-API-Key": "YOUR_KEY",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({ url: "${url}" })\n});\nconst data = await response.json();`;
        }
        if (activeTab === "search") {
            if (lang === "curl") return `curl -X POST ${baseUrl}/search \\\n  -H "X-API-Key: YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"query": "${query}", "num_results": ${numResults}}'`;
            if (lang === "python") return `import requests\n\nresponse = requests.post(\n    "${baseUrl}/search",\n    headers={"X-API-Key": "YOUR_KEY"},\n    json={"query": "${query}", "num_results": ${numResults}}\n)\nprint(response.json())`;
            return `const response = await fetch("${baseUrl}/search", {\n  method: "POST",\n  headers: {\n    "X-API-Key": "YOUR_KEY",\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({ query: "${query}", num_results: ${numResults} })\n});\nconst data = await response.json();`;
        }
        return `// Code generation for ${activeTab}`;
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-text-primary">Playground</h1>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-surface-elevated w-fit">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => {
                            setActiveTab(tab.id);
                            setResponse(null);
                        }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all duration-200 cursor-pointer ${activeTab === tab.id
                            ? "bg-surface text-text-primary font-medium shadow-sm"
                            : "text-text-muted hover:text-text-secondary"
                            }`}
                    >
                        <tab.icon size={16} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Main content */}
            <div className="grid lg:grid-cols-2 gap-6">
                {/* Left — Form */}
                <GlassCard className="space-y-4">
                    <h2 className="font-semibold text-text-primary capitalize">
                        {activeTab.replace("_", " ")} Configuration
                    </h2>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            {(activeTab === "scrape" || activeTab === "map" || activeTab === "agent") && (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-text-secondary">URL</label>
                                    <input
                                        type="url"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder="https://example.com"
                                        className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-muted text-sm font-mono outline-none focus:border-accent transition-colors"
                                    />
                                </div>
                            )}

                            {activeTab === "search" && (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-text-secondary">Query</label>
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="What to search for..."
                                        className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-muted text-sm outline-none focus:border-accent transition-colors"
                                    />
                                </div>
                            )}

                            {activeTab === "agent" && (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-text-secondary">Prompt</label>
                                    <textarea
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder="Describe what data to extract..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-muted text-sm outline-none focus:border-accent transition-colors resize-none"
                                    />
                                </div>
                            )}

                            {activeTab === "map" && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-text-secondary">Max Depth</label>
                                        <input
                                            type="number"
                                            value={maxDepth}
                                            onChange={(e) => setMaxDepth(Number(e.target.value))}
                                            min={0}
                                            max={5}
                                            className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary text-sm outline-none focus:border-accent transition-colors"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-text-secondary">Max Pages</label>
                                        <input
                                            type="number"
                                            value={maxPages}
                                            onChange={(e) => setMaxPages(Number(e.target.value))}
                                            min={1}
                                            max={1000}
                                            className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary text-sm outline-none focus:border-accent transition-colors"
                                        />
                                    </div>
                                </div>
                            )}

                            {activeTab === "search" && (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-text-secondary">Number of Results</label>
                                    <input
                                        type="number"
                                        value={numResults}
                                        onChange={(e) => setNumResults(Number(e.target.value))}
                                        min={1}
                                        max={20}
                                        className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary text-sm outline-none focus:border-accent transition-colors"
                                    />
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="btn-neumorphic text-sm flex items-center gap-2 disabled:opacity-60 w-full justify-center"
                    >
                        {loading ? <LoadingSpinner size="small" /> : <><Send size={14} /> Run</>}
                    </button>

                    {/* Code generator */}
                    {response && (
                        <div className="pt-4 border-t border-border-subtle space-y-3">
                            <h3 className="text-sm font-medium text-text-secondary">Get Code</h3>
                            <div className="space-y-2">
                                {(["curl", "python", "javascript"] as const).map((lang) => (
                                    <CodeBlock key={lang} code={generateCode(lang)} language={lang} className="text-xs" />
                                ))}
                            </div>
                        </div>
                    )}
                </GlassCard>

                {/* Right — Response Viewer */}
                <GlassCard className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-text-primary">Response</h2>
                        {response && (
                            <div className="flex items-center gap-2">
                                <div className="flex gap-1 p-0.5 rounded-lg bg-surface-elevated">
                                    {(["json", "rendered", "code"] as const).map((view) => (
                                        <button
                                            key={view}
                                            onClick={() => setResponseView(view)}
                                            className={`px-2.5 py-1 rounded-md text-xs transition-colors cursor-pointer capitalize ${responseView === view
                                                ? "bg-surface text-text-primary shadow-sm"
                                                : "text-text-muted"
                                                }`}
                                        >
                                            {view}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    onClick={handleCopyResponse}
                                    className="p-1.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                            </div>
                        )}
                    </div>

                    {loading && (
                        <div className="flex items-center justify-center py-20">
                            <div className="text-center space-y-3">
                                <LoadingSpinner size="large" className="mx-auto" />
                                <p className="text-sm text-text-muted">Processing request...</p>
                            </div>
                        </div>
                    )}

                    {!loading && !response && (
                        <div className="flex items-center justify-center py-20">
                            <p className="text-sm text-text-muted">
                                Submit a request to see the response here
                            </p>
                        </div>
                    )}

                    {!loading && response && (
                        <div className="overflow-auto max-h-[600px]">
                            {responseView === "json" && (
                                <CodeBlock
                                    code={JSON.stringify(response, null, 2)}
                                    language="json"
                                    showLineNumbers
                                    className="text-xs"
                                />
                            )}
                            {responseView === "rendered" && (
                                <div className="prose prose-sm dark:prose-invert max-w-none text-text-secondary">
                                    {typeof response === "object" && response !== null && "markdown" in response
                                        ? (
                                            <div className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                                                {(response as { markdown: string }).markdown}
                                            </div>
                                        )
                                        : <p className="text-text-muted">No rendered view available for this response type.</p>}
                                </div>
                            )}
                            {responseView === "code" && (
                                <div className="space-y-3">
                                    {(["curl", "python", "javascript"] as const).map((lang) => (
                                        <CodeBlock key={lang} code={generateCode(lang)} language={lang} className="text-xs" />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </GlassCard>
            </div>
        </div>
    );
}

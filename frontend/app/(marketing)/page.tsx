"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/shared/GlassCard";
import { BentoGrid, BentoCard } from "@/components/shared/BentoGrid";
import {
    FileText,
    Globe,
    Search,
    Bot,
    Zap,
    Shield,
    Clock,
    Hash,
    ArrowRight,
    Terminal,
    Code2,
    Github,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════════
   SYNTAX HIGHLIGHTER
   ══════════════════════════════════════════════════════════════════ */

function highlightSyntax(code: string): React.ReactNode[] {
    const lines = code.split("\n");
    return lines.map((line, lineIdx) => {
        const spans: React.ReactNode[] = [];
        let remaining = line;
        let key = 0;

        const push = (text: string, color: string) => {
            if (text) spans.push(<span key={`${lineIdx}-${key++}`} style={{ color }}>{text}</span>);
        };

        // Comment lines
        if (remaining.trimStart().startsWith("//")) {
            push(remaining, "rgba(255,255,255,0.3)");
            return <div key={lineIdx}>{spans}</div>;
        }

        // curl line
        if (remaining.trimStart().startsWith("curl")) {
            const indent = remaining.match(/^(\s*)/)?.[0] || "";
            remaining = remaining.trimStart();
            push(indent, "");
            push("curl ", "rgba(255,255,255,0.6)");
            remaining = remaining.slice(5);

            const methodMatch = remaining.match(/^-X\s+(POST|GET|PATCH|DELETE)\s+/);
            if (methodMatch) {
                push("-X ", "rgba(255,255,255,0.4)");
                push(methodMatch[1], "#FF5F57");
                push(" ", "");
                remaining = remaining.slice(methodMatch[0].length);
            }

            const urlMatch = remaining.match(/^(https?:\/\/[^\s\\]+)/);
            if (urlMatch) {
                push(urlMatch[1], "#28C840");
                remaining = remaining.slice(urlMatch[0].length);
            }

            if (remaining.trim() === "\\") {
                push(" \\", "rgba(255,255,255,0.3)");
                remaining = "";
            }

            if (remaining) push(remaining, "rgba(255,255,255,0.5)");
            return <div key={lineIdx}>{spans}</div>;
        }

        // -H "Header: value"
        const headerMatch = remaining.match(/^(\s*)(-H\s+)"([^"]+):\s*([^"]*)"(.*)$/);
        if (headerMatch) {
            const [, indent, flag, headerName, headerValue, rest] = headerMatch;
            push(indent, "");
            push(flag, "rgba(255,255,255,0.4)");
            push('"', "rgba(255,255,255,0.5)");
            push(headerName, "#FEBC2E");
            push(": ", "rgba(255,255,255,0.5)");
            push(headerValue, "#6EE7B7");
            push('"', "rgba(255,255,255,0.5)");
            if (rest.trim() === "\\") push(" \\", "rgba(255,255,255,0.3)");
            else if (rest) push(rest, "rgba(255,255,255,0.5)");
            return <div key={lineIdx}>{spans}</div>;
        }

        // -d flag
        if (remaining.trimStart().startsWith("-d")) {
            const indent2 = remaining.match(/^(\s*)/)?.[0] || "";
            remaining = remaining.trimStart();
            push(indent2, "");
            push("-d ", "rgba(255,255,255,0.4)");
            remaining = remaining.slice(3);
            push(remaining, "rgba(255,255,255,0.5)");
            return <div key={lineIdx}>{spans}</div>;
        }

        // JSON key-value
        const trimmed = remaining.trimStart();
        const indent = remaining.match(/^(\s*)/)?.[0] || "";

        const kvMatch = trimmed.match(/^"([^"]+)"(\s*:\s*)(.+)$/);
        if (kvMatch) {
            const [, jsonKey, colon, value] = kvMatch;
            push(indent, "");
            push('"', "rgba(255,255,255,0.5)");
            push(jsonKey, "#93C5FD");
            push('"', "rgba(255,255,255,0.5)");
            push(colon, "rgba(255,255,255,0.5)");

            let valStr = value;
            let trailing = "";
            if (valStr.endsWith(",")) {
                trailing = ",";
                valStr = valStr.slice(0, -1);
            }

            if (valStr.startsWith('"') && valStr.endsWith('"')) {
                push('"', "rgba(255,255,255,0.5)");
                push(valStr.slice(1, -1), "#6EE7B7");
                push('"', "rgba(255,255,255,0.5)");
            } else if (valStr === "true" || valStr === "false") {
                push(valStr, "#C084FC");
            } else if (valStr === "null") {
                push(valStr, "#C084FC");
            } else if (!isNaN(Number(valStr))) {
                push(valStr, "#F9A8D4");
            } else if (valStr === "{" || valStr === "[") {
                push(valStr, "rgba(255,255,255,0.5)");
            } else if (valStr.startsWith('"')) {
                push(valStr, "#6EE7B7");
            } else {
                push(valStr, "rgba(255,255,255,0.7)");
            }
            if (trailing) push(trailing, "rgba(255,255,255,0.5)");
            return <div key={lineIdx}>{spans}</div>;
        }

        // Brackets / braces
        if (/^[{}\[\]',]+$/.test(trimmed)) {
            push(indent, "");
            push(trimmed, "rgba(255,255,255,0.5)");
            return <div key={lineIdx}>{spans}</div>;
        }

        // Fallback
        push(remaining, "rgba(255,255,255,0.6)");
        return <div key={lineIdx}>{spans}</div>;
    });
}

/* ══════════════════════════════════════════════════════════════════
   TERMINAL CONTENT DATA
   ══════════════════════════════════════════════════════════════════ */

const terminalTabs = ["scrape", "map", "search", "agent"] as const;
type TerminalTab = (typeof terminalTabs)[number];

const terminalContent: Record<TerminalTab, string> = {
    scrape: `curl -X POST https://api.distill.dev/api/v1/scrape \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://openai.com/research",
    "use_playwright": "auto",
    "include_links": true
  }'

// Response preview:
{
  "success": true,
  "markdown": "# OpenAI Research\\n\\nOpenAI conducts...",
  "metadata": {
    "title": "OpenAI Research",
    "word_count": 1423,
    "cached": false
  },
  "request_id": "req_abc123"
}`,

    map: `curl -X POST https://api.distill.dev/api/v1/map \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://docs.anthropic.com",
    "max_depth": 2,
    "max_pages": 50
  }'

// Response:
{
  "job_id": "job_xyz789",
  "status": "queued",
  "type": "map",
  "pages_discovered": 0,
  "request_id": "req_def456"
}`,

    search: `curl -X POST https://api.distill.dev/api/v1/search \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "Latest AI breakthroughs 2025",
    "num_results": 5,
    "scrape_results": false
  }'

// Response:
{
  "results": [
    {
      "rank": 1,
      "title": "State of AI 2025",
      "url": "https://hai.stanford.edu/...",
      "snippet": "The annual AI Index..."
    }
  ],
  "request_id": "req_ghi789"
}`,

    agent: `curl -X POST https://api.distill.dev/api/v1/agent/extract \\
  -H "X-API-Key: sk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://news.ycombinator.com",
    "prompt": "Extract top 5 story titles and URLs",
    "schema_": {
      "type": "object",
      "properties": {
        "stories": {
          "type": "array"
        }
      }
    }
  }'

// Response:
{
  "job_id": "job_agent_001",
  "status": "queued",
  "type": "agent_extract",
  "request_id": "req_jkl012"
}`,
};

/* ══════════════════════════════════════════════════════════════════
   MACOS TERMINAL COMPONENT
   ══════════════════════════════════════════════════════════════════ */

function MacOSTerminal() {
    const [activeTab, setActiveTab] = useState<TerminalTab>("scrape");
    const [userClicked, setUserClicked] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const cycleTab = useCallback(() => {
        setActiveTab((prev) => {
            const idx = terminalTabs.indexOf(prev);
            return terminalTabs[(idx + 1) % terminalTabs.length];
        });
    }, []);

    useEffect(() => {
        if (userClicked) return;
        intervalRef.current = setInterval(cycleTab, 3000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [userClicked, cycleTab]);

    const handleTabClick = (tab: TerminalTab) => {
        setUserClicked(true);
        setActiveTab(tab);
        if (intervalRef.current) clearInterval(intervalRef.current);
    };

    return (
        <div
            className="w-full"
            style={{
                maxWidth: 780,
                overflow: "visible",
                background: "rgba(18, 18, 20, 0.95)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow:
                    "0 0 0 1px rgba(255,255,255,0.05), 0 20px 60px rgba(0,0,0,0.5), 0 0 80px rgba(255,255,255,0.02)",
            }}
        >
            {/* ── macOS Chrome Top Bar ── */}
            <div
                className="flex items-center"
                style={{
                    height: 40,
                    background: "rgba(255,255,255,0.03)",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    padding: "0 14px",
                }}
            >
                {/* Traffic lights */}
                <div className="flex items-center gap-2 shrink-0">
                    <div className="rounded-full" style={{ width: 12, height: 12, background: "#FF5F57" }} />
                    <div className="rounded-full" style={{ width: 12, height: 12, background: "#FEBC2E" }} />
                    <div className="rounded-full" style={{ width: 12, height: 12, background: "#28C840" }} />
                </div>

                {/* Tab bar */}
                <div className="flex-1 flex items-center justify-center gap-0">
                    {terminalTabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => handleTabClick(tab)}
                            className="relative px-4 py-2 cursor-pointer transition-colors duration-150"
                            style={{
                                fontFamily: "'IBM Plex Mono', 'Geist Mono', monospace",
                                fontSize: 12,
                                letterSpacing: "0.02em",
                                color: activeTab === tab ? "#FFFFFF" : "rgba(255,255,255,0.35)",
                                background: "none",
                                border: "none",
                            }}
                        >
                            {tab}
                            {activeTab === tab && (
                                <motion.div
                                    layoutId="terminal-tab-indicator"
                                    className="absolute bottom-0 left-1/2 -translate-x-1/2"
                                    style={{
                                        width: 20,
                                        height: 2,
                                        borderRadius: 1,
                                        background: "#FFFFFF",
                                    }}
                                    transition={{ duration: 0.2 }}
                                />
                            )}
                        </button>
                    ))}
                </div>

                {/* Spacer to balance traffic lights */}
                <div className="shrink-0" style={{ width: 52 }} />
            </div>

            {/* ── Code Content ── */}
            <div
                className="overflow-x-auto"
                style={{
                    padding: "20px 24px 32px",
                    minHeight: 200,
                    fontFamily: "'IBM Plex Mono', 'Geist Mono', monospace",
                    fontSize: 12.5,
                    lineHeight: 1.65,
                }}
            >
                <AnimatePresence mode="wait">
                    <motion.pre
                        key={activeTab}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="whitespace-pre"
                        style={{ margin: 0 }}
                    >
                        <code>{highlightSyntax(terminalContent[activeTab])}</code>
                    </motion.pre>
                </AnimatePresence>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════
   SOCIAL ICONS
   ══════════════════════════════════════════════════════════════════ */

function TwitterIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
    );
}

function DiscordIcon({ size = 20 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
        </svg>
    );
}

/* ══════════════════════════════════════════════════════════════════
   FRAMER MOTION VARIANTS
   ══════════════════════════════════════════════════════════════════ */

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
    }),
};

/* ══════════════════════════════════════════════════════════════════
   FOOTER DATA
   ══════════════════════════════════════════════════════════════════ */

const footerColumns = [
    {
        title: "Product",
        links: [
            { label: "Features", href: "#features" },
            { label: "Playground", href: "/dashboard/playground" },
            { label: "Docs", href: "/dashboard/docs" },
            { label: "Changelog", href: "#" },
        ],
    },
    {
        title: "Developers",
        links: [
            { label: "API Reference", href: "/dashboard/docs" },
            { label: "Python SDK", href: "#" },
            { label: "JavaScript SDK", href: "#" },
            { label: "Examples", href: "#" },
        ],
    },
    {
        title: "Company",
        links: [
            { label: "About", href: "#" },
            { label: "Blog", href: "#" },
            { label: "Careers", href: "#" },
            { label: "Contact", href: "#" },
        ],
    },
    {
        title: "Legal",
        links: [
            { label: "Privacy Policy", href: "#" },
            { label: "Terms of Service", href: "#" },
            { label: "Cookie Policy", href: "#" },
        ],
    },
];

/* ══════════════════════════════════════════════════════════════════
   useIsMobile HOOK
   ══════════════════════════════════════════════════════════════════ */

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 767px)");
        setIsMobile(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);
    return isMobile;
}

/* ══════════════════════════════════════════════════════════════════
   FEATURES DATA
   ══════════════════════════════════════════════════════════════════ */

const features = [
    {
        icon: FileText,
        title: "Clean Markdown Extraction",
        desc: "Automatically extracts readable content, strips boilerplate, and converts to clean Markdown with metadata — titles, descriptions, word counts, and reading time.",
        span: 2,
    },
    {
        icon: Bot,
        title: "Structured JSON with Schema",
        desc: "Gemini-powered agent extracts structured data using your custom JSON schema definition.",
        span: 1,
    },
    {
        icon: Hash,
        title: "Content Hash Caching",
        desc: "SHA-256 content hashing with multi-layer caching (Redis + DB) skips expensive re-processing.",
        span: 1,
    },
    {
        icon: Shield,
        title: "SSRF Protection",
        desc: "Internal IP blocking, private network validation, and strict URL sanitization to prevent SSRF attacks.",
        span: 1,
    },
    {
        icon: Globe,
        title: "robots.txt Compliance",
        desc: "Optional robots.txt checking ensures respectful crawling with per-domain rate limiting.",
        span: 1,
    },
    {
        icon: Clock,
        title: "Async Job Queue with Real-Time Polling",
        desc: "Long-running operations (site mapping, batch extraction) run as background jobs. Poll for progress with real-time status updates, page counts, and timing.",
        span: 2,
    },
];

const steps = [
    {
        step: "01",
        title: "Send a URL + prompt",
        desc: "POST to any endpoint with your target URL and optional prompt for structured extraction.",
    },
    {
        step: "02",
        title: "Distill extracts & cleans",
        desc: "Auto-detects JS rendering, fetches content, removes boilerplate, converts to Markdown.",
    },
    {
        step: "03",
        title: "Get structured data back",
        desc: "Receive clean markdown, metadata, links, and optional structured JSON — ready for your pipeline.",
    },
];

const endpoints = [
    {
        icon: FileText,
        title: "Scrape",
        desc: "Turn any URL into clean Markdown",
        method: "POST",
        path: "/api/v1/scrape",
    },
    {
        icon: Globe,
        title: "Map",
        desc: "Crawl entire sites with BFS",
        method: "POST",
        path: "/api/v1/map",
    },
    {
        icon: Search,
        title: "Search",
        desc: "Web search with optional scrape",
        method: "POST",
        path: "/api/v1/search",
    },
    {
        icon: Bot,
        title: "Agent Extract",
        desc: "Gemini-powered structured JSON",
        method: "POST",
        path: "/api/v1/agent/extract",
    },
];

/* ══════════════════════════════════════════════════════════════════
   FEATURE MOCK PANELS (ADD 1)
   ══════════════════════════════════════════════════════════════════ */

const mono = "'IBM Plex Mono', 'Geist Mono', monospace";
const mockPanelStyle: React.CSSProperties = {
    background: "var(--accent-subtle)",
    borderRadius: 10,
    border: "1px solid var(--border)",
    padding: 14,
    marginBottom: 16,
    fontFamily: mono,
    fontSize: 11,
    lineHeight: 1.5,
};

function MockMarkdownExtraction() {
    return (
        <div style={mockPanelStyle}>
            <div className="flex items-center gap-3">
                <div className="flex-1 space-y-1.5">
                    <div style={{ height: 6, width: "90%", borderRadius: 3 }} className="bg-border" />
                    <div style={{ height: 6, width: "70%", borderRadius: 3 }} className="bg-border-subtle" />
                    <div style={{ height: 6, width: "80%", borderRadius: 3 }} className="bg-border" />
                    <div style={{ height: 6, width: "55%", borderRadius: 3 }} className="bg-border-subtle" />
                </div>
                <span className="text-text-muted" style={{ fontSize: 16 }}>→</span>
                <div className="flex-1 text-text-secondary">
                    <div style={{ color: "#3B82F6" }}># Title</div>
                    <div style={{ color: "#10B981" }}>## Section</div>
                    <div>Clean text...</div>
                </div>
            </div>
        </div>
    );
}

function MockStructuredJSON() {
    return (
        <div style={mockPanelStyle}>
            <div className="flex items-center gap-2">
                <span className="bg-surface-elevated text-text-muted" style={{ borderRadius: 6, padding: "2px 8px", fontSize: 10, border: "1px solid var(--border)" }}>Extract top stories</span>
                <span className="text-text-muted">→</span>
                <div className="text-text-secondary" style={{ fontSize: 10 }}>
                    <span className="text-text-muted">{"{"}</span> <span style={{ color: "#3B82F6" }}>&quot;stories&quot;</span>: [{"{"}<br />
                    &nbsp;&nbsp;<span style={{ color: "#3B82F6" }}>&quot;title&quot;</span>: <span style={{ color: "#10B981" }}>&quot;...&quot;</span><br />
                    {"}"}]<span className="text-text-muted">{"}"}</span>
                </div>
            </div>
        </div>
    );
}

function MockCacheHit() {
    return (
        <div style={mockPanelStyle}>
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-text-muted">
                    <span>🔴</span><span style={{ color: "#EF4444" }}>MISS</span><span>req_001</span><span className="ml-auto">1.2s</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                    <span>🟢</span><span style={{ color: "#22C55E", textShadow: "0 0 8px rgba(34,197,94,0.3)" }}>HIT</span><span>req_001</span><span className="ml-auto" style={{ color: "#22C55E" }}>8ms</span>
                </div>
            </div>
        </div>
    );
}

function MockSSRF() {
    return (
        <div style={mockPanelStyle}>
            <div className="bg-surface-elevated text-text-muted" style={{ borderRadius: 6, padding: "4px 8px", fontSize: 10, marginBottom: 8, border: "1px solid var(--border)" }}>
                http://169.254.169.254
            </div>
            <div className="flex items-center gap-2">
                <Shield size={12} style={{ color: "#EF4444" }} />
                <span style={{ color: "#EF4444", fontSize: 10 }}>Blocked</span>
            </div>
        </div>
    );
}

function MockRobots() {
    return (
        <div style={mockPanelStyle}>
            <div className="text-text-muted" style={{ fontSize: 10, marginBottom: 6 }}>
                <div><span style={{ color: "#F59E0B" }}>User-agent</span>: *</div>
                <div><span style={{ color: "#F59E0B" }}>Disallow</span>: /private</div>
            </div>
            <div className="flex items-center gap-1.5">
                <span style={{ color: "#22C55E" }}>✓</span>
                <span style={{ color: "#22C55E", fontSize: 10 }}>Respected</span>
            </div>
        </div>
    );
}

function MockJobQueue() {
    return (
        <div style={mockPanelStyle}>
            <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-text-secondary">
                    <span style={{ fontSize: 10 }}>job_xyz</span>
                    <div className="flex-1 flex gap-px">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} style={{ height: 6, flex: 1, borderRadius: 1, background: i < 7 ? "#3B82F6" : "var(--border)" }} />
                        ))}
                    </div>
                    <span style={{ color: "#3B82F6", fontSize: 10 }}>running</span>
                </div>
                <div className="flex items-center gap-2 text-text-secondary">
                    <span style={{ fontSize: 10 }}>job_abc</span>
                    <div className="flex-1 flex gap-px">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} style={{ height: 6, flex: 1, borderRadius: 1, background: "#22C55E" }} />
                        ))}
                    </div>
                    <span style={{ color: "#22C55E", fontSize: 10 }}>done ✓</span>
                </div>
                <div className="flex items-center gap-2 text-text-muted">
                    <span style={{ fontSize: 10 }}>job_def</span>
                    <div className="flex-1 flex gap-px">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <div key={i} style={{ height: 6, flex: 1, borderRadius: 1, background: "var(--border)" }} />
                        ))}
                    </div>
                    <span style={{ color: "#F59E0B", fontSize: 10 }}>queued</span>
                </div>
            </div>
        </div>
    );
}

const featureMocks: Record<string, React.ComponentType> = {
    "Clean Markdown Extraction": MockMarkdownExtraction,
    "Structured JSON with Schema": MockStructuredJSON,
    "Content Hash Caching": MockCacheHit,
    "SSRF Protection": MockSSRF,
    "robots.txt Compliance": MockRobots,
    "Async Job Queue with Real-Time Polling": MockJobQueue,
};

/* ══════════════════════════════════════════════════════════════════
   BENCHMARK CARD (ADD 2)
   ══════════════════════════════════════════════════════════════════ */

const benchmarkBars = [
    { label: "Distill (cached)", time: "8ms", pct: 100, color: "var(--accent)" },
    { label: "Distill (fresh)", time: "1.1s", pct: 55, color: "var(--text-muted)" },
    { label: "Others", time: "3.4s", pct: 25, color: "var(--border)" },
];

const benchmarkTable = [
    { url: "openai.com/research", extract: "892ms", cached: "7ms" },
    { url: "docs.anthropic.com", extract: "1.1s", cached: "9ms" },
    { url: "arxiv.org/abs/...", extract: "743ms", cached: "6ms" },
    { url: "github.com/trending", extract: "654ms", cached: "5ms" },
];

function BenchmarkCard() {
    return (
        <div className="grid md:grid-cols-2 gap-6">
            {/* Left — Cache speed bars */}
            <div className="space-y-4">
                <h4 className="text-text-muted" style={{ fontFamily: mono, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Cache performance</h4>
                <div className="space-y-3">
                    {benchmarkBars.map((bar) => (
                        <div key={bar.label} className="space-y-1">
                            <div className="flex justify-between" style={{ fontFamily: mono, fontSize: 11 }}>
                                <span className="text-text-secondary">{bar.label}</span>
                                <span style={{ color: bar.color }}>{bar.time}</span>
                            </div>
                            <div className="bg-border-subtle" style={{ height: 6, borderRadius: 3, overflow: "hidden" }}>
                                <motion.div
                                    initial={{ width: 0 }}
                                    whileInView={{ width: `${bar.pct}%` }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 1, ease: "easeOut" as const, delay: 0.2 }}
                                    style={{ height: "100%", background: bar.color, borderRadius: 3 }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {/* Right — Extraction timing table */}
            <div className="space-y-4">
                <h4 className="text-text-muted" style={{ fontFamily: mono, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>Extraction times</h4>
                <div style={{ fontFamily: mono, fontSize: 11 }}>
                    <div className="flex gap-4 pb-2 text-text-muted" style={{ borderBottom: "1px solid var(--border)" }}>
                        <span className="flex-1">URL</span><span style={{ width: 60, textAlign: "right" }}>Extract</span><span style={{ width: 50, textAlign: "right" }}>Cached</span>
                    </div>
                    {benchmarkTable.map((row) => (
                        <div key={row.url} className="flex gap-4 py-1.5 transition-colors hover:bg-accent-subtle" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <span className="flex-1 truncate text-text-secondary">{row.url}</span>
                            <span className="text-text-secondary" style={{ width: 60, textAlign: "right" }}>{row.extract}</span>
                            <span className="text-text-primary" style={{ width: 50, textAlign: "right" }}>{row.cached}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════
   SPLIT CODE PANEL (ADD 3)
   ══════════════════════════════════════════════════════════════════ */

const langTabs = ["cURL", "Python", "JavaScript"] as const;
type LangTab = (typeof langTabs)[number];
const outputTabs = ["Markdown", "JSON", "Raw"] as const;
type OutputTab = (typeof outputTabs)[number];

const splitCodeContent: Record<LangTab, string> = {
    Python: `from distill import Distill

client = Distill(api_key="sk_your_key")

result = client.scrape(
    url="https://openai.com/research",
    use_playwright="auto"
)

print(result.markdown)`,
    JavaScript: `import Distill from '@distill/sdk'

const client = new Distill({ apiKey: 'sk_your_key' })

const result = await client.scrape({
  url: 'https://openai.com/research',
  use_playwright: 'auto'
})

console.log(result.markdown)`,
    cURL: terminalContent.scrape,
};

const outputContent: Record<OutputTab, React.ReactNode> = {
    Markdown: (
        <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, lineHeight: 1.7, color: "rgba(255,255,255,0.7)" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>OpenAI Research</h3>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.8)", marginBottom: 6 }}>Latest Publications</h4>
            <p>OpenAI conducts research across multiple domains including language models, reinforcement learning, and AI safety. Their recent publications focus on scaling laws, alignment techniques, and multimodal understanding...</p>
        </div>
    ),
    JSON: (
        <pre style={{ fontFamily: mono, fontSize: 11.5, lineHeight: 1.6, margin: 0, color: "rgba(255,255,255,0.6)" }}>
            <code>{`{
  "success": true,
  "markdown": "# OpenAI Research...",
  "metadata": {
    "title": "OpenAI Research",
    "word_count": 1423,
    "cached": false
  },
  "request_id": "req_abc123"
}`}</code>
        </pre>
    ),
    Raw: (
        <pre style={{ fontFamily: mono, fontSize: 11.5, lineHeight: 1.6, margin: 0, color: "rgba(255,255,255,0.5)", whiteSpace: "pre-wrap" }}>
            <code>{`# OpenAI Research

## Latest Publications

OpenAI conducts research across multiple domains including language models, reinforcement learning, and AI safety...`}</code>
        </pre>
    ),
};

function SplitCodePanel() {
    const [activeLang, setActiveLang] = useState<LangTab>("cURL");
    const [activeOutput, setActiveOutput] = useState<OutputTab>("Markdown");

    return (
        <div
            className="w-full"
            style={{
                maxWidth: 960,
                display: "flex",
                flexDirection: "column",
            }}
        >
            <div className="flex flex-col md:flex-row" style={{
                background: "rgba(18, 18, 20, 0.95)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.05), 0 20px 60px rgba(0,0,0,0.5)",
                overflow: "hidden",
            }}>
                {/* Left — Code panel (55%) */}
                <div className="md:w-[55%] flex flex-col" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                    {/* Chrome bar with lang tabs */}
                    <div className="flex items-center" style={{ height: 40, background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 14px" }}>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="rounded-full" style={{ width: 12, height: 12, background: "#FF5F57" }} />
                            <div className="rounded-full" style={{ width: 12, height: 12, background: "#FEBC2E" }} />
                            <div className="rounded-full" style={{ width: 12, height: 12, background: "#28C840" }} />
                        </div>
                        <div className="flex-1 flex items-center justify-center gap-0">
                            {langTabs.map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveLang(tab)}
                                    className="relative px-3 py-2 cursor-pointer transition-colors duration-150"
                                    style={{ fontFamily: mono, fontSize: 11, color: activeLang === tab ? "#FFFFFF" : "rgba(255,255,255,0.35)", background: "none", border: "none" }}
                                >
                                    {tab}
                                    {activeLang === tab && (
                                        <motion.div layoutId="lang-tab-indicator" className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{ width: 20, height: 2, borderRadius: 1, background: "#FFFFFF" }} transition={{ duration: 0.2 }} />
                                    )}
                                </button>
                            ))}
                        </div>
                        <div className="shrink-0" style={{ width: 52 }} />
                    </div>
                    {/* Code content with line numbers */}
                    <div className="overflow-x-auto flex-1" style={{ padding: "16px 0 24px", fontFamily: mono, fontSize: 12, lineHeight: 1.7 }}>
                        <AnimatePresence mode="wait">
                            <motion.div key={activeLang} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                {splitCodeContent[activeLang].split("\n").map((line, i) => (
                                    <div key={i} className="flex">
                                        <span className="shrink-0 text-right select-none" style={{ width: 36, paddingRight: 12, color: "rgba(255,255,255,0.2)", fontSize: 11 }}>{i + 1}</span>
                                        <span style={{ color: "rgba(255,255,255,0.6)" }}>{line || "\u00A0"}</span>
                                    </div>
                                ))}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                {/* Right — Output panel (45%) */}
                <div className="md:w-[45%] flex flex-col">
                    <div className="flex items-center justify-between" style={{ height: 40, background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "0 14px" }}>
                        <span style={{ fontFamily: mono, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.35)" }}>Output</span>
                        <div className="flex gap-1">
                            {outputTabs.map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveOutput(tab)}
                                    className="cursor-pointer transition-colors duration-150"
                                    style={{
                                        fontFamily: mono, fontSize: 10, padding: "2px 8px", borderRadius: 4,
                                        color: activeOutput === tab ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)",
                                        background: activeOutput === tab ? "rgba(255,255,255,0.1)" : "transparent",
                                        border: "none",
                                    }}
                                >
                                    {tab}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="overflow-y-auto flex-1" style={{ padding: "16px 18px 24px" }}>
                        <AnimatePresence mode="wait">
                            <motion.div key={activeOutput} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                {outputContent[activeOutput]}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ══════════════════════════════════════════════════════════════════
   LANDING PAGE
   ══════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
    return (
        <div className="relative">
            {/* ════════════════════════════════════════════════════
                HERO SECTION
                ════════════════════════════════════════════════════ */}
            <section
                className="relative flex flex-col items-center justify-start pt-28 sm:pt-36 px-6 min-h-screen pb-24"
            >
                {/* Dot grid background */}
                <div className="dot-grid-bg absolute inset-0 -z-10" aria-hidden="true" />

                {/* Hero text block */}
                <div className="text-center max-w-3xl mx-auto space-y-6">
                    <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border border-border text-text-secondary bg-surface">
                            <Zap size={12} />
                            AI Data Infrastructure
                        </span>
                    </motion.div>

                    <motion.h1
                        custom={1}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-text-primary leading-[1.1]"
                    >
                        Turn the entire web into data your AI can use
                    </motion.h1>

                    <motion.p
                        custom={2}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        className="text-lg text-text-secondary max-w-xl mx-auto leading-relaxed"
                    >
                        Clean markdown, structured JSON, and real-time extraction — built
                        for AI pipelines, RAG systems, and intelligent agents
                    </motion.p>

                    <motion.div
                        custom={3}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        className="flex flex-wrap justify-center gap-3"
                    >
                        <Link href="/signup" className="btn-neumorphic text-sm">
                            Get started free
                        </Link>
                        <Link href="/dashboard/docs" className="btn-ghost text-sm">
                            View docs
                        </Link>
                    </motion.div>

                    <motion.div
                        custom={4}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                        className="flex items-center justify-center gap-4 text-sm text-text-muted"
                    >
                        <span>Built for developers</span>
                        <div className="flex items-center gap-2">
                            <Terminal size={14} />
                            <Code2 size={14} />
                            <Globe size={14} />
                        </div>
                    </motion.div>
                </div>

                {/* Split Code Panel (ADD 3 — replaces MacOSTerminal, kept for easy revert) */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.7, ease: "easeOut" as const }}
                    className="w-full flex justify-center mt-16 sm:mt-20"
                >
                    <SplitCodePanel />
                </motion.div>
            </section>

            {/* ════════════════════════════════════════════════════
                FEATURES SECTION
                ════════════════════════════════════════════════════ */}
            <motion.section
                id="features"
                className="relative py-24 px-6 bg-background"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" as const }}
                viewport={{ once: true, margin: "-100px" }}
            >
                <div className="max-w-6xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5, ease: "easeOut" as const }}
                        className="text-center mb-16"
                    >
                        <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                            Everything your AI pipeline needs
                        </h2>
                        <p className="text-text-secondary max-w-md mx-auto">
                            Production-ready web extraction with caching, safety, and async
                            processing built in.
                        </p>
                    </motion.div>

                    <BentoGrid className="gap-4">
                        {features.map((f, i) => {
                            const MockComponent = featureMocks[f.title];
                            return (
                                <BentoCard key={f.title} span={f.span as 1 | 2}>
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        whileInView={{ opacity: 1, y: 0 }}
                                        viewport={{ once: true, margin: "-60px" }}
                                        transition={{ delay: i * 0.08, duration: 0.5, ease: "easeOut" as const }}
                                    >
                                        {/* ADD 1 — Visual mock panel */}
                                        {MockComponent && <MockComponent />}
                                        <div className={f.span === 2 ? "flex items-start gap-4" : "space-y-3"}>
                                            <div className={`p-3 rounded-xl bg-accent-subtle ${f.span === 2 ? "" : "w-fit"}`}>
                                                <f.icon size={20} className="text-accent" />
                                            </div>
                                            <div>
                                                <h3 className={`font-semibold text-text-primary ${f.span === 2 ? "mb-1" : ""}`}>
                                                    {f.title}
                                                </h3>
                                                <p className={`text-sm text-text-secondary ${f.span === 2 ? "leading-relaxed" : ""}`}>
                                                    {f.desc}
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                </BentoCard>
                            );
                        })}

                        {/* ADD 2 — Benchmark stats card (full-width) */}
                        <BentoCard span={2}>
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-60px" }}
                                transition={{ delay: 0.5, duration: 0.5, ease: "easeOut" as const }}
                            >
                                <BenchmarkCard />
                            </motion.div>
                        </BentoCard>
                    </BentoGrid>
                </div>
            </motion.section>

            {/* ════════════════════════════════════════════════════
                HOW IT WORKS
                ════════════════════════════════════════════════════ */}
            <motion.section
                className="py-24 px-6"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" as const }}
                viewport={{ once: true, margin: "-100px" }}
            >
                <div className="max-w-6xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5, ease: "easeOut" as const }}
                        className="text-center mb-16"
                    >
                        <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                            How it works
                        </h2>
                    </motion.div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {steps.map((item, i) => (
                            <motion.div
                                key={item.step}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-80px" }}
                                transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" as const }}
                            >
                                <GlassCard className="h-full space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-4xl font-bold text-text-muted/30 font-mono">
                                            {item.step}
                                        </span>
                                        {i < 2 && (
                                            <ArrowRight
                                                size={16}
                                                className="text-text-muted hidden md:block ml-auto"
                                            />
                                        )}
                                    </div>
                                    <h3 className="text-lg font-semibold text-text-primary">
                                        {item.title}
                                    </h3>
                                    <p className="text-sm text-text-secondary">{item.desc}</p>
                                </GlassCard>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* ════════════════════════════════════════════════════
                ENDPOINTS
                ════════════════════════════════════════════════════ */}
            <motion.section
                className="py-24 px-6"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" as const }}
                viewport={{ once: true, margin: "-100px" }}
            >
                <div className="max-w-6xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5, ease: "easeOut" as const }}
                        className="text-center mb-16"
                    >
                        <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
                            Four powerful endpoints
                        </h2>
                        <p className="text-text-secondary max-w-md mx-auto">
                            Each endpoint is designed for a specific extraction pattern.
                        </p>
                    </motion.div>

                    <div className="grid md:grid-cols-2 gap-4">
                        {endpoints.map((ep, i) => (
                            <motion.div
                                key={ep.title}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: "-80px" }}
                                transition={{ delay: i * 0.1, duration: 0.5, ease: "easeOut" as const }}
                            >
                                <GlassCard hover className="h-full group">
                                    <div className="flex items-start gap-4">
                                        <div className="p-3 rounded-xl bg-accent-subtle">
                                            <ep.icon size={20} className="text-accent" />
                                        </div>
                                        <div className="flex-1">
                                            <h3 className="font-semibold text-text-primary mb-1">
                                                {ep.title}
                                            </h3>
                                            <p className="text-sm text-text-secondary mb-3">
                                                {ep.desc}
                                            </p>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="px-2 py-0.5 rounded bg-success/15 text-success font-mono font-medium">
                                                    {ep.method}
                                                </span>
                                                <span className="font-mono text-text-muted">
                                                    {ep.path}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </GlassCard>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* ════════════════════════════════════════════════════
                CTA
                ════════════════════════════════════════════════════ */}
            <motion.section
                className="py-24 px-6"
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" as const }}
                viewport={{ once: true, margin: "-100px" }}
            >
                <div className="max-w-4xl mx-auto">
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-80px" }}
                        transition={{ duration: 0.5, ease: "easeOut" as const }}
                    >
                        <GlassCard className="text-center py-16 px-8 space-y-6 border border-border">
                            <h2 className="text-3xl font-bold text-text-primary">
                                Start building in minutes
                            </h2>
                            <p className="text-text-secondary max-w-md mx-auto">
                                Get your API key and start extracting data. No credit card
                                required.
                            </p>
                            <div className="flex justify-center gap-3 flex-wrap">
                                <input
                                    type="email"
                                    placeholder="you@company.com"
                                    className="px-4 py-3 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-muted text-sm w-64 outline-none focus:border-accent transition-colors"
                                />
                                <button className="btn-neumorphic text-sm">Get started</button>
                            </div>
                        </GlassCard>
                    </motion.div>
                </div>
            </motion.section>

            {/* ════════════════════════════════════════════════════
                FOOTER
                ════════════════════════════════════════════════════ */}
            <motion.footer
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" as const }}
                viewport={{ once: true, margin: "-100px" }}
                style={{
                    background: "#0A0A0B",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                }}
            >
                <div className="max-w-6xl mx-auto px-6 pt-16 pb-8">
                    {/* Top — grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-10 lg:gap-8">
                        {/* Logo column */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className="flex items-center gap-2">
                                <svg width={28} height={28} viewBox="0 0 32 32" fill="none">
                                    <rect width="32" height="32" rx="8" fill="#E8E8F0" />
                                    <path
                                        d="M9 10h6c3.3 0 6 2.7 6 6s-2.7 6-6 6H9V10z"
                                        stroke="#0A0A0B"
                                        strokeWidth="2.5"
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    <circle cx="15" cy="16" r="2" fill="#0A0A0B" />
                                </svg>
                                <span className="text-lg font-semibold tracking-tight text-white">
                                    Distill
                                </span>
                            </div>

                            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, lineHeight: 1.6 }}>
                                Turn the entire web into data your AI can use.
                            </p>

                            {/* Social icons */}
                            <div className="flex items-center gap-4">
                                {[
                                    { Icon: Github, href: "https://github.com", label: "GitHub" },
                                    { Icon: TwitterIcon, href: "https://x.com", label: "Twitter" },
                                    { Icon: DiscordIcon, href: "https://discord.com", label: "Discord" },
                                ].map(({ Icon, href, label }) => (
                                    <a
                                        key={label}
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="transition-colors duration-150"
                                        style={{ color: "rgba(255,255,255,0.4)" }}
                                        onMouseEnter={(e) => (e.currentTarget.style.color = "#FFFFFF")}
                                        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.4)")}
                                        aria-label={label}
                                    >
                                        <Icon size={20} />
                                    </a>
                                ))}
                            </div>
                        </div>

                        {/* Link columns */}
                        {footerColumns.map((col) => (
                            <div key={col.title}>
                                <h3
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.08em",
                                        color: "rgba(255,255,255,0.5)",
                                        marginBottom: 16,
                                    }}
                                >
                                    {col.title}
                                </h3>
                                <ul className="space-y-2.5">
                                    {col.links.map((link) => (
                                        <li key={link.label}>
                                            <Link
                                                href={link.href}
                                                className="transition-colors duration-150"
                                                style={{ color: "rgba(255,255,255,0.45)", fontSize: 14 }}
                                                onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.9)")}
                                                onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.45)")}
                                            >
                                                {link.label}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    {/* Bottom bar */}
                    <div
                        className="flex flex-col sm:flex-row items-center justify-between mt-12 pt-6 gap-3"
                        style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
                            © 2025 Distill. All rights reserved.
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
                            Built for AI developers
                        </span>
                    </div>
                </div>
            </motion.footer>
        </div>
    );
}

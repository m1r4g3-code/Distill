"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { GlassCard } from "@/components/shared/GlassCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAppStore } from "@/lib/store";
import { MOCK_USAGE_DATA } from "@/lib/constants";
import { getGreeting, formatDate } from "@/lib/utils";
import {
    TrendingUp,
    TrendingDown,
    Briefcase,
    CheckCircle2,
    FileText,
    Database,
    Globe,
    Search,
    Bot,
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    Tooltip,
    ResponsiveContainer,
    LineChart,
    Line,
} from "recharts";
import type { JobStatus } from "@/types";

/* ── count-up hook ── */
function useCountUp(end: number, duration = 1500) {
    const [value, setValue] = useState(0);
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        const start = performance.now();
        const step = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(eased * end));
            if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [end, duration]);

    return { value };
}

/* ── sparkline data ── */
const sparkData = {
    totalJobs: [
        { v: 40 }, { v: 55 }, { v: 48 }, { v: 62 }, { v: 58 }, { v: 70 }, { v: 65 }, { v: 80 },
    ],
    successRate: [
        { v: 95 }, { v: 96 }, { v: 94 }, { v: 97 }, { v: 96 }, { v: 98 }, { v: 97 }, { v: 97 },
    ],
    pagesExtracted: [
        { v: 200 }, { v: 350 }, { v: 280 }, { v: 420 }, { v: 380 }, { v: 500 }, { v: 450 }, { v: 520 },
    ],
    cacheHitRate: [
        { v: 38 }, { v: 36 }, { v: 34 }, { v: 35 }, { v: 33 }, { v: 34 }, { v: 32 }, { v: 33 },
    ],
};

/* ── Sparkline ── */
function Sparkline({ data }: { data: { v: number }[] }) {
    return (
        <div style={{ width: 80, height: 40 }}>
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <Line
                        type="monotone"
                        dataKey="v"
                        stroke="var(--text-muted)"
                        strokeWidth={1.5}
                        dot={false}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}

/* ── Custom tooltip for usage chart ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GlassTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div
            style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 12px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
        >
            <p style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 4 }}>{label}</p>
            <p style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 600 }}>
                {payload[0].value.toLocaleString()} requests
            </p>
        </div>
    );
}

const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.4 },
    }),
};

export default function DashboardPage() {
    const { user, trackedJobs } = useAppStore();
    const recentJobs = trackedJobs.slice(0, 5);
    const stats = {
        totalJobs: trackedJobs.length,
        successRate: trackedJobs.length > 0
            ? (trackedJobs.filter(j => j.status === 'completed').length / trackedJobs.length) * 100
            : 0,
        pagesExtracted: 0,
        cacheHitRate: 0,
    };
    const [period, setPeriod] = useState("7d");

    const totalJobs = useCountUp(stats.totalJobs);
    const successRate = useCountUp(Math.round(stats.successRate * 10));
    const pagesExtracted = useCountUp(stats.pagesExtracted);
    const cacheHitRate = useCountUp(Math.round(stats.cacheHitRate * 10));

    const statCards = [
        {
            label: "Total Jobs",
            value: totalJobs.value.toLocaleString(),
            change: 12.5,
            icon: Briefcase,
            sparkline: sparkData.totalJobs,
        },
        {
            label: "Success Rate",
            value: `${(successRate.value / 10).toFixed(1)}%`,
            change: 1.2,
            icon: CheckCircle2,
            sparkline: sparkData.successRate,
        },
        {
            label: "Pages Extracted",
            value: pagesExtracted.value.toLocaleString(),
            change: 18.3,
            icon: FileText,
            sparkline: sparkData.pagesExtracted,
        },
        {
            label: "Cache Hit Rate",
            value: `${(cacheHitRate.value / 10).toFixed(1)}%`,
            change: -2.1,
            icon: Database,
            sparkline: sparkData.cacheHitRate,
        },
    ];

    const quickActions = [
        { icon: FileText, title: "Scrape a URL", subtitle: "Extract clean markdown", tab: "scrape" },
        { icon: Globe, title: "Crawl a site", subtitle: "BFS site mapping", tab: "map" },
        { icon: Search, title: "Search the web", subtitle: "Search + optional scrape", tab: "search" },
        { icon: Bot, title: "Agent extract", subtitle: "Gemini structured JSON", tab: "agent" },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Greeting */}
            <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
                <h1 className="text-2xl font-bold text-text-primary">
                    {getGreeting()}, {user?.name || "Developer"}
                </h1>
                <p className="text-sm text-text-secondary mt-1">
                    {new Date().toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                    })}
                </p>
            </motion.div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card, i) => (
                    <motion.div key={card.label} custom={i + 1} variants={fadeUp} initial="hidden" animate="visible">
                        <GlassCard hover className="space-y-0">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-text-secondary">{card.label}</span>
                                <card.icon size={18} className="text-text-muted" />
                            </div>
                            <div className="text-4xl font-bold text-text-primary mt-2">
                                {card.value}
                            </div>
                            <div className="flex items-end justify-between mt-3">
                                <span
                                    className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md ${card.change >= 0 ? "text-success bg-success/15" : "text-error bg-error/15"
                                        }`}
                                >
                                    {card.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                    {Math.abs(card.change)}%
                                </span>
                                <Sparkline data={card.sparkline} />
                            </div>
                        </GlassCard>
                    </motion.div>
                ))}
            </div>

            {/* Quick Actions */}
            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
                <h2 className="font-semibold text-text-primary mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {quickActions.map((action) => (
                        <Link key={action.tab} href={`/dashboard/playground?tab=${action.tab}`}>
                            <GlassCard hover className="flex items-center gap-4 !py-5">
                                <div className="p-2.5 rounded-xl bg-accent-subtle border border-border-subtle">
                                    <action.icon size={20} className="text-accent" />
                                </div>
                                <div>
                                    <p className="text-[15px] font-semibold text-text-primary">{action.title}</p>
                                    <p className="text-xs text-text-muted">{action.subtitle}</p>
                                </div>
                            </GlassCard>
                        </Link>
                    ))}
                </div>
            </motion.div>

            {/* Usage Chart */}
            <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
                <GlassCard>
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="font-semibold text-text-primary">Requests over time</h2>
                        <div className="flex gap-1 p-0.5 rounded-lg bg-surface-elevated">
                            {["7d", "30d", "90d"].map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPeriod(p)}
                                    className={`px-3 py-1 rounded-md text-xs transition-colors cursor-pointer ${period === p
                                        ? "bg-surface text-text-primary shadow-sm"
                                        : "text-text-muted hover:text-text-secondary"
                                        }`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={MOCK_USAGE_DATA.requestsOverTime}>
                                <defs>
                                    <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.15} />
                                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="date"
                                    tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <Tooltip content={<GlassTooltip />} />
                                <Area
                                    type="monotone"
                                    dataKey="requests"
                                    stroke="var(--accent)"
                                    strokeWidth={2}
                                    fill="url(#areaFill)"
                                    dot={false}
                                    activeDot={{ r: 4, fill: "var(--accent)", strokeWidth: 0 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>
            </motion.div>

            {/* Recent Jobs */}
            <motion.div custom={7} variants={fadeUp} initial="hidden" animate="visible">
                <GlassCard>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold text-text-primary">Recent Jobs</h2>
                        <Link href="/dashboard/jobs" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
                            View all →
                        </Link>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-text-muted text-xs uppercase tracking-wider">
                                    <th className="pb-3 font-medium">Type</th>
                                    <th className="pb-3 font-medium">Status</th>
                                    <th className="pb-3 font-medium hidden sm:table-cell">URL/Query</th>
                                    <th className="pb-3 font-medium hidden md:table-cell">Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {recentJobs.map((job) => (
                                    <tr key={job.jobId} className="hover:bg-surface-elevated/50 transition-colors cursor-pointer">
                                        <td className="py-3">
                                            <span className="text-text-primary font-medium capitalize">
                                                {job.type.replace("_", " ")}
                                            </span>
                                        </td>
                                        <td className="py-3">
                                            <StatusBadge status={job.status as JobStatus} />
                                        </td>
                                        <td className="py-3 hidden sm:table-cell text-text-secondary text-xs font-mono truncate max-w-[200px]">
                                            {job.url || job.query || job.jobId.slice(0, 12) + "..."}
                                        </td>
                                        <td className="py-3 hidden md:table-cell text-text-muted text-xs">
                                            {formatDate(job.createdAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {recentJobs.length === 0 && (
                        <div className="text-center py-12 text-text-muted">
                            <Briefcase size={32} className="mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No jobs yet. Start by running a request!</p>
                        </div>
                    )}
                </GlassCard>
            </motion.div>
        </div>
    );
}

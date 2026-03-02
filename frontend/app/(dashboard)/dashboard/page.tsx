"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/shared/GlassCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/shared/Skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { fetchUserUsage, fetchUserJobs } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { getGreeting, formatDate } from "@/lib/utils";
import {
    Briefcase,
    CheckCircle2,
    FileText,
    Database,
    Globe,
    Search,
    Bot,
    RefreshCw,
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";
import type { JobStatus } from "@/types";

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

async function getToken() {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
}

export default function DashboardPage() {
    const { user } = useAppStore();
    const [period, setPeriod] = useState("7d");

    const { data: usage, isLoading: usageLoading } = useQuery({
        queryKey: ["usage", period],
        queryFn: async () => {
            const token = await getToken();
            if (!token) return null;
            return fetchUserUsage(token, period);
        },
        staleTime: 30_000,
        refetchInterval: 60_000,
    });

    const { data: jobs = [], isLoading: jobsLoading } = useQuery({
        queryKey: ["jobs"],
        queryFn: async () => {
            const token = await getToken();
            if (!token) return [];
            return fetchUserJobs(token);
        },
        staleTime: 10_000,
        refetchInterval: 30_000,
    });

    const recentJobs = jobs.slice(0, 5);

    const statCards = [
        {
            label: "Total Jobs",
            value: usage?.total_jobs?.toLocaleString() ?? "—",
            icon: Briefcase,
        },
        {
            label: "Success Rate",
            value: usage ? `${usage.success_rate.toFixed(1)}%` : "—",
            icon: CheckCircle2,
        },
        {
            label: "Pages Extracted",
            value: usage?.pages_extracted?.toLocaleString() ?? "—",
            icon: FileText,
        },
        {
            label: "Cache Hits",
            value: usage?.cache_hits?.toLocaleString() ?? "—",
            icon: Database,
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
                            {usageLoading ? (
                                <Skeleton className="h-8 w-20 mt-2" />
                            ) : (
                                <div className="text-4xl font-bold text-text-primary mt-2">
                                    {card.value}
                                </div>
                            )}
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
                        {usageLoading ? (
                            <Skeleton className="h-full w-full rounded-xl" />
                        ) : (usage?.requests_over_time?.length ?? 0) > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={usage!.requests_over_time}>
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
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-text-muted gap-2">
                                <RefreshCw size={24} className="opacity-30" />
                                <p className="text-sm">No data yet — run your first request in the Playground!</p>
                            </div>
                        )}
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

                    {jobsLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))}
                        </div>
                    ) : recentJobs.length > 0 ? (
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
                                        <tr key={job.job_id} className="hover:bg-surface-elevated/50 transition-colors">
                                            <td className="py-3">
                                                <span className="text-text-primary font-medium capitalize">
                                                    {job.type.replace("_", " ")}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                <StatusBadge status={job.status as JobStatus} />
                                            </td>
                                            <td className="py-3 hidden sm:table-cell text-text-secondary text-xs font-mono truncate max-w-[200px]">
                                                {job.url || job.query || job.job_id.slice(0, 12) + "..."}
                                            </td>
                                            <td className="py-3 hidden md:table-cell text-text-muted text-xs">
                                                {formatDate(job.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="text-center py-12 text-text-muted">
                            <Briefcase size={32} className="mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No jobs yet. Start by running a request in the Playground!</p>
                        </div>
                    )}
                </GlassCard>
            </motion.div>
        </div>
    );
}

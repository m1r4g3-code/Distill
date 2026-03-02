"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/shared/GlassCard";
import { Skeleton } from "@/components/shared/Skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { fetchUserUsage } from "@/lib/api-client";
import { BarChart3, TrendingUp, Database, FileText, RefreshCw } from "lucide-react";
import {
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    Legend,
    Cell,
} from "recharts";

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.4 },
    }),
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function GlassTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-surface border border-border rounded-lg px-3 py-2 shadow-lg">
            <p className="text-text-muted text-[11px] mb-1">{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ color: p.color }} className="text-[13px] font-semibold">
                    {p.name}: {p.value.toLocaleString()}
                </p>
            ))}
        </div>
    );
}

const ENDPOINT_COLORS: Record<string, string> = {
    "Map": "#34d399",
    "Agent Extract": "#f472b6",
    "Search Scrape": "#fbbf24",
    "Scrape": "#818cf8",
};

async function getToken() {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
}

export default function UsagePage() {
    const [period, setPeriod] = useState("7d");

    const { data, isLoading, isError, refetch } = useQuery({
        queryKey: ["usage", period],
        queryFn: async () => {
            const token = await getToken();
            if (!token) throw new Error("Not authenticated");
            return fetchUserUsage(token, period);
        },
        staleTime: 30_000,
    });

    const statCards = [
        { label: "Total Requests", value: data?.total_requests?.toLocaleString() ?? "—", icon: BarChart3 },
        { label: "Success Rate", value: data ? `${data.success_rate.toFixed(1)}%` : "—", icon: TrendingUp },
        { label: "Pages Extracted", value: data?.pages_extracted?.toLocaleString() ?? "—", icon: FileText },
        { label: "Cache Hits", value: data?.cache_hits?.toLocaleString() ?? "—", icon: Database },
    ];

    const hasData = !isLoading && !isError && (data?.total_requests ?? 0) > 0;

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-text-primary">Usage & Metrics</h1>
                <div className="flex items-center gap-3">
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
                                {p === "7d" ? "Last 7 days" : p === "30d" ? "Last 30 days" : "Last 90 days"}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => refetch()} className="btn-ghost text-xs flex items-center gap-1">
                        <RefreshCw size={12} /> Refresh
                    </button>
                </div>
            </div>

            {/* Error state */}
            {isError && (
                <GlassCard className="text-center py-8">
                    <p className="text-error text-sm">Failed to load usage data</p>
                    <button onClick={() => refetch()} className="btn-ghost text-sm mt-3">Retry</button>
                </GlassCard>
            )}

            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card, i) => (
                    <motion.div key={card.label} custom={i} variants={fadeUp} initial="hidden" animate="visible">
                        <GlassCard hover className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-text-secondary">{card.label}</span>
                                <card.icon size={18} className="text-text-muted" />
                            </div>
                            {isLoading ? (
                                <Skeleton className="h-8 w-24" />
                            ) : (
                                <span className="text-2xl font-bold text-text-primary">{card.value}</span>
                            )}
                        </GlassCard>
                    </motion.div>
                ))}
            </div>

            {/* Requests Over Time chart */}
            <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
                <GlassCard>
                    <h2 className="font-semibold text-text-primary mb-4">Requests Over Time</h2>
                    <div className="h-64">
                        {isLoading ? (
                            <Skeleton className="h-full w-full rounded-xl" />
                        ) : hasData ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={data!.requests_over_time}>
                                    <defs>
                                        <linearGradient id="usageAreaFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.12} />
                                            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="usageSuccessFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="var(--success)" stopOpacity={0.12} />
                                            <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                    <Tooltip content={<GlassTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />
                                    <Area type="monotone" dataKey="requests" name="Total" stroke="var(--accent)" strokeWidth={2} fill="url(#usageAreaFill)" dot={false} activeDot={{ r: 4, fill: "var(--accent)", strokeWidth: 0 }} />
                                    <Area type="monotone" dataKey="success" name="Success" stroke="var(--success)" strokeWidth={2} fill="url(#usageSuccessFill)" dot={false} activeDot={{ r: 4, fill: "var(--success)", strokeWidth: 0 }} strokeDasharray="4 4" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-text-muted gap-2">
                                <BarChart3 size={32} className="opacity-30" />
                                <p className="text-sm">No usage data yet. Run some requests in the Playground!</p>
                            </div>
                        )}
                    </div>
                </GlassCard>
            </motion.div>

            {/* Bar chart + Top URLs */}
            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
                <div className="grid lg:grid-cols-2 gap-6">
                    <GlassCard>
                        <h2 className="font-semibold text-text-primary mb-4">Requests by Endpoint</h2>
                        <div className="h-64">
                            {isLoading ? (
                                <Skeleton className="h-full w-full rounded-xl" />
                            ) : (data?.requests_by_endpoint?.length ?? 0) > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={data!.requests_by_endpoint} dataKey="count">
                                        <XAxis dataKey="endpoint" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                                        <Tooltip content={<GlassTooltip />} />
                                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                            {(data?.requests_by_endpoint ?? []).map((entry, i) => (
                                                <Cell key={i} fill={ENDPOINT_COLORS[entry.endpoint] ?? "#818cf8"} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-text-muted text-sm">No endpoint data yet</div>
                            )}
                        </div>
                    </GlassCard>

                    <GlassCard>
                        <h2 className="font-semibold text-text-primary mb-4">Top URLs Scraped</h2>
                        {isLoading ? (
                            <div className="space-y-2">
                                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                            </div>
                        ) : (data?.top_urls?.length ?? 0) > 0 ? (
                            <div className="space-y-2">
                                {data!.top_urls.map((item, i) => (
                                    <div key={item.url} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-surface-elevated transition-colors">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-xs text-text-muted w-5 text-right font-medium font-mono">{i + 1}</span>
                                            <span className="text-sm text-text-secondary truncate font-mono">{item.url}</span>
                                        </div>
                                        <span className="text-sm font-bold text-text-primary shrink-0 ml-3 font-mono">{item.count}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-8 text-center text-text-muted text-sm">No URL data yet</div>
                        )}
                    </GlassCard>
                </div>
            </motion.div>
        </div>
    );
}

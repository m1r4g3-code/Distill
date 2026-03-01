"use client";

import { useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { MOCK_USAGE_DATA } from "@/lib/constants";
import { BarChart3, TrendingUp, Database, FileText } from "lucide-react";
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

export default function UsagePage() {
    const [dateRange, setDateRange] = useState("7d");
    const data = MOCK_USAGE_DATA;

    const statCards = [
        {
            label: "Total Requests",
            value: data.totalRequests.toLocaleString(),
            icon: BarChart3,
        },
        {
            label: "Success Rate",
            value: `${data.successRate}%`,
            icon: TrendingUp,
        },
        {
            label: "Cache Hits",
            value: data.cacheHits.toLocaleString(),
            icon: Database,
        },
        {
            label: "Pages Extracted",
            value: data.pagesExtracted.toLocaleString(),
            icon: FileText,
        },
    ];

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-text-primary">Usage & Metrics</h1>
                <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="px-4 py-2 rounded-xl border border-border bg-surface text-text-primary text-sm outline-none cursor-pointer"
                >
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                </select>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((card) => (
                    <GlassCard key={card.label} className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-text-secondary">{card.label}</span>
                            <card.icon size={18} className="text-text-muted" />
                        </div>
                        <span className="text-2xl font-bold text-text-primary">
                            {card.value}
                        </span>
                    </GlassCard>
                ))}
            </div>

            {/* Line Chart — Requests over time */}
            <GlassCard>
                <h2 className="font-semibold text-text-primary mb-4">
                    Requests Over Time
                </h2>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.requestsOverTime}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                            <XAxis
                                dataKey="date"
                                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                                axisLine={{ stroke: "var(--border)" }}
                            />
                            <YAxis
                                tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                                axisLine={{ stroke: "var(--border)" }}
                            />
                            <Tooltip
                                contentStyle={{
                                    background: "var(--surface)",
                                    border: "1px solid var(--border)",
                                    borderRadius: 12,
                                    fontSize: 12,
                                }}
                            />
                            <Line
                                type="monotone"
                                dataKey="requests"
                                stroke="var(--accent)"
                                strokeWidth={2}
                                dot={{ r: 3, fill: "var(--accent)" }}
                            />
                            <Line
                                type="monotone"
                                dataKey="success"
                                stroke="var(--success)"
                                strokeWidth={2}
                                dot={{ r: 3, fill: "var(--success)" }}
                                strokeDasharray="4 4"
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </GlassCard>

            {/* Bar Chart — By Endpoint */}
            <div className="grid lg:grid-cols-2 gap-6">
                <GlassCard>
                    <h2 className="font-semibold text-text-primary mb-4">
                        Requests by Endpoint
                    </h2>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.requestsByEndpoint}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                                <XAxis
                                    dataKey="endpoint"
                                    tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                                    axisLine={{ stroke: "var(--border)" }}
                                />
                                <YAxis
                                    tick={{ fill: "var(--text-muted)", fontSize: 12 }}
                                    axisLine={{ stroke: "var(--border)" }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: "var(--surface)",
                                        border: "1px solid var(--border)",
                                        borderRadius: 12,
                                        fontSize: 12,
                                    }}
                                />
                                <Bar
                                    dataKey="count"
                                    fill="var(--accent)"
                                    radius={[8, 8, 0, 0]}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </GlassCard>

                {/* Top URLs Table */}
                <GlassCard>
                    <h2 className="font-semibold text-text-primary mb-4">
                        Top URLs Scraped
                    </h2>
                    <div className="space-y-3">
                        {data.topUrls.map((item, i) => (
                            <div
                                key={item.url}
                                className="flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-xs text-text-muted w-5 text-right">
                                        {i + 1}.
                                    </span>
                                    <span className="text-sm text-text-secondary truncate">
                                        {item.url}
                                    </span>
                                </div>
                                <span className="text-sm font-medium text-text-primary shrink-0 ml-3">
                                    {item.count}
                                </span>
                            </div>
                        ))}
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}

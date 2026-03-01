"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { GlassCard } from "@/components/shared/GlassCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useAppStore } from "@/lib/store";
import { MOCK_DASHBOARD_STATS, MOCK_JOBS } from "@/lib/constants";
import { getGreeting, formatDate, formatDuration } from "@/lib/utils";
import {
    TrendingUp,
    TrendingDown,
    Briefcase,
    CheckCircle2,
    FileText,
    Database,
    Play,
    Globe,
    Search,
    Bot,
} from "lucide-react";
import type { JobStatus } from "@/types";

const fadeUp = {
    hidden: { opacity: 0, y: 12 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.4 },
    }),
};

export default function DashboardPage() {
    const { user } = useAppStore();
    const stats = MOCK_DASHBOARD_STATS;
    const recentJobs = MOCK_JOBS.slice(0, 5);

    const statCards = [
        {
            label: "Total Jobs",
            value: stats.totalJobs.toLocaleString(),
            change: 12.5,
            icon: Briefcase,
        },
        {
            label: "Success Rate",
            value: `${stats.successRate}%`,
            change: 1.2,
            icon: CheckCircle2,
        },
        {
            label: "Pages Extracted",
            value: stats.pagesExtracted.toLocaleString(),
            change: 18.3,
            icon: FileText,
        },
        {
            label: "Cache Hit Rate",
            value: `${stats.cacheHitRate}%`,
            change: -2.1,
            icon: Database,
        },
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
                    <motion.div
                        key={card.label}
                        custom={i + 1}
                        variants={fadeUp}
                        initial="hidden"
                        animate="visible"
                    >
                        <GlassCard className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-text-secondary">{card.label}</span>
                                <card.icon size={18} className="text-text-muted" />
                            </div>
                            <div className="flex items-end justify-between">
                                <span className="text-2xl font-bold text-text-primary">
                                    {card.value}
                                </span>
                                <span
                                    className={`flex items-center gap-1 text-xs font-medium ${card.change >= 0 ? "text-success" : "text-error"
                                        }`}
                                >
                                    {card.change >= 0 ? (
                                        <TrendingUp size={12} />
                                    ) : (
                                        <TrendingDown size={12} />
                                    )}
                                    {Math.abs(card.change)}%
                                </span>
                            </div>
                        </GlassCard>
                    </motion.div>
                ))}
            </div>

            {/* Recent Jobs */}
            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
                <GlassCard>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="font-semibold text-text-primary">Recent Jobs</h2>
                        <Link
                            href="/dashboard/jobs"
                            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                        >
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
                                    <th className="pb-3 font-medium hidden md:table-cell">Duration</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                                {recentJobs.map((job) => {
                                    const duration =
                                        job.started_at && job.completed_at
                                            ? new Date(job.completed_at).getTime() -
                                            new Date(job.started_at).getTime()
                                            : null;

                                    return (
                                        <tr
                                            key={job.job_id}
                                            className="hover:bg-surface-elevated/50 transition-colors cursor-pointer"
                                        >
                                            <td className="py-3">
                                                <span className="inline-flex items-center gap-1.5 text-text-primary font-medium capitalize">
                                                    {job.type.replace("_", " ")}
                                                </span>
                                            </td>
                                            <td className="py-3">
                                                <StatusBadge status={job.status as JobStatus} />
                                            </td>
                                            <td className="py-3 hidden sm:table-cell text-text-secondary font-mono text-xs">
                                                {job.job_id.slice(0, 12)}...
                                            </td>
                                            <td className="py-3 hidden md:table-cell text-text-muted text-xs">
                                                {formatDate(job.created_at)}
                                            </td>
                                            <td className="py-3 hidden md:table-cell text-text-muted text-xs">
                                                {duration ? formatDuration(duration) : "—"}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {recentJobs.length === 0 && (
                        <div className="text-center py-12 text-text-muted">
                            <Briefcase size={32} className="mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No jobs yet. Start by running a scrape!</p>
                        </div>
                    )}
                </GlassCard>
            </motion.div>

            {/* Quick Actions */}
            <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
                <h2 className="font-semibold text-text-primary mb-4">Quick Actions</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: "New scrape", icon: FileText, tab: "scrape" },
                        { label: "New map", icon: Globe, tab: "map" },
                        { label: "New search", icon: Search, tab: "search" },
                        { label: "Agent extract", icon: Bot, tab: "agent" },
                    ].map((action) => (
                        <Link
                            key={action.tab}
                            href={`/dashboard/playground?tab=${action.tab}`}
                        >
                            <GlassCard
                                hover
                                className="flex items-center gap-3 cursor-pointer"
                            >
                                <div className="p-2 rounded-lg bg-accent-subtle">
                                    <action.icon size={16} className="text-accent" />
                                </div>
                                <span className="text-sm font-medium text-text-primary">
                                    {action.label}
                                </span>
                            </GlassCard>
                        </Link>
                    ))}
                </div>
            </motion.div>
        </div>
    );
}

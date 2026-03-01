"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/shared/GlassCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { MOCK_JOBS } from "@/lib/constants";
import { formatDate, formatDuration } from "@/lib/utils";
import { Search, X, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { JobStatus, JobType } from "@/types";

export default function JobsPage() {
    const [typeFilter, setTypeFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedJob, setSelectedJob] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const perPage = 20;

    const filteredJobs = MOCK_JOBS.filter((job) => {
        if (typeFilter !== "all" && job.type !== typeFilter) return false;
        if (statusFilter !== "all" && job.status !== statusFilter) return false;
        if (searchQuery && !job.job_id.includes(searchQuery)) return false;
        return true;
    });

    const totalPages = Math.ceil(filteredJobs.length / perPage);
    const paginatedJobs = filteredJobs.slice((page - 1) * perPage, page * perPage);
    const selected = MOCK_JOBS.find((j) => j.job_id === selectedJob);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-text-primary">Jobs</h1>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by job ID or URL..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-muted text-sm outline-none focus:border-accent transition-colors"
                    />
                </div>

                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="px-4 py-2.5 rounded-xl border border-border bg-surface text-text-primary text-sm outline-none cursor-pointer"
                >
                    <option value="all">All types</option>
                    <option value="map">Map</option>
                    <option value="agent_extract">Agent Extract</option>
                    <option value="search_scrape">Search Scrape</option>
                </select>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-4 py-2.5 rounded-xl border border-border bg-surface text-text-primary text-sm outline-none cursor-pointer"
                >
                    <option value="all">All status</option>
                    <option value="queued">Queued</option>
                    <option value="running">Running</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                </select>
            </div>

            {/* Table */}
            <GlassCard className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-text-muted text-xs uppercase tracking-wider border-b border-border-subtle">
                                <th className="px-6 py-3 font-medium">Job ID</th>
                                <th className="px-6 py-3 font-medium">Type</th>
                                <th className="px-6 py-3 font-medium">Status</th>
                                <th className="px-6 py-3 font-medium hidden md:table-cell">Created</th>
                                <th className="px-6 py-3 font-medium hidden md:table-cell">Duration</th>
                                <th className="px-6 py-3 font-medium hidden lg:table-cell">Pages</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                            {paginatedJobs.map((job) => {
                                const duration =
                                    job.started_at && job.completed_at
                                        ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
                                        : null;
                                return (
                                    <tr
                                        key={job.job_id}
                                        onClick={() => setSelectedJob(job.job_id)}
                                        className="hover:bg-surface-elevated/50 transition-colors cursor-pointer"
                                    >
                                        <td className="px-6 py-4 font-mono text-xs text-text-primary">
                                            {job.job_id}
                                        </td>
                                        <td className="px-6 py-4 text-text-secondary capitalize">
                                            {job.type.replace("_", " ")}
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={job.status as JobStatus} />
                                        </td>
                                        <td className="px-6 py-4 hidden md:table-cell text-text-muted text-xs">
                                            {formatDate(job.created_at)}
                                        </td>
                                        <td className="px-6 py-4 hidden md:table-cell text-text-muted text-xs">
                                            {duration ? formatDuration(duration) : "—"}
                                        </td>
                                        <td className="px-6 py-4 hidden lg:table-cell text-text-muted text-xs">
                                            {job.pages_discovered ?? "—"}{job.pages_total ? `/${job.pages_total}` : ""}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {paginatedJobs.length === 0 && (
                    <div className="text-center py-12 text-text-muted">
                        <p className="text-sm">No jobs matching filters</p>
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t border-border-subtle">
                        <span className="text-xs text-text-muted">
                            {filteredJobs.length} total jobs
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(Math.max(1, page - 1))}
                                disabled={page === 1}
                                className="p-1 text-text-muted hover:text-text-secondary disabled:opacity-30 cursor-pointer"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="text-xs text-text-secondary">
                                {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(Math.min(totalPages, page + 1))}
                                disabled={page === totalPages}
                                className="p-1 text-text-muted hover:text-text-secondary disabled:opacity-30 cursor-pointer"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </GlassCard>

            {/* Job Detail Drawer */}
            {selected && (
                <div className="fixed inset-0 z-50 flex justify-end">
                    <div
                        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                        onClick={() => setSelectedJob(null)}
                    />
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                        className="relative w-full max-w-lg bg-surface border-l border-border overflow-y-auto"
                    >
                        <div className="p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-text-primary">Job Detail</h2>
                                <button
                                    onClick={() => setSelectedJob(null)}
                                    className="p-1 text-text-muted hover:text-text-secondary cursor-pointer"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-text-secondary">ID</span>
                                    <span className="text-sm font-mono text-text-primary">{selected.job_id}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-text-secondary">Type</span>
                                    <span className="text-sm text-text-primary capitalize">
                                        {selected.type.replace("_", " ")}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-text-secondary">Status</span>
                                    <StatusBadge status={selected.status as JobStatus} />
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-text-secondary">Created</span>
                                    <span className="text-sm text-text-muted">{formatDate(selected.created_at)}</span>
                                </div>
                                {selected.started_at && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-text-secondary">Started</span>
                                        <span className="text-sm text-text-muted">{formatDate(selected.started_at)}</span>
                                    </div>
                                )}
                                {selected.completed_at && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-text-secondary">Completed</span>
                                        <span className="text-sm text-text-muted">{formatDate(selected.completed_at)}</span>
                                    </div>
                                )}
                                {selected.pages_discovered != null && (
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-text-secondary">Pages</span>
                                        <span className="text-sm text-text-primary">
                                            {selected.pages_discovered}{selected.pages_total ? ` / ${selected.pages_total}` : ""}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {selected.error && (
                                <div className="p-4 rounded-xl bg-error/10 border border-error/20">
                                    <p className="text-sm font-medium text-error">{selected.error.code}</p>
                                    <p className="text-xs text-error/80 mt-1">{selected.error.message}</p>
                                </div>
                            )}

                            <CodeBlock
                                code={JSON.stringify(selected, null, 2)}
                                language="json"
                                className="text-xs"
                            />

                            <button className="btn-ghost text-sm flex items-center gap-2 w-full justify-center">
                                <RotateCcw size={14} />
                                Re-run job
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

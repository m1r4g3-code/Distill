"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/shared/GlassCard";
import { Skeleton } from "@/components/shared/Skeleton";
import { useAppStore } from "@/lib/store";
import { getJobStatus, getJobResults } from "@/lib/api-client";
import type { JobStatusResponse, MapResultsResponse, ExtractionResultsResponse } from "@/types";
import { formatDate } from "@/lib/utils";
import {
    ListTodo,
    Globe,
    Bot,
    Search,
    Clock,
    CheckCircle2,
    XCircle,
    Loader2,
    X,
    RefreshCw,
    ExternalLink,
} from "lucide-react";

const statusConfig = {
    queued: { icon: Clock, color: "text-text-muted", bg: "bg-accent-subtle", label: "Queued" },
    running: { icon: Loader2, color: "text-accent", bg: "bg-accent/10", label: "Running" },
    completed: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: "Completed" },
    failed: { icon: XCircle, color: "text-error", bg: "bg-error/10", label: "Failed" },
    cancelled: { icon: XCircle, color: "text-text-muted", bg: "bg-accent-subtle", label: "Cancelled" },
};

const typeIcons: Record<string, React.ElementType> = {
    map: Globe,
    agent_extract: Bot,
    search_scrape: Search,
};

export default function JobsPage() {
    const { trackedJobs, apiKey, updateTrackedJob } = useAppStore();
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [jobDetail, setJobDetail] = useState<JobStatusResponse | null>(null);
    const [jobResults, setJobResults] = useState<MapResultsResponse | ExtractionResultsResponse | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [typeFilter, setTypeFilter] = useState<string>("all");

    const filteredJobs = trackedJobs.filter((j) => {
        if (statusFilter !== "all" && j.status !== statusFilter) return false;
        if (typeFilter !== "all" && j.type !== typeFilter) return false;
        return true;
    });

    const refreshAllStatuses = useCallback(async () => {
        if (!apiKey || trackedJobs.length === 0) return;
        setRefreshing(true);
        try {
            await Promise.allSettled(
                trackedJobs
                    .filter((j) => j.status === "queued" || j.status === "running")
                    .map(async (j) => {
                        try {
                            const status = await getJobStatus(j.jobId, apiKey);
                            updateTrackedJob(j.jobId, { status: status.status });
                        } catch {
                            // Ignore individual failures
                        }
                    })
            );
        } finally {
            setRefreshing(false);
        }
    }, [apiKey, trackedJobs, updateTrackedJob]);

    // Auto-refresh active job statuses on mount
    useEffect(() => {
        refreshAllStatuses();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSelectJob = async (jobId: string) => {
        setSelectedJobId(jobId);
        setJobDetail(null);
        setJobResults(null);
        setLoadingDetail(true);

        try {
            const status = await getJobStatus(jobId, apiKey);
            setJobDetail(status);
            updateTrackedJob(jobId, { status: status.status });

            if (status.status === "completed") {
                try {
                    const results = await getJobResults(jobId, apiKey);
                    setJobResults(results);
                } catch {
                    // Results may not be available for all job types
                }
            }
        } catch {
            setJobDetail(null);
        } finally {
            setLoadingDetail(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-text-primary">Jobs</h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={refreshAllStatuses}
                        disabled={refreshing}
                        className="btn-ghost text-sm flex items-center gap-2 disabled:opacity-60"
                    >
                        <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-3">
                <div className="flex gap-1 p-0.5 rounded-lg bg-surface-elevated">
                    {["all", "queued", "running", "completed", "failed"].map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors cursor-pointer ${statusFilter === s ? "bg-surface text-text-primary shadow-sm" : "text-text-muted"
                                }`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1 p-0.5 rounded-lg bg-surface-elevated">
                    {["all", "map", "agent_extract", "search_scrape"].map((t) => (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors cursor-pointer ${typeFilter === t ? "bg-surface text-text-primary shadow-sm" : "text-text-muted"
                                }`}
                        >
                            {t === "all" ? "All" : t.replace("_", " ")}
                        </button>
                    ))}
                </div>
            </div>

            {/* Empty state */}
            {trackedJobs.length === 0 && (
                <GlassCard className="text-center py-16 space-y-4">
                    <ListTodo size={48} className="mx-auto text-text-muted opacity-40" />
                    <h2 className="text-lg font-semibold text-text-primary">No jobs yet</h2>
                    <p className="text-sm text-text-secondary max-w-md mx-auto">
                        Jobs will appear here when you run Map or Agent Extract requests
                        from the Playground.
                    </p>
                </GlassCard>
            )}

            {/* Job list */}
            {filteredJobs.length > 0 && (
                <div className="space-y-2">
                    {filteredJobs.map((job) => {
                        const cfg = statusConfig[job.status as keyof typeof statusConfig] || statusConfig.queued;
                        const TypeIcon = typeIcons[job.type] || ListTodo;
                        const StatusIcon = cfg.icon;

                        return (
                            <motion.div
                                key={job.jobId}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                            >
                                <button
                                    onClick={() => handleSelectJob(job.jobId)}
                                    className={`w-full text-left glass-card p-4 cursor-pointer transition-all duration-200 hover:border-accent/30 ${selectedJobId === job.jobId ? "!border-accent/40" : ""
                                        }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${cfg.bg}`}>
                                                <TypeIcon size={16} className={cfg.color} />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-text-primary font-mono">
                                                    {job.jobId.slice(0, 12)}...
                                                </p>
                                                <p className="text-xs text-text-muted capitalize">
                                                    {job.type.replace("_", " ")}
                                                    {job.url && <> · {new URL(job.url).hostname}</>}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`flex items-center gap-1.5 text-xs font-medium ${cfg.color}`}>
                                                <StatusIcon size={12} className={job.status === "running" ? "animate-spin" : ""} />
                                                {cfg.label}
                                            </span>
                                            <span className="text-xs text-text-muted">{formatDate(job.createdAt)}</span>
                                        </div>
                                    </div>
                                </button>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Detail Drawer */}
            <AnimatePresence>
                {selectedJobId && (
                    <div className="fixed inset-0 z-50 flex justify-end">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                            onClick={() => setSelectedJobId(null)}
                        />
                        <motion.div
                            initial={{ x: "100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "100%" }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            className="relative w-full max-w-lg bg-surface border-l border-border overflow-y-auto"
                        >
                            <div className="p-6 space-y-6">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-lg font-semibold text-text-primary">Job Details</h2>
                                    <button
                                        onClick={() => setSelectedJobId(null)}
                                        className="p-1.5 text-text-muted hover:text-text-secondary cursor-pointer"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {loadingDetail ? (
                                    <div className="space-y-4">
                                        <Skeleton className="h-4 w-40" />
                                        <Skeleton className="h-4 w-full" />
                                        <Skeleton className="h-32 w-full" />
                                    </div>
                                ) : jobDetail ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <DetailItem label="Job ID" value={jobDetail.job_id} mono />
                                            <DetailItem label="Type" value={jobDetail.type.replace("_", " ")} />
                                            <DetailItem label="Status" value={jobDetail.status} />
                                            <DetailItem label="Created" value={formatDate(jobDetail.created_at)} />
                                            {jobDetail.started_at && <DetailItem label="Started" value={formatDate(jobDetail.started_at)} />}
                                            {jobDetail.completed_at && <DetailItem label="Completed" value={formatDate(jobDetail.completed_at)} />}
                                            {jobDetail.pages_discovered != null && (
                                                <DetailItem label="Pages" value={`${jobDetail.pages_discovered}${jobDetail.pages_total ? ` / ${jobDetail.pages_total}` : ""}`} />
                                            )}
                                        </div>

                                        {jobDetail.error && (
                                            <div className="p-4 rounded-xl bg-error/10 border border-error/20 space-y-1">
                                                <p className="text-sm font-medium text-error">{jobDetail.error.code}</p>
                                                <p className="text-xs text-error/80">{jobDetail.error.message}</p>
                                            </div>
                                        )}

                                        {jobResults && (
                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold text-text-primary">Results</h3>
                                                <pre className="p-4 rounded-xl bg-surface-elevated border border-border-subtle text-xs font-mono text-text-secondary overflow-auto max-h-80">
                                                    {JSON.stringify(jobResults, null, 2)}
                                                </pre>
                                            </div>
                                        )}

                                        <a
                                            href={`/dashboard/playground?tab=${jobDetail.type === "map" ? "map" : "agent"}`}
                                            className="btn-ghost text-sm flex items-center gap-2 w-fit"
                                        >
                                            <ExternalLink size={14} /> Open in Playground
                                        </a>
                                    </>
                                ) : (
                                    <p className="text-sm text-text-muted">Could not load job details</p>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function DetailItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div className="space-y-1">
            <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
            <p className={`text-sm text-text-primary capitalize ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
        </div>
    );
}

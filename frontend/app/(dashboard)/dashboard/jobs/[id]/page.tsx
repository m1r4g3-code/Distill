"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/shared/GlassCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { CodeBlock } from "@/components/shared/CodeBlock";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { getJobStatus, getJobResults } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { formatDate, formatDuration } from "@/lib/utils";
import type { JobStatusResponse, JobStatus } from "@/types";
import { ArrowLeft, RotateCcw, Download } from "lucide-react";
import Link from "next/link";

export default function JobDetailPage() {
    const params = useParams();
    const jobId = params.id as string;
    const { apiKey } = useAppStore();
    const [job, setJob] = useState<JobStatusResponse | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [results, setResults] = useState<Record<string, any> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            try {
                const jobData = await getJobStatus(jobId, apiKey);
                setJob(jobData);
                if (jobData.status === "completed") {
                    const resultData = await getJobResults(jobId, apiKey);
                    setResults(resultData as Record<string, any>);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load job");
            }
            setLoading(false);
        }
        load();
    }, [jobId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <LoadingSpinner size="large" />
            </div>
        );
    }

    if (error || !job) {
        return (
            <div className="max-w-2xl mx-auto space-y-4">
                <Link href="/dashboard/jobs" className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
                    <ArrowLeft size={16} /> Back to Jobs
                </Link>
                <GlassCard className="text-center py-12">
                    <p className="text-error">{error || "Job not found"}</p>
                </GlassCard>
            </div>
        );
    }

    const duration =
        job.started_at && job.completed_at
            ? new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()
            : null;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <Link href="/dashboard/jobs" className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
                <ArrowLeft size={16} /> Back to Jobs
            </Link>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <GlassCard className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-xl font-bold text-text-primary capitalize">
                                {job.type.replace("_", " ")} Job
                            </h1>
                            <p className="text-sm font-mono text-text-muted mt-1">{job.job_id}</p>
                        </div>
                        <StatusBadge status={job.status as JobStatus} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <p className="text-xs text-text-muted">Created</p>
                            <p className="text-sm text-text-primary">{formatDate(job.created_at)}</p>
                        </div>
                        {job.started_at && (
                            <div className="space-y-1">
                                <p className="text-xs text-text-muted">Started</p>
                                <p className="text-sm text-text-primary">{formatDate(job.started_at)}</p>
                            </div>
                        )}
                        {job.completed_at && (
                            <div className="space-y-1">
                                <p className="text-xs text-text-muted">Completed</p>
                                <p className="text-sm text-text-primary">{formatDate(job.completed_at)}</p>
                            </div>
                        )}
                        {duration && (
                            <div className="space-y-1">
                                <p className="text-xs text-text-muted">Duration</p>
                                <p className="text-sm text-text-primary">{formatDuration(duration)}</p>
                            </div>
                        )}
                    </div>

                    {job.pages_discovered != null && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-text-secondary">Pages</span>
                                <span className="text-text-primary font-medium">
                                    {job.pages_discovered}{job.pages_total ? ` / ${job.pages_total}` : ""}
                                </span>
                            </div>
                            {job.pages_total && (
                                <div className="h-2 rounded-full bg-surface-elevated overflow-hidden">
                                    <div
                                        className="h-full bg-accent rounded-full transition-all duration-500"
                                        style={{ width: `${(job.pages_discovered / job.pages_total) * 100}%` }}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {job.error && (
                        <div className="p-4 rounded-xl bg-error/10 border border-error/20">
                            <p className="text-sm font-medium text-error">{job.error.code}</p>
                            <p className="text-xs text-error/80 mt-1">{job.error.message}</p>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button className="btn-ghost text-sm flex items-center gap-2">
                            <RotateCcw size={14} /> Re-run
                        </button>
                        {results && (
                            <button className="btn-ghost text-sm flex items-center gap-2">
                                <Download size={14} /> Export
                            </button>
                        )}
                    </div>
                </GlassCard>
            </motion.div>

            {/* Raw JSON */}
            <GlassCard>
                <h2 className="font-semibold text-text-primary mb-3">Job Data</h2>
                <CodeBlock code={JSON.stringify(job, null, 2)} language="json" showLineNumbers className="text-xs" />
            </GlassCard>

            {results && (
                <GlassCard>
                    <h2 className="font-semibold text-text-primary mb-3">Results</h2>
                    <CodeBlock code={JSON.stringify(results, null, 2)} language="json" showLineNumbers className="text-xs" />
                </GlassCard>
            )}
        </div>
    );
}

import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types";

const statusConfig: Record<JobStatus, { label: string; color: string; pulse?: boolean }> = {
    queued: { label: "Queued", color: "bg-text-muted/20 text-text-muted" },
    running: { label: "Running", color: "bg-warning/15 text-warning", pulse: true },
    completed: { label: "Completed", color: "bg-success/15 text-success" },
    failed: { label: "Failed", color: "bg-error/15 text-error" },
    cancelled: { label: "Cancelled", color: "bg-text-muted/20 text-text-muted" },
};

export function StatusBadge({
    status,
    className,
}: {
    status: JobStatus;
    className?: string;
}) {
    const config = statusConfig[status];

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
                config.color,
                config.pulse && "animate-pulse-subtle",
                className
            )}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {config.label}
        </span>
    );
}

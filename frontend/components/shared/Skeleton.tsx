import { cn } from "@/lib/utils";

export function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                "rounded-lg animate-pulse-subtle bg-accent-subtle",
                className
            )}
            {...props}
        />
    );
}

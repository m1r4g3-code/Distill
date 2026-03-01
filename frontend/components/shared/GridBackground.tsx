import { cn } from "@/lib/utils";

export function GridBackground({
    children,
    className,
}: {
    children?: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("relative min-h-screen", className)}>
            <div className="grid-background fixed inset-0 -z-10" aria-hidden="true" />
            {children}
        </div>
    );
}

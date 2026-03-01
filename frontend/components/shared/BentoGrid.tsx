import { cn } from "@/lib/utils";

export function BentoGrid({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4",
                className
            )}
        >
            {children}
        </div>
    );
}

export function BentoCard({
    children,
    className,
    span = 1,
}: {
    children: React.ReactNode;
    className?: string;
    span?: 1 | 2;
}) {
    return (
        <div
            className={cn(
                "glass-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
                span === 2 && "md:col-span-2",
                className
            )}
        >
            {children}
        </div>
    );
}

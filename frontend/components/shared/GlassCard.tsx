import { cn } from "@/lib/utils";

export function GlassCard({
    children,
    className,
    hover = false,
    ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
    return (
        <div
            className={cn(
                "glass-card p-6",
                hover && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
}

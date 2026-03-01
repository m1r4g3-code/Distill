import { cn } from "@/lib/utils";

export function LoadingSpinner({
    size = "default",
    className,
}: {
    size?: "small" | "default" | "large";
    className?: string;
}) {
    const sizes = {
        small: "w-4 h-4 border-[2px]",
        default: "w-6 h-6 border-[2px]",
        large: "w-8 h-8 border-[3px]",
    };

    return (
        <div
            className={cn(
                "rounded-full border-text-muted/30 border-t-text-primary animate-spin",
                sizes[size],
                className
            )}
        />
    );
}

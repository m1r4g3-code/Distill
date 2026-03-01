"use client";

export function Logo({ size = "default" }: { size?: "small" | "default" | "large" }) {
    const sizes = {
        small: { icon: 24, text: "text-base" },
        default: { icon: 28, text: "text-lg" },
        large: { icon: 36, text: "text-2xl" },
    };
    const s = sizes[size];

    return (
        <div className="flex items-center gap-2">
            <svg
                width={s.icon}
                height={s.icon}
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <rect width="32" height="32" rx="8" className="fill-accent" />
                <path
                    d="M9 10h6c3.3 0 6 2.7 6 6s-2.7 6-6 6H9V10z"
                    className="stroke-background"
                    strokeWidth="2.5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <circle cx="15" cy="16" r="2" className="fill-background" />
            </svg>
            <span className={`${s.text} font-semibold tracking-tight text-text-primary`}>
                Distill
            </span>
        </div>
    );
}

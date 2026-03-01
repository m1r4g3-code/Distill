"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    if (!mounted) {
        return <div className="w-9 h-9" />;
    }

    return (
        <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="relative w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-surface-elevated transition-all duration-200 cursor-pointer"
            aria-label="Toggle theme"
        >
            {theme === "dark" ? (
                <Sun size={16} className="text-text-secondary" />
            ) : (
                <Moon size={16} className="text-text-secondary" />
            )}
        </button>
    );
}

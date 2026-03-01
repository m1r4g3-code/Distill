"use client";

import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { useAppStore } from "@/lib/store";
import { Menu, Bell } from "lucide-react";

export function TopNav() {
    const { user, toggleSidebar } = useAppStore();

    return (
        <header className="h-16 border-b border-border bg-surface/80 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-30">
            {/* Left */}
            <div className="flex items-center gap-3">
                <button
                    onClick={toggleSidebar}
                    className="lg:hidden p-2 text-text-secondary hover:text-text-primary cursor-pointer"
                >
                    <Menu size={20} />
                </button>
            </div>

            {/* Right */}
            <div className="flex items-center gap-3">
                <ThemeToggle />
                <button className="p-2 text-text-secondary hover:text-text-primary transition-colors cursor-pointer">
                    <Bell size={18} />
                </button>
                <div className="w-8 h-8 rounded-full bg-accent-subtle flex items-center justify-center text-xs font-medium text-text-primary">
                    {user?.name?.charAt(0) || "D"}
                </div>
            </div>
        </header>
    );
}

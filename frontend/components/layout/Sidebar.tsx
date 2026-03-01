"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS } from "@/lib/constants";
import {
    LayoutDashboard,
    Play,
    ListTodo,
    Key,
    BookOpen,
    BarChart3,
    Settings,
    CreditCard,
    LogOut,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
    LayoutDashboard,
    Play,
    ListTodo,
    Key,
    BookOpen,
    BarChart3,
    Settings,
    CreditCard,
};

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="hidden lg:flex flex-col w-64 h-screen border-r border-border bg-surface fixed left-0 top-0 z-40">
            {/* Logo */}
            <div className="h-16 flex items-center px-6 border-b border-border">
                <Link href="/dashboard">
                    <Logo />
                </Link>
            </div>

            {/* Nav items */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {DASHBOARD_NAV_ITEMS.map((item) => {
                    const Icon = iconMap[item.icon] || LayoutDashboard;
                    const isActive =
                        item.href === "/dashboard"
                            ? pathname === "/dashboard"
                            : pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                                isActive
                                    ? "bg-accent-subtle text-text-primary font-medium"
                                    : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
                            )}
                        >
                            <Icon size={18} />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom */}
            <div className="p-3 border-t border-border">
                <button className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-text-muted hover:text-text-secondary hover:bg-surface-elevated transition-colors w-full cursor-pointer">
                    <LogOut size={18} />
                    Sign out
                </button>
            </div>
        </aside>
    );
}

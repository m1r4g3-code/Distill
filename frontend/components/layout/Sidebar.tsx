"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";
import { DASHBOARD_NAV_ITEMS } from "@/lib/constants";
import { createSupabaseBrowserClient } from "@/lib/supabase";
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
    const router = useRouter();
    const [userName, setUserName] = useState("Developer");
    const [userEmail, setUserEmail] = useState("");

    useEffect(() => {
        const supabase = createSupabaseBrowserClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) {
                setUserName(
                    user.user_metadata?.full_name ||
                    user.email?.split("@")[0] ||
                    "Developer"
                );
                setUserEmail(user.email || "");
            }
        });
    }, []);

    const initials = userName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

    const handleSignOut = async () => {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
        router.push("/login");
    };

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

            {/* User Profile + Sign Out */}
            <div className="p-3 border-t border-border space-y-2">
                <div className="flex items-center gap-3 px-3 py-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-accent-subtle border border-border-subtle">
                        <span className="text-accent text-xs font-medium font-mono">
                            {initials}
                        </span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-primary truncate">
                            {userName}
                        </p>
                        <span className="inline-block px-1.5 py-0.5 rounded text-text-muted text-[10px] bg-accent-subtle border border-border-subtle">
                            Free
                        </span>
                    </div>
                </div>
                <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-red-400 hover:bg-surface-elevated transition-all duration-150 w-full cursor-pointer"
                >
                    <LogOut size={14} />
                    Sign out
                </button>
            </div>
        </aside>
    );
}

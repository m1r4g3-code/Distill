"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Play, ListTodo, Key, BarChart3 } from "lucide-react";

const items = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Home" },
    { href: "/dashboard/playground", icon: Play, label: "Playground" },
    { href: "/dashboard/jobs", icon: ListTodo, label: "Jobs" },
    { href: "/dashboard/api-keys", icon: Key, label: "Keys" },
    { href: "/dashboard/usage", icon: BarChart3, label: "Usage" },
];

export function BottomNav() {
    const pathname = usePathname();

    return (
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md px-2 py-1 safe-area-bottom">
            <div className="flex items-center justify-around">
                {items.map((item) => {
                    const isActive =
                        item.href === "/dashboard"
                            ? pathname === "/dashboard"
                            : pathname.startsWith(item.href);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs transition-colors",
                                isActive
                                    ? "text-text-primary"
                                    : "text-text-muted"
                            )}
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}

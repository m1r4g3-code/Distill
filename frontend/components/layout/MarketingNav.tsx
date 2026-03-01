"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Logo } from "@/components/shared/Logo";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { MARKETING_NAV_ITEMS } from "@/lib/constants";
import { Menu, X } from "lucide-react";

export function MarketingNav() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY >= 20);
        };
        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <nav
            className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
            style={
                scrolled
                    ? {}
                    : {
                        background: "transparent",
                        borderBottom: "none",
                    }
            }
        >
            {/* Frosted glass layer — only visible when scrolled */}
            <div
                className="absolute inset-0 transition-opacity duration-300"
                style={{
                    opacity: scrolled ? 1 : 0,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    pointerEvents: "none",
                }}
            />
            {/* Background color + border overlay — respects light/dark */}
            <div
                className="absolute inset-0 transition-opacity duration-300"
                style={{
                    opacity: scrolled ? 1 : 0,
                    pointerEvents: "none",
                }}
            >
                <div
                    className="absolute inset-0 dark:hidden"
                    style={{
                        background: "rgba(250, 250, 250, 0.8)",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                    }}
                />
                <div
                    className="absolute inset-0 hidden dark:block"
                    style={{
                        background: "rgba(10, 10, 11, 0.8)",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                    }}
                />
            </div>

            <div className="relative max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                {/* Left */}
                <Link href="/">
                    <Logo />
                </Link>

                {/* Center links — desktop */}
                <div className="hidden md:flex items-center gap-8">
                    {MARKETING_NAV_ITEMS.map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                        >
                            {item.label}
                        </Link>
                    ))}
                </div>

                {/* Right */}
                <div className="hidden md:flex items-center gap-3">
                    <ThemeToggle />
                    <Link
                        href="/login"
                        className="text-sm text-text-secondary hover:text-text-primary transition-colors px-4 py-2"
                    >
                        Sign in
                    </Link>
                    <Link href="/signup" className="btn-neumorphic text-sm px-5 py-2.5">
                        Get started
                    </Link>
                </div>

                {/* Mobile toggle */}
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="md:hidden p-2 text-text-secondary cursor-pointer"
                >
                    {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
            </div>

            {/* Mobile menu */}
            {mobileOpen && (
                <div className="relative md:hidden px-6 py-4 space-y-3" style={{ background: "var(--surface)" }}>
                    {MARKETING_NAV_ITEMS.map((item) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="block py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                            onClick={() => setMobileOpen(false)}
                        >
                            {item.label}
                        </Link>
                    ))}
                    <div className="flex items-center gap-3 pt-3 border-t border-border-subtle">
                        <ThemeToggle />
                        <Link href="/login" className="text-sm text-text-secondary">
                            Sign in
                        </Link>
                        <Link href="/signup" className="btn-neumorphic text-sm px-4 py-2">
                            Get started
                        </Link>
                    </div>
                </div>
            )}
        </nav>
    );
}

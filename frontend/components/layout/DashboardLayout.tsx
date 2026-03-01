"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { BottomNav } from "@/components/layout/BottomNav";
import { Providers } from "@/components/providers";
import { ApiKeyModal } from "@/components/shared/ApiKeyModal";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <Providers>
            <div className="min-h-screen bg-background">
                <Sidebar />
                <div className="lg:ml-64">
                    <TopNav />
                    <main className="p-6 pb-24 lg:pb-6">{children}</main>
                </div>
                <BottomNav />
                <ApiKeyModal />
            </div>
        </Providers>
    );
}

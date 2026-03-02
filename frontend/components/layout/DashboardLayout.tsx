"use client";

import { useEffect, useRef } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopNav } from "@/components/layout/TopNav";
import { BottomNav } from "@/components/layout/BottomNav";
import { Providers } from "@/components/providers";
import { ApiKeyModal } from "@/components/shared/ApiKeyModal";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { syncAuth } from "@/lib/api-client";
import { toast } from "sonner";

function SyncAuthLoader() {
    const { apiKey, setApiKey } = useAppStore();
    const hasSynced = useRef(false);

    useEffect(() => {
        // If they already have a key or we already tried syncing, do nothing.
        if (apiKey || hasSynced.current) return;

        const sync = async () => {
            try {
                const supabase = createSupabaseBrowserClient();
                const { data: { session } } = await supabase.auth.getSession();

                if (session?.access_token) {
                    hasSynced.current = true;
                    // Try to sync with backend to get an auto-provisioned key
                    const res = await syncAuth(session.access_token);
                    if (res.key?.raw_key) {
                        setApiKey(res.key.raw_key);
                        toast.success("API key automatically provisioned!");
                    }
                }
            } catch (error) {
                console.error("Auth sync failed:", error);
            }
        };

        sync();
    }, [apiKey, setApiKey]);

    return null;
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
    return (
        <Providers>
            <SyncAuthLoader />
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

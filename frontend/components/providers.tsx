"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 30_000,
                        retry: 1,
                        refetchOnWindowFocus: false,
                    },
                },
            })
    );

    return (
        <QueryClientProvider client={queryClient}>
            {children}
            <Toaster
                position="bottom-right"
                toastOptions={{
                    style: {
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
                    },
                }}
            />
        </QueryClientProvider>
    );
}

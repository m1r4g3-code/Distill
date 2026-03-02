import { create } from "zustand";
import { persist } from "zustand/middleware";

interface User {
    id: string;
    email: string;
    name: string;
}

interface TrackedJob {
    jobId: string;
    type: string;
    status: string;
    createdAt: string;
    url?: string;
    query?: string;
}

interface AppState {
    // Auth
    user: User | null;
    setUser: (user: User | null) => void;

    // API Key (for data endpoints — X-API-Key)
    apiKey: string;
    setApiKey: (key: string) => void;

    // Admin Key (for admin endpoints — X-Admin-Key)
    adminKey: string;
    setAdminKey: (key: string) => void;

    // Tracked Jobs (since backend has no list endpoint)
    trackedJobs: TrackedJob[];
    addTrackedJob: (job: TrackedJob) => void;
    updateTrackedJob: (jobId: string, updates: Partial<TrackedJob>) => void;

    // UI
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            // Auth — starts null, populated after Supabase auth
            user: null,
            setUser: (user) => set({ user }),

            // API Key
            apiKey: "",
            setApiKey: (apiKey) => set({ apiKey }),

            // Admin Key
            adminKey: "",
            setAdminKey: (adminKey) => set({ adminKey }),

            // Tracked Jobs
            trackedJobs: [],
            addTrackedJob: (job) =>
                set((state) => ({
                    trackedJobs: [job, ...state.trackedJobs].slice(0, 100),
                })),
            updateTrackedJob: (jobId, updates) =>
                set((state) => ({
                    trackedJobs: state.trackedJobs.map((j) =>
                        j.jobId === jobId ? { ...j, ...updates } : j
                    ),
                })),

            // UI
            sidebarOpen: true,
            setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
            toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
        }),
        {
            name: "distill-store",
            partialize: (state) => ({
                apiKey: state.apiKey,
                adminKey: state.adminKey,
                trackedJobs: state.trackedJobs,
            }),
        }
    )
);

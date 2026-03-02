"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GlassCard } from "@/components/shared/GlassCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Skeleton } from "@/components/shared/Skeleton";
import { useAppStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { listUserApiKeys, createUserApiKey, revokeUserApiKey } from "@/lib/api-client";
import { formatDate, maskApiKey } from "@/lib/utils";
import type { ApiKeyCreateResponse } from "@/types";
import { toast } from "sonner";
import {
    Key,
    Plus,
    Eye,
    EyeOff,
    Copy,
    Check,
    Trash2,
    X,
    AlertTriangle,
    ShieldAlert,
} from "lucide-react";

export default function ApiKeysPage() {
    const { adminKey } = useAppStore();
    const queryClient = useQueryClient();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showRevokeModal, setShowRevokeModal] = useState<string | null>(null);
    const [newKeyName, setNewKeyName] = useState("");
    const [createdKey, setCreatedKey] = useState<ApiKeyCreateResponse | null>(null);
    const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // Fetch keys
    const { data: keys = [], isLoading, isError, error } = useQuery({
        queryKey: ["api-keys"],
        queryFn: async () => {
            const supabase = createSupabaseBrowserClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error("Unauthenticated");
            return listUserApiKeys(session.access_token);
        }
    });

    // Create mutation
    const createMutation = useMutation({
        mutationFn: async (name: string) => {
            const supabase = createSupabaseBrowserClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error("Unauthenticated");
            return createUserApiKey({ name: name || undefined }, session.access_token);
        },
        onSuccess: (data) => {
            setCreatedKey(data);
            queryClient.invalidateQueries({ queryKey: ["api-keys"] });
            toast.success(`API key "${data.name}" created`);
        },
        onError: () => {
            toast.error("Failed to create API key");
        },
    });

    // Revoke mutation
    const revokeMutation = useMutation({
        mutationFn: async (keyId: string) => {
            const supabase = createSupabaseBrowserClient();
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error("Unauthenticated");
            return revokeUserApiKey(keyId, session.access_token);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["api-keys"] });
            setShowRevokeModal(null);
            toast.success("API key revoked");
        },
        onError: () => {
            toast.error("Failed to revoke API key");
        },
    });

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const toggleReveal = (id: string) => {
        setRevealedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-text-primary">API Keys</h1>
                <button
                    onClick={() => {
                        setShowCreateModal(true);
                        setCreatedKey(null);
                        setNewKeyName("");
                    }}
                    className="btn-neumorphic text-sm flex items-center gap-2"
                >
                    <Plus size={14} />
                    Create Key
                </button>
            </div>

            {/* Loading skeleton */}
            {isLoading && (
                <div className="space-y-3">
                    {[1, 2].map((i) => (
                        <GlassCard key={i} className="space-y-3">
                            <div className="flex items-center gap-3">
                                <Skeleton className="w-10 h-10 rounded-lg" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-32" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                            </div>
                            <Skeleton className="h-3 w-full" />
                        </GlassCard>
                    ))}
                </div>
            )}

            {/* Error state */}
            {isError && (
                <GlassCard className="text-center py-8 space-y-3">
                    <AlertTriangle size={32} className="mx-auto text-error" />
                    <p className="text-sm text-error">Failed to load API keys</p>
                    <p className="text-xs text-text-muted">{(error as Error)?.message}</p>
                    <button
                        onClick={() => queryClient.invalidateQueries({ queryKey: ["api-keys"] })}
                        className="btn-ghost text-sm"
                    >
                        Retry
                    </button>
                </GlassCard>
            )}

            {/* Empty state */}
            {!isLoading && !isError && keys.length === 0 && (
                <GlassCard className="text-center py-12 space-y-4">
                    <Key size={48} className="mx-auto text-text-muted opacity-40" />
                    <h2 className="text-lg font-semibold text-text-primary">No API keys yet</h2>
                    <p className="text-sm text-text-secondary">
                        Create your first API key to start making requests.
                    </p>
                </GlassCard>
            )}

            {/* Key Cards */}
            {!isLoading && !isError && keys.length > 0 && (
                <div className="space-y-3">
                    {keys.map((key) => (
                        <GlassCard key={key.id} className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${key.is_active ? "bg-success/15" : "bg-error/15"}`}>
                                        <Key size={16} className={key.is_active ? "text-success" : "text-error"} />
                                    </div>
                                    <div>
                                        <h3 className="font-medium text-text-primary text-sm">{key.name}</h3>
                                        <span className={`text-xs ${key.is_active ? "text-success" : "text-error"}`}>
                                            {key.is_active ? "Active" : "Revoked"}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleReveal(key.id)}
                                        className="p-1.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                                    >
                                        {revealedKeys.has(key.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                    <button
                                        onClick={() => handleCopy(key.id, key.id)}
                                        className="p-1.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                                    >
                                        {copiedId === key.id ? <Check size={14} /> : <Copy size={14} />}
                                    </button>
                                    {key.is_active && (
                                        <button
                                            onClick={() => setShowRevokeModal(key.id)}
                                            className="p-1.5 text-text-muted hover:text-error transition-colors cursor-pointer"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-4 text-xs text-text-muted">
                                <span>
                                    ID: <code className="font-mono">{revealedKeys.has(key.id) ? key.id : maskApiKey(key.id)}</code>
                                </span>
                                <span>Rate limit: {key.rate_limit}/min</span>
                                <span>Created: {formatDate(key.created_at)}</span>
                                {key.last_used_at && <span>Last used: {formatDate(key.last_used_at)}</span>}
                            </div>

                            {key.scopes && (
                                <div className="flex flex-wrap gap-1.5">
                                    {key.scopes.map((scope) => (
                                        <span
                                            key={scope}
                                            className="px-2 py-0.5 rounded-md bg-accent-subtle text-xs text-text-secondary"
                                        >
                                            {scope}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </GlassCard>
                    ))}
                </div>
            )}

            {/* Create Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                            onClick={() => setShowCreateModal(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-md glass-card border border-border p-6 space-y-4"
                        >
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-text-primary">
                                    {createdKey ? "Key Created!" : "Create API Key"}
                                </h2>
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="p-1 text-text-muted hover:text-text-secondary cursor-pointer"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {!createdKey ? (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-text-secondary">Name</label>
                                        <input
                                            type="text"
                                            value={newKeyName}
                                            onChange={(e) => setNewKeyName(e.target.value)}
                                            placeholder="e.g. Production Key"
                                            onKeyDown={(e) => e.key === "Enter" && createMutation.mutate(newKeyName)}
                                            className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary placeholder:text-text-muted text-sm outline-none focus:border-accent transition-colors"
                                        />
                                    </div>
                                    <button
                                        onClick={() => createMutation.mutate(newKeyName)}
                                        disabled={createMutation.isPending}
                                        className="btn-neumorphic w-full text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                                    >
                                        {createMutation.isPending ? <LoadingSpinner size="small" /> : "Create key"}
                                    </button>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                                        <div className="flex items-start gap-2">
                                            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
                                            <p className="text-xs text-warning">
                                                Copy this key now. You won&apos;t be able to see it again.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-elevated">
                                        <code className="text-xs font-mono text-text-primary flex-1 break-all">
                                            {createdKey.raw_key}
                                        </code>
                                        <button
                                            onClick={() => handleCopy(createdKey.raw_key, "new")}
                                            className="p-1.5 text-text-muted hover:text-text-secondary cursor-pointer"
                                        >
                                            {copiedId === "new" ? <Check size={14} /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setShowCreateModal(false)}
                                        className="btn-ghost w-full text-sm"
                                    >
                                        Done
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Revoke Confirmation Modal */}
            <AnimatePresence>
                {showRevokeModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                            onClick={() => setShowRevokeModal(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-sm glass-card border border-border p-6 space-y-4"
                        >
                            <h2 className="text-lg font-semibold text-text-primary">Revoke Key?</h2>
                            <p className="text-sm text-text-secondary">
                                This action cannot be undone. All requests using this key will be rejected.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowRevokeModal(null)}
                                    className="btn-ghost flex-1 text-sm"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => revokeMutation.mutate(showRevokeModal)}
                                    disabled={revokeMutation.isPending}
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-error text-white text-sm font-medium hover:bg-error/90 transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                                >
                                    {revokeMutation.isPending ? <LoadingSpinner size="small" /> : "Revoke"}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

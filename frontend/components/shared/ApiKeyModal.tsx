"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { Key, Shield, ArrowRight } from "lucide-react";

export function ApiKeyModal() {
    const { apiKey, adminKey, setApiKey, setAdminKey } = useAppStore();
    const [localApiKey, setLocalApiKey] = useState("");
    const [localAdminKey, setLocalAdminKey] = useState("");
    const [step, setStep] = useState<1 | 2>(1);

    // Don't show if both keys are already set
    const isOpen = !apiKey;

    if (!isOpen) return null;

    const handleSave = () => {
        if (step === 1) {
            if (!localApiKey.trim()) return;
            setApiKey(localApiKey.trim());
            if (!adminKey) {
                setStep(2);
            }
        } else {
            if (localAdminKey.trim()) {
                setAdminKey(localAdminKey.trim());
            }
            // Close modal — apiKey is already set
        }
    };

    const handleSkipAdmin = () => {
        // Just close — apiKey is set, admin is optional
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                />
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="relative glass-card w-full max-w-md p-8 space-y-6 mx-4"
                >
                    {/* Logo area */}
                    <div className="flex items-center justify-center">
                        <div className="p-3 rounded-2xl bg-accent-subtle border border-border-subtle">
                            {step === 1 ? (
                                <Key size={28} className="text-accent" />
                            ) : (
                                <Shield size={28} className="text-accent" />
                            )}
                        </div>
                    </div>

                    {step === 1 ? (
                        <>
                            <div className="text-center space-y-2">
                                <h2 className="text-xl font-bold text-text-primary">
                                    Connect your API key
                                </h2>
                                <p className="text-sm text-text-secondary leading-relaxed">
                                    Enter your Distill API key to start making requests.
                                    Create one in your backend admin panel.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-text-secondary">
                                    API Key
                                </label>
                                <input
                                    type="password"
                                    value={localApiKey}
                                    onChange={(e) => setLocalApiKey(e.target.value)}
                                    placeholder="sk_..."
                                    autoFocus
                                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                                    className="w-full px-4 py-3 rounded-lg text-sm text-text-primary placeholder:text-text-muted outline-none font-mono bg-glass-bg border border-glass-border focus:border-accent focus:ring-2 focus:ring-accent/10"
                                />
                                <p className="text-xs text-text-muted">
                                    This is the <code className="font-mono">X-API-Key</code> header
                                    used for scrape, map, search, and agent endpoints.
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-center space-y-2">
                                <h2 className="text-xl font-bold text-text-primary">
                                    Admin key (optional)
                                </h2>
                                <p className="text-sm text-text-secondary leading-relaxed">
                                    Enter your admin key to manage API keys from the dashboard.
                                    You can skip this and add it later in Settings.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-text-secondary">
                                    Admin Key
                                </label>
                                <input
                                    type="password"
                                    value={localAdminKey}
                                    onChange={(e) => setLocalAdminKey(e.target.value)}
                                    placeholder="your-admin-key"
                                    autoFocus
                                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                                    className="w-full px-4 py-3 rounded-lg text-sm text-text-primary placeholder:text-text-muted outline-none font-mono bg-glass-bg border border-glass-border focus:border-accent focus:ring-2 focus:ring-accent/10"
                                />
                                <p className="text-xs text-text-muted">
                                    This is the <code className="font-mono">X-Admin-Key</code> header
                                    for the <code className="font-mono">/admin/keys</code> endpoints.
                                </p>
                            </div>
                        </>
                    )}

                    <div className="flex gap-3">
                        {step === 2 && (
                            <button
                                onClick={handleSkipAdmin}
                                className="btn-ghost flex-1 py-3 rounded-lg text-sm"
                            >
                                Skip
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={step === 1 && !localApiKey.trim()}
                            className="btn-neumorphic flex-1 py-3 rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {step === 1 ? (
                                <>
                                    Continue <ArrowRight size={14} />
                                </>
                            ) : (
                                "Save and continue"
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}

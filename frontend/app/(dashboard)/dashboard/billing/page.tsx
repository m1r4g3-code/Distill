"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { GlassCard } from "@/components/shared/GlassCard";
import { Skeleton } from "@/components/shared/Skeleton";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { fetchUserUsage } from "@/lib/api-client";
import {
    CreditCard,
    Check,
    Zap,
    Shield,
    Star,
    Clock,
    FileText,
} from "lucide-react";

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.4 },
    }),
};

const plans = [
    {
        name: "Free",
        price: "$0",
        period: "forever",
        current: true,
        features: ["60 requests/minute", "Unlimited pages", "All endpoints", "Community support"],
    },
    {
        name: "Pro",
        price: "$49",
        period: "/month",
        current: false,
        popular: true,
        features: ["300 requests/minute", "Priority processing", "Email support", "Custom rate limits"],
    },
    {
        name: "Enterprise",
        price: "Custom",
        period: "",
        current: false,
        features: ["Unlimited requests", "Dedicated infrastructure", "SLA guarantee", "Dedicated account manager", "Custom integrations"],
    },
];

function getBarColor(percent: number) {
    if (percent >= 90) return "#ef4444";
    if (percent >= 75) return "#f59e0b";
    return "#818cf8";
}

function AnimatedBar({ current, max }: { current: number; max: number }) {
    const [width, setWidth] = useState(0);
    const percent = max > 0 ? Math.min((current / max) * 100, 100) : 0;
    const color = getBarColor(percent);

    useEffect(() => {
        const timeout = setTimeout(() => setWidth(percent), 100);
        return () => clearTimeout(timeout);
    }, [percent]);

    return (
        <div className="h-2 rounded-full overflow-hidden bg-border-subtle">
            <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                    width: `${width}%`,
                    background: `linear-gradient(90deg, ${color}cc, ${color})`,
                    boxShadow: `0 0 8px ${color}50`,
                }}
            />
        </div>
    );
}

async function getToken() {
    const supabase = createSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
}

export default function BillingPage() {
    const { data: usage, isLoading } = useQuery({
        queryKey: ["usage", "30d"],
        queryFn: async () => {
            const token = await getToken();
            if (!token) return null;
            return fetchUserUsage(token, "30d");
        },
        staleTime: 60_000,
    });

    const totalRequests = usage?.total_requests ?? 0;
    const pagesExtracted = usage?.pages_extracted ?? 0;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-bold text-text-primary">
                Billing
            </motion.h1>

            {/* Current Plan + Usage */}
            <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
                <GlassCard>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-accent-subtle">
                            <CreditCard size={18} className="text-accent" />
                        </div>
                        <div>
                            <h2 className="font-semibold text-text-primary">Current Plan</h2>
                            <p className="text-sm text-text-secondary">Free tier</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mt-5">
                        {/* Requests this month */}
                        <div className="space-y-2">
                            <p className="text-xs text-text-muted">Requests (30 days)</p>
                            {isLoading ? (
                                <Skeleton className="h-6 w-24" />
                            ) : (
                                <p className="text-lg font-semibold text-text-primary font-mono">
                                    {totalRequests.toLocaleString()}
                                </p>
                            )}
                            <AnimatedBar current={totalRequests} max={Math.max(totalRequests, 1000)} />
                        </div>
                        {/* Pages extracted */}
                        <div className="space-y-2">
                            <p className="text-xs text-text-muted">Pages extracted (30 days)</p>
                            {isLoading ? (
                                <Skeleton className="h-6 w-24" />
                            ) : (
                                <p className="text-lg font-semibold text-text-primary font-mono">
                                    {pagesExtracted.toLocaleString()}
                                </p>
                            )}
                            <AnimatedBar current={pagesExtracted} max={Math.max(pagesExtracted, 1000)} />
                        </div>
                        {/* Rate limit */}
                        <div className="space-y-2">
                            <p className="text-xs text-text-muted">Rate limit</p>
                            <p className="text-lg font-semibold text-text-primary flex items-center gap-2">
                                <Clock size={16} className="text-text-muted" /> 60/min
                            </p>
                        </div>
                    </div>
                </GlassCard>
            </motion.div>

            {/* Plan Comparison */}
            <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible">
                <h2 className="text-lg font-semibold text-text-primary pt-2 mb-4">Upgrade your plan</h2>
                <div className="grid md:grid-cols-3 gap-4">
                    {plans.map((plan) => (
                        <div
                            key={plan.name}
                            className={`glass-card p-6 space-y-4 relative transition-all duration-200 hover:-translate-y-0.5 ${plan.popular ? "!border-indigo-400/30" : ""}`}
                            style={{ boxShadow: plan.popular ? "0 0 25px rgba(129,140,248,0.1), 0 0 60px rgba(129,140,248,0.04)" : "none" }}
                        >
                            {plan.popular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-white"
                                    style={{ background: "linear-gradient(135deg, #818cf8, #6366f1)", boxShadow: "0 2px 8px rgba(99,102,241,0.3)" }}
                                >
                                    <Star size={10} /> Most popular
                                </div>
                            )}
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-semibold text-text-primary">{plan.name}</h3>
                                    {plan.current && (
                                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent-subtle border border-border-subtle text-text-muted">Current</span>
                                    )}
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-3xl font-bold text-text-primary">{plan.price}</span>
                                    {plan.period && <span className="text-sm text-text-muted">{plan.period}</span>}
                                </div>
                            </div>
                            <ul className="space-y-2">
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-center gap-2 text-sm text-text-secondary">
                                        <Check size={14} className="text-success shrink-0" /> {feature}
                                    </li>
                                ))}
                            </ul>
                            {plan.current ? (
                                <button disabled className="w-full py-2.5 rounded-lg text-sm text-text-muted cursor-not-allowed border border-border-subtle">Current plan</button>
                            ) : plan.name === "Enterprise" ? (
                                <button className="btn-ghost w-full py-2.5 rounded-lg text-sm">Contact sales</button>
                            ) : (
                                <button
                                    className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 text-white"
                                    style={{ background: "linear-gradient(135deg, #818cf8, #6366f1)", boxShadow: "0 2px 12px rgba(99,102,241,0.3)" }}
                                >
                                    <Zap size={14} /> Upgrade
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Payment Method */}
            <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible">
                <GlassCard>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-accent-subtle"><Shield size={18} className="text-accent" /></div>
                        <h2 className="font-semibold text-text-primary">Payment Method</h2>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-surface-elevated border border-dashed border-border mt-4">
                        <p className="text-sm text-text-muted">No payment method on file</p>
                        <button className="btn-ghost px-4 py-2 rounded-lg text-sm">Add payment method</button>
                    </div>
                </GlassCard>
            </motion.div>

            {/* Billing History */}
            <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible">
                <GlassCard>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 rounded-xl bg-accent-subtle"><FileText size={18} className="text-accent" /></div>
                        <h2 className="font-semibold text-text-primary">Billing History</h2>
                    </div>
                    <div className="text-center py-8 text-text-muted">
                        <p className="text-sm">No billing history — you&apos;re on the free plan.</p>
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/shared/GlassCard";
import {
    CreditCard,
    Check,
    Zap,
    Shield,
    Star,
    Clock,
    FileText,
    Download,
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
        features: ["60 requests/minute", "100 pages/month", "All endpoints", "Community support"],
    },
    {
        name: "Pro",
        price: "$49",
        period: "/month",
        current: false,
        popular: true,
        features: ["300 requests/minute", "10,000 pages/month", "Priority processing", "Email support", "Custom rate limits"],
    },
    {
        name: "Enterprise",
        price: "Custom",
        period: "",
        current: false,
        features: ["Unlimited requests", "Unlimited pages", "Dedicated infrastructure", "SLA guarantee", "Dedicated account manager", "Custom integrations"],
    },
];

const usageBars = [
    { label: "Requests used", current: 847, max: 1000 },
    { label: "Pages extracted", current: 8942, max: 10000 },
];

function getBarColor(percent: number) {
    if (percent >= 90) return "#ef4444";
    if (percent >= 75) return "#f59e0b";
    return "#818cf8";
}

function AnimatedBar({ current, max }: { current: number; max: number }) {
    const [width, setWidth] = useState(0);
    const percent = (current / max) * 100;
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

const invoices = [
    { date: "Mar 1, 2025", amount: "$0.00", status: "Paid", id: "INV-001" },
    { date: "Feb 1, 2025", amount: "$0.00", status: "Paid", id: "INV-002" },
    { date: "Jan 1, 2025", amount: "$0.00", status: "Paid", id: "INV-003" },
];

export default function BillingPage() {
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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5">
                        {usageBars.map((bar) => (
                            <div key={bar.label} className="space-y-2">
                                <p className="text-xs text-text-muted">{bar.label}</p>
                                <p className="text-lg font-semibold text-text-primary font-mono">
                                    {bar.current.toLocaleString()} / {bar.max.toLocaleString()}
                                </p>
                                <AnimatedBar current={bar.current} max={bar.max} />
                            </div>
                        ))}
                        <div className="space-y-2">
                            <p className="text-xs text-text-muted">Rate limit</p>
                            <p className="text-lg font-semibold text-text-primary font-mono">60/min</p>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs text-text-muted">Resets in</p>
                            <p className="text-lg font-semibold text-text-primary flex items-center gap-2">
                                <Clock size={16} className="text-text-muted" /> 28 days
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
                            className={`glass-card p-6 space-y-4 relative transition-all duration-200 hover:-translate-y-0.5 ${plan.popular ? "!border-indigo-400/30" : plan.current ? "!border-border" : ""
                                }`}
                            style={{
                                boxShadow: plan.popular ? "0 0 25px rgba(129,140,248,0.1), 0 0 60px rgba(129,140,248,0.04)" : "none",
                            }}
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
                                <button disabled className="w-full py-2.5 rounded-lg text-sm text-text-muted cursor-not-allowed border border-border-subtle">
                                    Current plan
                                </button>
                            ) : plan.name === "Enterprise" ? (
                                <button className="btn-ghost w-full py-2.5 rounded-lg text-sm">Contact sales</button>
                            ) : (
                                <button
                                    className="w-full py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 text-white"
                                    style={{
                                        background: "linear-gradient(135deg, #818cf8, #6366f1)",
                                        boxShadow: "0 2px 12px rgba(99,102,241,0.3)",
                                    }}
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
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border-subtle">
                                    <th className="pb-2 text-left font-medium text-text-muted text-[11px] tracking-wider uppercase">Date</th>
                                    <th className="pb-2 text-left font-medium text-text-muted text-[11px] tracking-wider uppercase">Invoice</th>
                                    <th className="pb-2 text-left font-medium text-text-muted text-[11px] tracking-wider uppercase">Amount</th>
                                    <th className="pb-2 text-left font-medium text-text-muted text-[11px] tracking-wider uppercase">Status</th>
                                    <th className="pb-2 text-right font-medium text-text-muted text-[11px] tracking-wider uppercase"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map((inv) => (
                                    <tr key={inv.id} className="border-b border-border-subtle">
                                        <td className="py-3 text-text-secondary">{inv.date}</td>
                                        <td className="py-3 text-text-muted text-xs font-mono">{inv.id}</td>
                                        <td className="py-3 text-text-primary font-medium font-mono">{inv.amount}</td>
                                        <td className="py-3">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs text-success bg-success/10">
                                                <Check size={10} /> {inv.status}
                                            </span>
                                        </td>
                                        <td className="py-3 text-right">
                                            <button className="p-1.5 text-text-muted hover:text-text-secondary transition-colors cursor-pointer">
                                                <Download size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}

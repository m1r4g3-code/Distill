"use client";

import { GlassCard } from "@/components/shared/GlassCard";
import { CreditCard, Check, Zap, Shield } from "lucide-react";

const plans = [
    {
        name: "Free",
        price: "$0",
        period: "forever",
        current: true,
        features: [
            "60 requests/minute",
            "100 pages/month",
            "All endpoints",
            "Community support",
        ],
    },
    {
        name: "Pro",
        price: "$49",
        period: "/month",
        current: false,
        features: [
            "300 requests/minute",
            "10,000 pages/month",
            "Priority processing",
            "Email support",
            "Custom rate limits",
        ],
    },
    {
        name: "Enterprise",
        price: "Custom",
        period: "",
        current: false,
        features: [
            "Unlimited requests",
            "Unlimited pages",
            "Dedicated infrastructure",
            "SLA guarantee",
            "Dedicated account manager",
            "Custom integrations",
        ],
    },
];

export default function BillingPage() {
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-text-primary">Billing</h1>

            {/* Current Plan */}
            <GlassCard className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent-subtle">
                        <CreditCard size={18} className="text-accent" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-text-primary">Current Plan</h2>
                        <p className="text-sm text-text-secondary">Free tier</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                        <p className="text-xs text-text-muted">Requests used</p>
                        <p className="text-lg font-semibold text-text-primary">847 / 1,000</p>
                        <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                            <div className="h-full bg-accent rounded-full" style={{ width: "84.7%" }} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-text-muted">Pages extracted</p>
                        <p className="text-lg font-semibold text-text-primary">8,942 / 10,000</p>
                        <div className="h-1.5 rounded-full bg-surface-elevated overflow-hidden">
                            <div className="h-full bg-accent rounded-full" style={{ width: "89.4%" }} />
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-text-muted">Rate limit</p>
                        <p className="text-lg font-semibold text-text-primary">60/min</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-text-muted">Resets in</p>
                        <p className="text-lg font-semibold text-text-primary">28 days</p>
                    </div>
                </div>
            </GlassCard>

            {/* Plan Comparison */}
            <h2 className="text-lg font-semibold text-text-primary pt-4">
                Upgrade your plan
            </h2>

            <div className="grid md:grid-cols-3 gap-4">
                {plans.map((plan) => (
                    <GlassCard
                        key={plan.name}
                        hover
                        className={`space-y-4 ${plan.current ? "border-accent/30 ring-1 ring-accent/20" : ""
                            }`}
                    >
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold text-text-primary">
                                    {plan.name}
                                </h3>
                                {plan.current && (
                                    <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent text-xs font-medium">
                                        Current
                                    </span>
                                )}
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-bold text-text-primary">
                                    {plan.price}
                                </span>
                                {plan.period && (
                                    <span className="text-sm text-text-muted">{plan.period}</span>
                                )}
                            </div>
                        </div>

                        <ul className="space-y-2">
                            {plan.features.map((feature) => (
                                <li
                                    key={feature}
                                    className="flex items-center gap-2 text-sm text-text-secondary"
                                >
                                    <Check size={14} className="text-success shrink-0" />
                                    {feature}
                                </li>
                            ))}
                        </ul>

                        {plan.current ? (
                            <button
                                disabled
                                className="w-full py-2.5 rounded-xl border border-border text-sm text-text-muted cursor-not-allowed"
                            >
                                Current plan
                            </button>
                        ) : plan.name === "Enterprise" ? (
                            <button className="btn-ghost w-full text-sm">
                                Contact sales
                            </button>
                        ) : (
                            <button className="btn-neumorphic w-full text-sm flex items-center justify-center gap-2">
                                <Zap size={14} />
                                Upgrade
                            </button>
                        )}
                    </GlassCard>
                ))}
            </div>
        </div>
    );
}

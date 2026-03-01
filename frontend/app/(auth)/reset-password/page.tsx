"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { z } from "zod";
import { Logo } from "@/components/shared/Logo";
import { GlassCard } from "@/components/shared/GlassCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Lock, Eye, EyeOff, CheckCircle } from "lucide-react";

const schema = z
    .object({
        password: z
            .string()
            .min(8, "Password must be at least 8 characters")
            .regex(/\d/, "Password must contain at least one number"),
        confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords don't match",
        path: ["confirmPassword"],
    });

export default function ResetPasswordPage() {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Listen for the PASSWORD_RECOVERY event from Supabase
    useEffect(() => {
        const supabase = createSupabaseBrowserClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event) => {
                if (event === "PASSWORD_RECOVERY") {
                    // User has clicked the reset link, we're ready
                }
            }
        );
        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setFieldErrors({});

        const result = schema.safeParse({ password, confirmPassword });
        if (!result.success) {
            const errors: Record<string, string> = {};
            result.error.issues.forEach((issue) => {
                const field = issue.path[0] as string;
                if (!errors[field]) errors[field] = issue.message;
            });
            setFieldErrors(errors);
            return;
        }

        setLoading(true);
        try {
            const supabase = createSupabaseBrowserClient();
            const { error: authError } = await supabase.auth.updateUser({
                password,
            });

            if (authError) {
                setError(authError.message);
                setLoading(false);
                return;
            }

            setSuccess(true);
            setLoading(false);
        } catch {
            setError("An unexpected error occurred");
            setLoading(false);
        }
    };

    return (
        <div className="w-full space-y-6">
            <div className="text-center">
                <Link href="/"><div className="inline-block"><Logo size="large" /></div></Link>
            </div>

            <GlassCard className="p-8 sm:p-10 space-y-6 border border-border">
                {success ? (
                    <div className="space-y-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center mx-auto">
                            <CheckCircle size={20} className="text-success" />
                        </div>
                        <h2 className="text-xl font-bold text-text-primary">Password updated</h2>
                        <p className="text-sm text-text-secondary">
                            Your password has been successfully changed.
                        </p>
                        <Link href="/login" className="btn-neumorphic text-sm inline-flex items-center justify-center mt-2">
                            Sign in
                        </Link>
                    </div>
                ) : (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-text-primary">Set new password</h1>
                            <p className="text-sm text-text-secondary mt-1">
                                Enter your new password below
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* New Password */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-text-secondary">New password</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className={`w-full pl-10 pr-12 py-3 rounded-xl border ${fieldErrors.password ? "border-error" : "border-border"} bg-surface text-text-primary placeholder:text-text-muted text-sm outline-none focus:border-accent transition-colors`}
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer">
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {fieldErrors.password && <p className="text-xs text-error">{fieldErrors.password}</p>}
                            </div>

                            {/* Confirm New Password */}
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-text-secondary">Confirm new password</label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className={`w-full pl-10 pr-4 py-3 rounded-xl border ${fieldErrors.confirmPassword ? "border-error" : "border-border"} bg-surface text-text-primary placeholder:text-text-muted text-sm outline-none focus:border-accent transition-colors`}
                                    />
                                </div>
                                {fieldErrors.confirmPassword && <p className="text-xs text-error">{fieldErrors.confirmPassword}</p>}
                            </div>

                            {error && (
                                <p className="text-xs text-error text-center py-2 px-3 rounded-lg bg-error/10">{error}</p>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-neumorphic w-full text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {loading ? <LoadingSpinner size="small" /> : "Update password"}
                            </button>
                        </form>
                    </>
                )}
            </GlassCard>
        </div>
    );
}

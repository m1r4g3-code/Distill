"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { Logo } from "@/components/shared/Logo";
import { GlassCard } from "@/components/shared/GlassCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Mail, ArrowLeft } from "lucide-react";

const schema = z.object({
    email: z.string().email("Please enter a valid email"),
});

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setFieldErrors({});

        const result = schema.safeParse({ email });
        if (!result.success) {
            const errors: Record<string, string> = {};
            result.error.issues.forEach((issue) => {
                errors[issue.path[0] as string] = issue.message;
            });
            setFieldErrors(errors);
            return;
        }

        setLoading(true);
        try {
            const supabase = createSupabaseBrowserClient();
            const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
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
                <Link href="/login" className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-secondary transition-colors w-fit">
                    <ArrowLeft size={14} />
                    Back to sign in
                </Link>

                {success ? (
                    <div className="space-y-4 text-center">
                        <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center mx-auto">
                            <Mail size={20} className="text-success" />
                        </div>
                        <h2 className="text-xl font-bold text-text-primary">Reset link sent</h2>
                        <p className="text-sm text-text-secondary">
                            Check your inbox for a password reset link.
                        </p>
                        <p className="text-xs text-text-muted">
                            Didn&apos;t receive it? Check spam or{" "}
                            <button onClick={() => setSuccess(false)} className="text-text-secondary hover:underline cursor-pointer">
                                try again
                            </button>
                        </p>
                        <Link href="/login" className="text-sm text-text-primary font-medium hover:underline inline-block mt-2">
                            Back to sign in
                        </Link>
                    </div>
                ) : (
                    <>
                        <div>
                            <h1 className="text-2xl font-bold text-text-primary">Reset your password</h1>
                            <p className="text-sm text-text-secondary mt-1">
                                Enter your email and we&apos;ll send you a reset link
                            </p>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-text-secondary">Email</label>
                                <div className="relative">
                                    <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        className={`w-full pl-10 pr-4 py-3 rounded-xl border ${fieldErrors.email ? "border-error" : "border-border"} bg-surface text-text-primary placeholder:text-text-muted text-sm outline-none focus:border-accent transition-colors`}
                                    />
                                </div>
                                {fieldErrors.email && <p className="text-xs text-error">{fieldErrors.email}</p>}
                            </div>

                            {error && (
                                <p className="text-xs text-error text-center py-2 px-3 rounded-lg bg-error/10">{error}</p>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="btn-neumorphic w-full text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {loading ? <LoadingSpinner size="small" /> : "Send reset link"}
                            </button>
                        </form>
                    </>
                )}
            </GlassCard>
        </div>
    );
}

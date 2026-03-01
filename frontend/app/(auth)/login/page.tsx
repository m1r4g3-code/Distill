"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Logo } from "@/components/shared/Logo";
import { GlassCard } from "@/components/shared/GlassCard";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
    email: z.string().email("Please enter a valid email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);

    const handleGoogleSignIn = async () => {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setFieldErrors({});

        const result = loginSchema.safeParse({ email, password });
        if (!result.success) {
            const errors: Record<string, string> = {};
            result.error.issues.forEach((issue) => {
                const field = issue.path[0] as string;
                errors[field] = issue.message;
            });
            setFieldErrors(errors);
            return;
        }

        setLoading(true);
        try {
            const supabase = createSupabaseBrowserClient();
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                setError(authError.message);
                setLoading(false);
                return;
            }

            router.push("/dashboard");
            router.refresh();
        } catch {
            setError("An unexpected error occurred");
            setLoading(false);
        }
    };

    return (
        <div className="w-full space-y-6">
            <div className="text-center">
                <Link href="/">
                    <div className="inline-block">
                        <Logo size="large" />
                    </div>
                </Link>
            </div>

            <GlassCard className="p-8 sm:p-10 space-y-6 border border-border">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-text-primary">Welcome back</h1>
                    <p className="text-sm text-text-secondary mt-1">
                        Sign in to your Distill account
                    </p>
                </div>

                {/* Google OAuth */}
                <button
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border bg-surface hover:bg-surface-elevated transition-colors text-sm font-medium text-text-primary cursor-pointer"
                >
                    <svg width="18" height="18" viewBox="0 0 48 48">
                        <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z" />
                        <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z" />
                        <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z" />
                        <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z" />
                    </svg>
                    Continue with Google
                </button>

                <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-text-muted">or</span>
                    <div className="flex-1 h-px bg-border" />
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Email */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Email</label>
                        <div className="relative">
                            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className={`w-full pl-10 pr-4 py-3 rounded-xl border ${fieldErrors.email ? "border-error" : "border-border"
                                    } bg-surface text-text-primary placeholder:text-text-muted text-sm outline-none focus:border-accent transition-colors`}
                            />
                        </div>
                        {fieldErrors.email && (
                            <p className="text-xs text-error">{fieldErrors.email}</p>
                        )}
                    </div>

                    {/* Password */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-text-secondary">Password</label>
                            <Link href="/forgot-password" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
                                Forgot password?
                            </Link>
                        </div>
                        <div className="relative">
                            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                className={`w-full pl-10 pr-12 py-3 rounded-xl border ${fieldErrors.password ? "border-error" : "border-border"
                                    } bg-surface text-text-primary placeholder:text-text-muted text-sm outline-none focus:border-accent transition-colors`}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary cursor-pointer"
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        {fieldErrors.password && (
                            <p className="text-xs text-error">{fieldErrors.password}</p>
                        )}
                    </div>

                    {error && (
                        <p className="text-xs text-error text-center py-2 px-3 rounded-lg bg-error/10">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-neumorphic w-full text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        {loading ? <LoadingSpinner size="small" /> : "Sign in"}
                    </button>
                </form>

                <p className="text-center text-sm text-text-secondary">
                    Don&apos;t have an account?{" "}
                    <Link href="/signup" className="text-text-primary font-medium hover:underline">
                        Sign up
                    </Link>
                </p>
            </GlassCard>
        </div>
    );
}

"use client";

import { useState } from "react";
import { GlassCard } from "@/components/shared/GlassCard";
import { useAppStore } from "@/lib/store";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { User, Lock, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
    const { user } = useAppStore();
    const [name, setName] = useState(user?.name || "");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSaveProfile = () => {
        setSaving(true);
        setTimeout(() => {
            setSaving(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        }, 800);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold text-text-primary">Settings</h1>

            {/* Profile */}
            <GlassCard className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent-subtle">
                        <User size={18} className="text-accent" />
                    </div>
                    <h2 className="font-semibold text-text-primary">Profile</h2>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary text-sm outline-none focus:border-accent transition-colors"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Email</label>
                        <input
                            type="email"
                            value={user?.email || ""}
                            disabled
                            className="w-full px-4 py-3 rounded-xl border border-border bg-surface-elevated text-text-muted text-sm cursor-not-allowed"
                        />
                    </div>

                    <button
                        onClick={handleSaveProfile}
                        disabled={saving}
                        className="btn-neumorphic text-sm flex items-center gap-2 disabled:opacity-60"
                    >
                        {saving ? (
                            <LoadingSpinner size="small" />
                        ) : saved ? (
                            "Saved ✓"
                        ) : (
                            "Save changes"
                        )}
                    </button>
                </div>
            </GlassCard>

            {/* Password */}
            <GlassCard className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-accent-subtle">
                        <Lock size={18} className="text-accent" />
                    </div>
                    <h2 className="font-semibold text-text-primary">Change Password</h2>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">
                            Current password
                        </label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary text-sm outline-none focus:border-accent transition-colors"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">
                            New password
                        </label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-text-primary text-sm outline-none focus:border-accent transition-colors"
                        />
                    </div>
                    <button className="btn-ghost text-sm">Update password</button>
                </div>
            </GlassCard>

            {/* Danger Zone */}
            <GlassCard className="space-y-4 border-error/30">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-error/15">
                        <AlertTriangle size={18} className="text-error" />
                    </div>
                    <h2 className="font-semibold text-error">Danger Zone</h2>
                </div>
                <p className="text-sm text-text-secondary">
                    Once you delete your account, there is no going back. All your API
                    keys, jobs, and data will be permanently deleted.
                </p>
                <button className="px-4 py-2.5 rounded-xl border border-error text-error text-sm font-medium hover:bg-error/10 transition-colors cursor-pointer">
                    Delete account
                </button>
            </GlassCard>
        </div>
    );
}

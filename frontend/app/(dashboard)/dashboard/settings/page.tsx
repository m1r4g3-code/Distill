"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { useAppStore } from "@/lib/store";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { toast } from "sonner";
import { User, Lock, AlertTriangle, Palette, Key } from "lucide-react";

const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
        opacity: 1,
        y: 0,
        transition: { delay: i * 0.08, duration: 0.4 },
    }),
};

function GlassSection({ children, title, icon: Icon, danger, custom = 0 }: {
    children: React.ReactNode;
    title: string;
    icon: React.ElementType;
    danger?: boolean;
    custom?: number;
}) {
    return (
        <motion.div custom={custom} variants={fadeUp} initial="hidden" animate="visible">
            <div className="glass-card p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${danger ? "bg-error/15" : "bg-accent-subtle"}`}>
                        <Icon size={18} className={danger ? "text-error" : "text-accent"} />
                    </div>
                    <h2 className="font-semibold text-text-primary">{title}</h2>
                </div>
                {children}
            </div>
        </motion.div>
    );
}

function getPasswordStrength(pw: string): { level: number; label: string; color: string } {
    if (pw.length === 0) return { level: 0, label: "", color: "transparent" };
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (pw.length >= 12) score++;
    if (score <= 2) return { level: 1, label: "Weak", color: "#ef4444" };
    if (score <= 3) return { level: 2, label: "Fair", color: "#f59e0b" };
    if (score <= 4) return { level: 3, label: "Good", color: "#3b82f6" };
    return { level: 4, label: "Strong", color: "#22c55e" };
}

export default function SettingsPage() {
    const { user, setUser, apiKey, setApiKey } = useAppStore();
    const [name, setName] = useState(user?.name || "");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [saving, setSaving] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteText, setDeleteText] = useState("");
    const [theme, setTheme] = useState("dark");
    const [notifyEmail, setNotifyEmail] = useState(true);
    const [notifyJobComplete, setNotifyJobComplete] = useState(true);
    const [localApiKey, setLocalApiKey] = useState(apiKey);
    const [isSavingKeys, setIsSavingKeys] = useState(false);

    const passwordStrength = useMemo(() => getPasswordStrength(newPassword), [newPassword]);

    useEffect(() => {
        setName(user?.name || "");
    }, [user]);

    const initials = (user?.name || "D").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.updateUser({
                data: { full_name: name },
            });
            if (error) throw error;
            setUser(user ? { ...user, name } : null);
            toast.success("Profile updated");
        } catch (err) {
            toast.error((err as Error).message || "Failed to update profile");
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (newPassword !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }
        setChangingPassword(true);
        try {
            const supabase = createSupabaseBrowserClient();
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });
            if (error) throw error;
            toast.success("Password updated");
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
        } catch (err) {
            toast.error((err as Error).message || "Failed to change password");
        } finally {
            setChangingPassword(false);
        }
    };

    const handleSaveKeys = () => {
        setIsSavingKeys(true);
        setApiKey(localApiKey);
        toast.success("API Key updated");
        setIsSavingKeys(false);
    };

    const inputCls = "w-full px-4 py-3 rounded-lg text-sm text-text-primary outline-none transition-all duration-150 bg-glass-bg border border-glass-border focus:border-accent focus:ring-2 focus:ring-accent/10";

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-bold text-text-primary">
                Settings
            </motion.h1>

            {/* Profile */}
            <GlassSection title="Profile" icon={User} custom={0}>
                <div className="flex items-center gap-4 mb-2">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center bg-accent-subtle border border-border-subtle">
                        <span className="text-accent text-lg font-bold font-mono">{initials}</span>
                    </div>
                    <div>
                        <p className="text-text-primary font-semibold">{user?.name || "Developer"}</p>
                        <p className="text-sm text-text-muted">{user?.email || ""}</p>
                    </div>
                </div>
                <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Name</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Email</label>
                        <input type="email" value={user?.email || ""} disabled className="w-full px-4 py-3 rounded-lg text-sm text-text-muted cursor-not-allowed bg-surface-elevated border border-border-subtle" />
                    </div>
                    <button onClick={handleSaveProfile} disabled={saving} className="btn-neumorphic py-2.5 px-6 rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2">
                        {saving ? <LoadingSpinner size="small" /> : "Save changes"}
                    </button>
                </div>
            </GlassSection>

            {/* API Keys */}
            <GlassSection title="API Keys" icon={Key} custom={1}>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">API Key (X-API-Key)</label>
                        <input type="password" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} placeholder="sk_..." className={`${inputCls} font-mono`} />
                    </div>
                    <button onClick={handleSaveKeys} disabled={isSavingKeys} className="btn-ghost py-2.5 px-6 rounded-lg text-sm font-medium">
                        {isSavingKeys ? <LoadingSpinner size="small" /> : "Update key"}
                    </button>
                </div>
            </GlassSection>

            {/* Password */}
            <GlassSection title="Change Password" icon={Lock} custom={2}>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Current password</label>
                        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={inputCls} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">New password</label>
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} />
                        {newPassword && (
                            <div className="space-y-1 mt-2">
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4].map((level) => (
                                        <div key={level} className="h-1 flex-1 rounded-full transition-colors duration-300" style={{
                                            background: level <= passwordStrength.level ? passwordStrength.color : "var(--border)",
                                        }} />
                                    ))}
                                </div>
                                <p className="text-xs" style={{ color: passwordStrength.color }}>{passwordStrength.label}</p>
                            </div>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium text-text-secondary">Confirm new password</label>
                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputCls} />
                        {confirmPassword && newPassword !== confirmPassword && (
                            <p className="text-xs text-error mt-1">Passwords do not match</p>
                        )}
                    </div>
                    <button onClick={handleChangePassword} disabled={changingPassword || !newPassword || newPassword !== confirmPassword} className="btn-ghost py-2.5 px-6 rounded-lg text-sm font-medium disabled:opacity-40 flex items-center gap-2">
                        {changingPassword ? <LoadingSpinner size="small" /> : "Update password"}
                    </button>
                </div>
            </GlassSection>

            {/* Preferences */}
            <GlassSection title="Preferences" icon={Palette} custom={3}>
                <div className="space-y-4">
                    <div className="flex items-center justify-between py-1">
                        <div>
                            <p className="text-sm font-medium text-text-secondary">Theme</p>
                            <p className="text-xs text-text-muted mt-0.5">Choose your interface appearance</p>
                        </div>
                        <div className="flex gap-1 p-0.5 rounded-lg bg-surface-elevated">
                            {["dark", "light", "system"].map((t) => (
                                <button key={t} onClick={() => setTheme(t)}
                                    className={`px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer capitalize ${theme === t ? "bg-surface text-text-primary shadow-sm" : "text-text-muted"
                                        }`}
                                >{t}</button>
                            ))}
                        </div>
                    </div>
                    <div className="flex items-center justify-between py-1">
                        <div>
                            <p className="text-sm font-medium text-text-secondary">Email notifications</p>
                            <p className="text-xs text-text-muted mt-0.5">Get notified about important updates</p>
                        </div>
                        <ToggleSwitch checked={notifyEmail} onChange={setNotifyEmail} />
                    </div>
                    <div className="flex items-center justify-between py-1">
                        <div>
                            <p className="text-sm font-medium text-text-secondary">Job completions</p>
                            <p className="text-xs text-text-muted mt-0.5">Email when long-running jobs finish</p>
                        </div>
                        <ToggleSwitch checked={notifyJobComplete} onChange={setNotifyJobComplete} />
                    </div>
                </div>
            </GlassSection>

            {/* Danger Zone */}
            <GlassSection title="Danger Zone" icon={AlertTriangle} danger custom={4}>
                <p className="text-sm text-text-secondary">
                    Permanently delete your account, all API keys, jobs, and usage data. This action is irreversible.
                </p>
                {!showDeleteConfirm ? (
                    <button onClick={() => setShowDeleteConfirm(true)}
                        className="px-4 py-2.5 rounded-lg text-sm font-medium text-error border border-error/30 hover:bg-error/10 transition-colors cursor-pointer"
                    >Delete account</button>
                ) : (
                    <div className="space-y-3 pt-2">
                        <p className="text-xs text-text-muted">
                            Type <span className="text-error font-bold font-mono">DELETE</span> below to confirm:
                        </p>
                        <input type="text" value={deleteText} onChange={(e) => setDeleteText(e.target.value)}
                            placeholder="Type DELETE to confirm"
                            className="w-full px-4 py-3 rounded-lg text-sm text-text-primary outline-none bg-error/5 border border-error/15 font-mono"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => { setShowDeleteConfirm(false); setDeleteText(""); }}
                                className="btn-ghost flex-1 py-2.5 rounded-lg text-sm"
                            >Cancel</button>
                            <button disabled={deleteText !== "DELETE"}
                                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-error cursor-pointer disabled:opacity-30 transition-opacity"
                            >Delete my account</button>
                        </div>
                    </div>
                )}
            </GlassSection>
        </div>
    );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button type="button" onClick={() => onChange(!checked)}
            className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 cursor-pointer ${checked ? "bg-accent" : "bg-border"
                }`}
        >
            <span className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-background shadow-sm transition-transform duration-200"
                style={{ transform: checked ? "translateX(18px)" : "translateX(0)" }}
            />
        </button>
    );
}

"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";
import type { UserRole } from "@/lib/profile";

const ROLE_LABELS: Record<UserRole, string> = {
  client:   "Program Partner",
  supplier: "Production Partner",
  admin:    "Grace Studios Admin",
};

export default function SettingsPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [loading, setLoading]       = useState(true);
  const [role, setRole]             = useState<UserRole>("client");
  const [email, setEmail]           = useState("");
  const [fullName, setFullName]     = useState("");
  const [company, setCompany]       = useState("");

  // Profile save
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved]   = useState(false);
  const [profileError, setProfileError]   = useState("");

  // Password change
  const [currentPw, setCurrentPw]   = useState("");
  const [newPw, setNewPw]           = useState("");
  const [confirmPw, setConfirmPw]   = useState("");
  const [pwSaving, setPwSaving]     = useState(false);
  const [pwSaved, setPwSaved]       = useState(false);
  const [pwError, setPwError]       = useState("");

  useEffect(() => {
    async function load() {
      const profile = await getProfile();
      if (!profile) { router.replace("/login"); return; }
      setRole(profile.role);
      setEmail(profile.email);
      setFullName(profile.full_name ?? "");
      setCompany(profile.company ?? "");
      setLoading(false);
    }
    load();
  }, [router]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProfileSaving(false); return; }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName || null, company: company || null })
      .eq("id", user.id);

    if (error) setProfileError(error.message);
    else { setProfileSaved(true); setTimeout(() => setProfileSaved(false), 2500); }
    setProfileSaving(false);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    if (newPw !== confirmPw) { setPwError("Passwords don't match."); return; }
    if (newPw.length < 8)    { setPwError("Password must be at least 8 characters."); return; }
    setPwSaving(true);

    const { error } = await supabase.auth.updateUser({ password: newPw });

    if (error) setPwError(error.message);
    else {
      setPwSaved(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => setPwSaved(false), 2500);
    }
    setPwSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gs-dark flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const backHref = rolePortal(role);
  const companyLabel = role === "client" ? "Team / Organization Name" : "Company / Factory Name";

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      <header className="border-b border-gs-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <GraceLogo className="h-7" href={backHref} />
          <a href={backHref} className="text-xs font-display font-bold uppercase tracking-widest text-gs-gold hover:text-gs-gold-light transition-colors">
            {role === "admin" ? "Admin Portal" : role === "supplier" ? "Supplier Portal" : "Client Portal"}
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href={backHref} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 flex flex-col items-center">
        <div className="w-full max-w-lg space-y-8">

          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-gs-white">Settings</h1>
            <p className="text-sm text-gs-muted font-barlow mt-1">{email}</p>
          </div>

          {/* Role badge */}
          <div className="flex items-center gap-3 bg-gs-dark-2 border border-gs-border rounded-xl px-5 py-4">
            <div className="w-8 h-8 rounded-full bg-gs-gold/10 border border-gs-gold/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-gs-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-display uppercase tracking-wider text-gs-muted">Account Type</p>
              <p className="text-sm font-barlow text-gs-white font-medium">{ROLE_LABELS[role]}</p>
            </div>
          </div>

          {/* Profile info */}
          <form onSubmit={saveProfile} className="bg-gs-dark-2 border border-gs-border rounded-xl p-6 space-y-5">
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold">Profile</p>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full bg-gs-dark border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2">
                {companyLabel}
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={role === "client" ? "e.g. Riverside High School" : "e.g. Apex Sportswear Ltd."}
                className="w-full bg-gs-dark border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-3 text-gs-muted font-barlow text-sm cursor-not-allowed"
              />
              <p className="text-[10px] font-barlow text-gs-muted mt-1.5 opacity-60">
                Contact Grace Studios to change your email address.
              </p>
            </div>

            {profileError && (
              <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                {profileError}
              </p>
            )}

            <button
              type="submit"
              disabled={profileSaving}
              className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest
                bg-gs-gold text-white hover:bg-gs-gold-light disabled:opacity-40 transition-all"
            >
              {profileSaved ? "Saved ✓" : profileSaving ? "Saving…" : "Save Profile"}
            </button>
          </form>

          {/* Password change */}
          <form onSubmit={changePassword} className="bg-gs-dark-2 border border-gs-border rounded-xl p-6 space-y-5">
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold">Change Password</p>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                className="w-full bg-gs-dark border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Repeat new password"
                className={`w-full bg-gs-dark border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none transition-colors
                  ${confirmPw && confirmPw !== newPw ? "border-[#C41E1E] focus:border-[#C41E1E]" : "border-gs-border focus:border-gs-gold"}`}
              />
            </div>

            {pwError && (
              <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                {pwError}
              </p>
            )}

            <button
              type="submit"
              disabled={pwSaving || !newPw || !confirmPw}
              className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest
                bg-gs-dark-3 border border-gs-border text-gs-white hover:border-gs-gold disabled:opacity-40 transition-all"
            >
              {pwSaved ? "Password Updated ✓" : pwSaving ? "Updating…" : "Update Password"}
            </button>
          </form>

          {/* Sign out */}
          <div className="border-t border-gs-border pt-6">
            <button
              type="button"
              onClick={signOut}
              className="text-xs font-display uppercase tracking-widest text-gs-muted hover:text-[#C41E1E] transition-colors"
            >
              Sign Out
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}

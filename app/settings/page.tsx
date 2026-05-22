"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import { useTenant } from "@/lib/tenant/context";
import type { UserRole } from "@/lib/profile";

const ROLE_LABELS: Record<UserRole, string> = {
  client:      "Program Partner",
  supplier:    "Production Partner",
  designer:    "Designer",
  sales_rep:   "Sales Representative",
  admin:       "Company Admin",
  super_admin: "Platform Super Admin",
};

export default function SettingsPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;
  const tenant      = useTenant();

  const [loading, setLoading]       = useState(true);
  const [role, setRole]             = useState<UserRole>("client");
  const [email, setEmail]           = useState("");
  const [fullName, setFullName]     = useState("");
  const [company, setCompany]       = useState("");

  // Team info (clients table — only shown for client role)
  const [teamName, setTeamName]         = useState("");
  const [contactName, setContactName]   = useState("");
  const [city, setCity]                 = useState("");
  const [hasTeam, setHasTeam]           = useState(false);
  const [teamSaving, setTeamSaving]     = useState(false);
  const [teamSaved, setTeamSaved]       = useState(false);
  const [teamError, setTeamError]       = useState("");

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

      // Load team info for client accounts
      if (profile.role === "client" || profile.role === "admin") {
        const res = await fetch("/api/client/team");
        if (res.ok) {
          const { client } = await res.json();
          if (client) {
            setHasTeam(true);
            setTeamName(client.name ?? "");
            setContactName(client.contact_name ?? "");
            setCity(client.city ?? "");
          }
        }
      }

      setLoading(false);
    }
    load();
  }, [router]);

  async function saveTeamInfo(e: React.FormEvent) {
    e.preventDefault();
    setTeamSaving(true);
    setTeamError("");
    const res = await fetch("/api/client/team", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name: teamName, contact_name: contactName, city }),
    });
    const data = await res.json();
    if (!res.ok) setTeamError(data.error ?? "Failed to save");
    else { setTeamSaved(true); setTimeout(() => setTeamSaved(false), 2500); }
    setTeamSaving(false);
  }

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
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const backHref = rolePortal(role);
  const companyLabel = role === "client" ? "Team / Organization Name" : "Company / Factory Name";

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TenantLogo className="h-7" href={backHref} />
          <a href={backHref} className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            {role === "admin" ? "Admin Portal" : role === "supplier" ? "Supplier Portal" : "Client Portal"}
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href={backHref} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 flex flex-col items-center">
        <div className="w-full max-w-lg space-y-8">

          <div>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">Settings</h1>
            <p className="text-sm text-brand-muted font-barlow mt-1">{email}</p>
          </div>

          {/* Role badge */}
          <div className="flex items-center gap-3 bg-brand-surface border border-brand-border rounded-xl px-5 py-4">
            <div className="w-8 h-8 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted">Account Type</p>
              <p className="text-sm font-barlow text-brand-text font-medium">{ROLE_LABELS[role]}</p>
            </div>
          </div>

          {/* Team info — clients only */}
          {hasTeam && role === "client" && (
            <form onSubmit={saveTeamInfo} className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Team Info</p>

              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                  Team / Program Name
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Westside Warriors"
                  required
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="e.g. Coach Johnson"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Atlanta, GA"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
                  />
                </div>
              </div>

              {teamError && (
                <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                  {teamError}
                </p>
              )}

              <button
                type="submit"
                disabled={teamSaving || !teamName.trim()}
                className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest
                  bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 transition-all"
              >
                {teamSaved ? "Saved ✓" : teamSaving ? "Saving…" : "Save Team Info"}
              </button>
            </form>
          )}

          {/* Profile info */}
          <form onSubmit={saveProfile} className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Profile</p>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                {companyLabel}
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={role === "client" ? "e.g. Riverside High School" : "e.g. Apex Sportswear Ltd."}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-muted font-barlow text-sm cursor-not-allowed"
              />
              <p className="text-[10px] font-barlow text-brand-muted mt-1.5 opacity-60">
                Contact {tenant.name} to change your email address.
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
                bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 transition-all"
            >
              {profileSaved ? "Saved ✓" : profileSaving ? "Saving…" : "Save Profile"}
            </button>
          </form>

          {/* Password change */}
          <form onSubmit={changePassword} className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Change Password</p>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Repeat new password"
                className={`w-full bg-brand-bg border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none transition-colors
                  ${confirmPw && confirmPw !== newPw ? "border-[#C41E1E] focus:border-[#C41E1E]" : "border-brand-border focus:border-brand-primary"}`}
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
                bg-brand-surface border border-brand-border text-brand-text hover:border-brand-primary disabled:opacity-40 transition-all"
            >
              {pwSaved ? "Password Updated ✓" : pwSaving ? "Updating…" : "Update Password"}
            </button>
          </form>

          {/* Sign out */}
          <div className="border-t border-brand-border pt-6">
            <button
              type="button"
              onClick={signOut}
              className="text-xs font-display uppercase tracking-widest text-brand-muted hover:text-[#C41E1E] transition-colors"
            >
              Sign Out
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/admin";
import { getProfile } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";

interface AdminProfile {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  created_at: string;
  is_env_admin: boolean;
}

const ENV_ADMINS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default function AdminTeamPage() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const [admins, setAdmins] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantEmail, setGrantEmail] = useState("");
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState("");
  const [grantSuccess, setGrantSuccess] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);

  // Reset password state
  const [resetEmail, setResetEmail]       = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting]         = useState(false);
  const [resetError, setResetError]       = useState("");
  const [resetSuccess, setResetSuccess]   = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const profile = await getProfile();
      if (!user || (!isAdmin(user.email) && profile?.role !== "admin")) {
        router.replace("/portal");
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, company, created_at")
        .eq("role", "admin")
        .order("created_at");

      setAdmins(
        (profiles ?? []).map((p) => ({
          ...p,
          is_env_admin: ENV_ADMINS.includes(p.email.toLowerCase()),
        }))
      );
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function grantAdmin(e: React.FormEvent) {
    e.preventDefault();
    setGrantError("");
    setGrantSuccess("");
    const email = grantEmail.trim().toLowerCase();
    if (!email) return;
    setGranting(true);

    // Find the profile by email
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email, full_name, company, created_at")
      .eq("email", email)
      .single();

    if (!profile) {
      setGrantError("No account found with that email. They need to sign up first.");
      setGranting(false);
      return;
    }

    // Grant admin role
    const { error } = await supabase
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", profile.id);

    if (error) {
      setGrantError(error.message);
    } else {
      setAdmins((prev) => {
        if (prev.find((a) => a.id === profile.id)) return prev;
        return [...prev, { ...profile, is_env_admin: ENV_ADMINS.includes(email) }];
      });
      setGrantSuccess(`${email} is now an admin.`);
      setGrantEmail("");
      setTimeout(() => setGrantSuccess(""), 3000);
    }
    setGranting(false);
  }

  async function resetUserPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");
    const email    = resetEmail.trim().toLowerCase();
    const password = resetPassword;
    if (!email || !password) return;
    setResetting(true);

    const res  = await fetch("/api/admin/reset-user-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const body = await res.json() as { success?: boolean; error?: string };

    if (!res.ok || body.error) {
      setResetError(body.error ?? "Something went wrong.");
    } else {
      setResetSuccess(`Password updated for ${email}.`);
      setResetEmail("");
      setResetPassword("");
      setTimeout(() => setResetSuccess(""), 4000);
    }
    setResetting(false);
  }

  async function revokeAdmin(id: string, email: string) {
    if (ENV_ADMINS.includes(email.toLowerCase())) {
      alert("This admin is set via the NEXT_PUBLIC_ADMIN_EMAILS environment variable and cannot be removed here. Update your .env to remove them.");
      return;
    }
    if (!confirm("Remove admin access for this user?")) return;
    setRevoking(id);
    await supabase.from("profiles").update({ role: "client" }).eq("id", id);
    setAdmins((prev) => prev.filter((a) => a.id !== id));
    setRevoking(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gs-dark flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      <header className="border-b border-gs-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <GraceLogo className="h-7" href="/admin" />
          <a href="/admin" className="text-xs font-display font-bold uppercase tracking-widest text-gs-gold hover:text-gs-gold-light transition-colors">
            Admin Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Supplier Portal</a>
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Client Portal</a>
          <a href="/admin" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-8">

          <div>
            <h1 className="font-display text-xl font-bold uppercase tracking-wide text-gs-white">Grace Studios Team</h1>
            <p className="text-xs text-gs-muted font-barlow mt-1">
              Manage who has admin access to the platform.
            </p>
          </div>

          {/* ENV admin note */}
          {ENV_ADMINS.length > 0 && (
            <div className="bg-gs-dark-3 border border-gs-border rounded-xl px-5 py-4">
              <p className="text-[10px] font-display uppercase tracking-wider text-gs-muted mb-1">
                Environment Admins
              </p>
              <p className="text-xs font-barlow text-gs-muted">
                These emails are hardcoded via <span className="font-mono text-gs-white">NEXT_PUBLIC_ADMIN_EMAILS</span> and always have access:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ENV_ADMINS.map((e) => (
                  <span key={e} className="px-2.5 py-1 rounded-full bg-gs-gold/10 border border-gs-gold/30 text-xs font-mono text-gs-gold">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Current admins */}
          <div className="space-y-3">
            <p className="text-[10px] font-display uppercase tracking-widest text-gs-gold">Admin Accounts</p>
            {admins.length === 0 ? (
              <div className="border border-gs-border rounded-xl p-8 text-center">
                <p className="text-gs-muted font-barlow text-sm">No admin profiles yet.</p>
                <p className="text-xs text-gs-muted font-barlow mt-1 opacity-60">Use the form below to grant access.</p>
              </div>
            ) : (
              <div className="border border-gs-border rounded-xl overflow-hidden">
                {admins.map((a, i) => (
                  <div
                    key={a.id}
                    className={`flex items-center gap-4 px-5 py-4 ${i < admins.length - 1 ? "border-b border-gs-border" : ""}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-gs-gold/10 border border-gs-gold/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-display font-bold text-gs-gold">
                        {(a.full_name ?? a.email)[0].toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-barlow text-gs-white font-medium truncate">
                          {a.full_name ?? a.email}
                        </p>
                        {a.is_env_admin && (
                          <span className="flex-shrink-0 text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded bg-gs-dark border border-gs-border text-gs-muted">
                            ENV
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gs-muted truncate">{a.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revokeAdmin(a.id, a.email)}
                      disabled={revoking === a.id}
                      className="flex-shrink-0 text-[10px] font-display uppercase tracking-wider text-gs-muted hover:text-[#C41E1E] transition-colors disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reset user password */}
          <form onSubmit={resetUserPassword} className="bg-gs-dark-2 border border-gs-border rounded-xl p-6 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold">Reset User Password</p>
            <p className="text-xs font-barlow text-gs-muted">
              Force-set a new password for any user account. Works for clients, suppliers, and admins.
            </p>
            <div className="space-y-3">
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="user@email.com"
                required
                className="w-full bg-gs-dark border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
              />
              <input
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="New password (min 8 characters)"
                required
                minLength={8}
                className="w-full bg-gs-dark border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
              />
            </div>
            {resetError && (
              <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                {resetError}
              </p>
            )}
            {resetSuccess && (
              <p className="text-green-400 text-sm font-barlow bg-green-400/10 border border-green-400/30 rounded-lg px-4 py-3">
                {resetSuccess}
              </p>
            )}
            <button
              type="submit"
              disabled={resetting || !resetEmail.trim() || resetPassword.length < 8}
              className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-gs-dark border border-gs-border text-gs-white hover:border-gs-gold hover:text-gs-gold disabled:opacity-40 transition-all"
            >
              {resetting ? "Updating…" : "Set New Password"}
            </button>
          </form>

          {/* Grant access form */}
          <form onSubmit={grantAdmin} className="bg-gs-dark-2 border border-gs-border rounded-xl p-6 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold">Grant Admin Access</p>
            <p className="text-xs font-barlow text-gs-muted">
              The person must already have an account. Enter their email address to promote them to admin.
            </p>
            <div>
              <input
                type="email"
                value={grantEmail}
                onChange={(e) => setGrantEmail(e.target.value)}
                placeholder="team@gracestudios.com"
                className="w-full bg-gs-dark border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
              />
            </div>
            {grantError && (
              <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                {grantError}
              </p>
            )}
            {grantSuccess && (
              <p className="text-green-400 text-sm font-barlow bg-green-400/10 border border-green-400/30 rounded-lg px-4 py-3">
                {grantSuccess}
              </p>
            )}
            <button
              type="submit"
              disabled={granting || !grantEmail.trim()}
              className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-gs-gold text-gs-dark hover:bg-gs-gold-light disabled:opacity-40 transition-all"
            >
              {granting ? "Granting…" : "Grant Admin Access"}
            </button>
          </form>

        </div>
      </main>
    </div>
  );
}

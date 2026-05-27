"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import AdminHeader from "@/components/AdminHeader";
import { useTenant } from "@/lib/tenant/context";
import type { UserRole } from "@/lib/supabase/types";

interface TeamMember {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

const ROLE_LABELS: Partial<Record<UserRole, string>> = {
  admin:     "Admin",
  designer:  "Designer",
  sales_rep: "Sales Rep",
};

const ROLE_COLORS: Partial<Record<UserRole, string>> = {
  admin:     "text-brand-primary border-brand-primary/30 bg-brand-primary/10",
  designer:  "text-violet-400 border-violet-400/30 bg-violet-400/10",
  sales_rep: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
};

export default function AdminTeamPage() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const tenant = useTenant();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole]   = useState<"admin" | "designer" | "sales_rep">("designer");
  const [inviting, setInviting]       = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  // Reset password
  const [resetEmail, setResetEmail]       = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetting, setResetting]         = useState(false);
  const [resetError, setResetError]       = useState("");
  const [resetSuccess, setResetSuccess]   = useState("");

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      const profile = await getProfile();
      if (!user || (profile?.role !== "admin" && profile?.role !== "super_admin")) {
        router.replace("/portal");
        return;
      }
      const res = await fetch("/api/admin/team/members");
      if (res.ok) {
        const { members: m } = await res.json() as { members: TeamMember[] };
        setMembers(m ?? []);
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    setInviteSuccess("");
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);

    const res = await fetch("/api/admin/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
    });
    const body = await res.json() as { member?: TeamMember; already_existed?: boolean; error?: string };

    if (!res.ok || body.error) {
      setInviteError(body.error ?? "Something went wrong.");
    } else if (body.member) {
      setMembers((prev) => {
        if (prev.find((m) => m.id === body.member!.id)) {
          return prev.map((m) => m.id === body.member!.id ? body.member! : m);
        }
        return [...prev, body.member!];
      });
      setInviteSuccess(
        body.already_existed
          ? `${email} already had an account. Role updated to ${ROLE_LABELS[inviteRole]}.`
          : `Invite sent to ${email} as ${ROLE_LABELS[inviteRole]}.`,
      );
      setInviteEmail("");
      setTimeout(() => setInviteSuccess(""), 4000);
    }
    setInviting(false);
  }

  async function removeMember(id: string, email: string) {
    if (!confirm(`Remove ${email} from the team?`)) return;
    setRemoving(id);

    const res = await fetch("/api/admin/set-user-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: "client" }),
    });
    const body = await res.json() as { success?: boolean; error?: string };

    if (!res.ok || body.error) {
      alert(body.error ?? "Failed to remove member.");
    } else {
      setMembers((prev) => prev.filter((m) => m.id !== id));
    }
    setRemoving(null);
  }

  async function resetUserPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetError("");
    setResetSuccess("");
    const email    = resetEmail.trim().toLowerCase();
    const password = resetPassword;
    if (!email || !password) return;
    setResetting(true);

    const res = await fetch("/api/admin/reset-user-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
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

  const groupedRoles: Array<"admin" | "designer" | "sales_rep"> = ["admin", "designer", "sales_rep"];

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <AdminHeader onSignOut={signOut} activePath="/admin/team" />

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-2xl space-y-8">

          <div>
            <h1 className="font-display text-xl font-bold uppercase tracking-wide text-brand-text">{tenant.name} Team</h1>
            <p className="text-xs text-brand-muted font-barlow mt-1">
              Invite designers, sales reps, and admins. Invited users receive a login link by email.
            </p>
          </div>

          {/* Team roster grouped by role */}
          {groupedRoles.map((role) => {
            const group = members.filter((m) => m.role === role);
            if (group.length === 0) return null;
            return (
              <div key={role} className="space-y-2">
                <p className="text-[10px] font-display uppercase tracking-widest text-brand-primary">
                  {ROLE_LABELS[role]}s ({group.length})
                </p>
                <div className="border border-brand-border rounded-xl overflow-hidden">
                  {group.map((m, i) => (
                    <div
                      key={m.id}
                      className={`flex items-center gap-4 px-5 py-4 ${i < group.length - 1 ? "border-b border-brand-border" : ""}`}
                    >
                      <div className="w-8 h-8 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-display font-bold text-brand-primary">
                          {(m.full_name ?? m.email)[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-barlow text-brand-text font-medium truncate">
                            {m.full_name ?? m.email}
                          </p>
                          <span className={`flex-shrink-0 text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded border ${ROLE_COLORS[m.role] ?? ""}`}>
                            {ROLE_LABELS[m.role] ?? m.role}
                          </span>
                        </div>
                        <p className="text-xs text-brand-muted truncate">{m.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeMember(m.id, m.email)}
                        disabled={removing === m.id}
                        className="flex-shrink-0 text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-[#C41E1E] transition-colors disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {members.length === 0 && (
            <div className="border border-brand-border rounded-xl p-8 text-center">
              <p className="text-brand-muted font-barlow text-sm">No team members yet.</p>
              <p className="text-xs text-brand-muted font-barlow mt-1 opacity-60">Use the form below to invite your first team member.</p>
            </div>
          )}

          {/* Invite form */}
          <form onSubmit={inviteMember} className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Invite Team Member</p>
            <p className="text-xs font-barlow text-brand-muted">
              They will receive a login link by email. New users must set a password on first login.
            </p>
            <div className="space-y-3">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="designer@yourcompany.com"
                required
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
              />
              <div className="flex gap-2">
                {(["designer", "sales_rep", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setInviteRole(r)}
                    className={`px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider border transition-colors ${
                      inviteRole === r
                        ? "bg-brand-primary text-white border-brand-primary"
                        : "bg-brand-bg border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-primary"
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            {inviteError && (
              <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                {inviteError}
              </p>
            )}
            {inviteSuccess && (
              <p className="text-green-400 text-sm font-barlow bg-green-400/10 border border-green-400/30 rounded-lg px-4 py-3">
                {inviteSuccess}
              </p>
            )}
            <button
              type="submit"
              disabled={inviting || !inviteEmail.trim()}
              className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-brand-bg hover:bg-brand-secondary disabled:opacity-40 transition-all"
            >
              {inviting ? "Sending Invite…" : `Invite as ${ROLE_LABELS[inviteRole]}`}
            </button>
          </form>

          {/* Reset user password */}
          <form onSubmit={resetUserPassword} className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Reset User Password</p>
            <p className="text-xs font-barlow text-brand-muted">
              Force-set a new password for any user account.
            </p>
            <div className="space-y-3">
              <input
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder="user@email.com"
                required
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
              />
              <input
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="New password (min 8 characters)"
                required
                minLength={8}
                className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
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
              className="w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-bg border border-brand-border text-brand-text hover:border-brand-primary hover:text-brand-primary disabled:opacity-40 transition-all"
            >
              {resetting ? "Updating…" : "Set New Password"}
            </button>
          </form>

        </div>
      </main>
    </div>
  );
}

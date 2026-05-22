"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import { useTenant } from "@/lib/tenant/context";

function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState("");
  const [ready, setReady]         = useState(false);

  // Wait for Supabase to establish the recovery session from the URL hash
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    // Also check if session already exists (page refresh case)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setSubmitting(true);
    setError("");

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    // Route to the right portal
    const profile = await getProfile();
    router.replace(profile ? rolePortal(profile.role) : "/portal");
  }

  if (!ready) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-brand-muted font-barlow text-sm">Verifying reset link…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">
          New Password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 8 characters"
          required
          autoFocus
          className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors duration-200"
        />
      </div>

      <div>
        <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">
          Confirm Password
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat password"
          required
          className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors duration-200"
        />
      </div>

      {error && (
        <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !password || !confirm}
        className="w-full py-4 rounded-lg font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
          bg-brand-primary text-white hover:bg-brand-secondary
          disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {submitting ? "Updating…" : "Set New Password →"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  const tenant = useTenant();
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <div className="h-px w-full bg-brand-primary" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-[360px] animate-fade-up space-y-10">

          <div className="text-center space-y-5">
            <div className="flex justify-center">
              <TenantLogo className="h-12" href="/login" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text leading-none">
                New Password
              </h1>
              <p className="text-xs font-display uppercase tracking-[0.2em] text-brand-muted">
                {tenant.name}
              </p>
            </div>
          </div>

          <div className="h-px bg-brand-border w-full" />

          <Suspense fallback={
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
            </div>
          }>
            <ResetPasswordForm />
          </Suspense>

        </div>
      </div>

      <div className="h-px w-full bg-brand-border" />
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import { useTenant } from "@/lib/tenant/context";

export default function LoginPage() {
  const router = useRouter();
  const tenant = useTenant();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");

  // Redirect already-logged-in users to their portal
  useEffect(() => {
    getProfile().then((profile) => {
      if (profile) router.replace(rolePortal(profile.role));
      else setLoading(false);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    // Fetch profile to know where to send them
    const profile = await getProfile();
    router.replace(profile ? rolePortal(profile.role) : "/portal");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <div className="h-px w-full bg-brand-primary" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-[360px] animate-fade-up space-y-10">

          {/* Logo + wordmark */}
          <div className="text-center space-y-5">
            <div className="flex justify-center">
              <TenantLogo className="h-12" href="/login" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-brand-text leading-none">
                Partner Portal
              </h1>
              <p className="text-xs font-display uppercase tracking-[0.2em] text-brand-muted">
                {tenant.name}
              </p>
            </div>
          </div>

          <div className="h-px bg-brand-border w-full" />

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourteam.com"
                required
                autoFocus
                className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors duration-200"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted">
                  Password
                </label>
                <Link href="/forgot-password" className="text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
              disabled={submitting || !email || !password}
              className="w-full py-4 rounded-lg font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                bg-brand-primary text-white hover:bg-brand-secondary
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Signing in…" : "Sign In →"}
            </button>
          </form>

          <div className="text-center space-y-3">
            <div className="h-px bg-brand-border" />
            <p className="text-xs text-brand-muted font-barlow">
              New to {tenant.name}?{" "}
              <Link href="/signup" className="text-brand-text hover:text-brand-primary transition-colors underline underline-offset-2">
                Create an account
              </Link>
            </p>
          </div>

        </div>
      </div>

      <div className="h-px w-full bg-brand-border" />
    </div>
  );
}

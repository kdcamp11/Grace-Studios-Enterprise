"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import GraceLogo from "@/components/GraceLogo";

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent]         = useState(false);
  const [error, setError]       = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    setSent(true);
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      <div className="h-px w-full bg-gs-gold" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-[360px] animate-fade-up space-y-10">

          <div className="text-center space-y-5">
            <div className="flex justify-center">
              <GraceLogo className="h-12" href="/login" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-gs-white leading-none">
                Reset Password
              </h1>
              <p className="text-xs font-display uppercase tracking-[0.2em] text-gs-muted">
                Grace Athletics
              </p>
            </div>
          </div>

          <div className="h-px bg-gs-border w-full" />

          {sent ? (
            <div className="space-y-6 text-center">
              <div className="bg-green-400/10 border border-green-400/30 rounded-xl px-5 py-6">
                <p className="text-green-400 font-display text-sm uppercase tracking-wider mb-2">Check your email</p>
                <p className="text-gs-muted font-barlow text-sm leading-relaxed">
                  We sent a reset link to <span className="text-gs-white">{email}</span>. Click it to set a new password.
                </p>
              </div>
              <Link
                href="/login"
                className="block text-xs font-display uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors"
              >
                ← Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-sm font-barlow text-gs-muted leading-relaxed">
                Enter your account email and we&apos;ll send you a link to reset your password.
              </p>
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourteam.com"
                  required
                  autoFocus
                  className="w-full bg-gs-dark-2 border border-gs-border rounded-lg px-4 py-3.5 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors duration-200"
                />
              </div>

              {error && (
                <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !email}
                className="w-full py-4 rounded-lg font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                  bg-gs-gold text-white hover:bg-gs-gold-light
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Sending…" : "Send Reset Link →"}
              </button>

              <div className="text-center pt-1">
                <Link href="/login" className="text-xs font-display uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">
                  ← Back to sign in
                </Link>
              </div>
            </form>
          )}

        </div>
      </div>

      <div className="h-px w-full bg-gs-border" />
    </div>
  );
}

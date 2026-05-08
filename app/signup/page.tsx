"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";

type Role = "client" | "supplier";

const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  {
    value: "client",
    label: "Program Partner",
    description: "Schools, teams & organizations placing orders",
  },
  {
    value: "supplier",
    label: "Production Partner",
    description: "Factories & suppliers fulfilling orders",
  },
];

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName]   = useState("");
  const [company, setCompany]     = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [role, setRole]           = useState<Role>("client");
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    getProfile().then((p) => {
      if (p) router.replace(rolePortal(p.role));
      else setLoading(false);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters."); return; }
    setSubmitting(true);
    setError("");

    const supabase = createClient();

    // 1. Create auth user
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: fullName, role },
      },
    });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    // 2. Insert profile row immediately (user id exists even before email confirm)
    if (data.user) {
      await supabase.from("profiles").upsert({
        id: data.user.id,
        email,
        full_name: fullName || null,
        role,
        company: company || null,
      });
    }

    setSubmitting(false);
    setDone(true);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gs-dark flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      <div className="h-px w-full bg-gs-gold" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-[400px] animate-fade-up space-y-10">

          {/* Logo + wordmark */}
          <div className="text-center space-y-5">
            <div className="flex justify-center">
              <GraceLogo className="h-12" href="/login" />
            </div>
            <div className="space-y-1">
              <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-gs-white leading-none">
                Create Account
              </h1>
              <p className="text-xs font-display uppercase tracking-[0.2em] text-gs-muted">
                Grace Athletics Platform
              </p>
            </div>
          </div>

          <div className="h-px bg-gs-border w-full" />

          {done ? (
            /* ── Confirm email state ── */
            <div className="space-y-5 animate-fade-in text-center">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full border border-gs-border bg-gs-dark-3 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gs-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-display font-bold uppercase tracking-wider text-gs-white text-lg">
                  Confirm your email
                </p>
                <p className="text-sm text-gs-muted font-barlow leading-relaxed">
                  We sent a confirmation link to{" "}
                  <span className="text-gs-white font-medium">{email}</span>.
                  Click it to activate your account.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-block text-xs font-display uppercase tracking-widest text-gs-muted hover:text-gs-gold transition-colors py-2"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            /* ── Signup form ── */
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Role selector */}
              <div>
                <p className="text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2.5">
                  I am a…
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      className={`p-3.5 rounded-lg border text-left transition-all duration-150
                        ${role === opt.value
                          ? "border-gs-gold bg-gs-gold/8 text-gs-white"
                          : "border-gs-border text-gs-muted hover:border-gs-muted hover:text-gs-white"
                        }`}
                    >
                      <span className="block text-xs font-display uppercase tracking-wider font-bold leading-tight">
                        {opt.label}
                      </span>
                      <span className="block text-[10px] font-barlow mt-1 leading-tight opacity-70">
                        {opt.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Full name */}
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className="w-full bg-gs-dark-2 border border-gs-border rounded-lg px-4 py-3.5 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
                />
              </div>

              {/* Company / team name */}
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2.5">
                  {role === "client" ? "Team / Organization Name" : "Company / Factory Name"}
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={role === "client" ? "e.g. Riverside High School" : "e.g. Apex Sportswear Ltd."}
                  className="w-full bg-gs-dark-2 border border-gs-border rounded-lg px-4 py-3.5 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
                />
              </div>

              {/* Email */}
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
                  className="w-full bg-gs-dark-2 border border-gs-border rounded-lg px-4 py-3.5 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
                />
              </div>

              {/* Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    className="w-full bg-gs-dark-2 border border-gs-border rounded-lg px-4 py-3.5 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2.5">
                    Confirm
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className={`w-full bg-gs-dark-2 border rounded-lg px-4 py-3.5 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none transition-colors
                      ${confirm && confirm !== password ? "border-[#C41E1E] focus:border-[#C41E1E]" : "border-gs-border focus:border-gs-gold"}`}
                  />
                </div>
              </div>

              {error && (
                <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !email || !password || !confirm}
                className="w-full py-4 rounded-lg font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                  bg-gs-gold text-white hover:bg-gs-gold-light
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Creating account…" : "Create Account →"}
              </button>

              <p className="text-xs text-gs-muted font-barlow text-center">
                Already have an account?{" "}
                <Link href="/login" className="text-gs-white hover:text-gs-gold transition-colors underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            </form>
          )}

        </div>
      </div>

      <div className="h-px w-full bg-gs-border" />
    </div>
  );
}

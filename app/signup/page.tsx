"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";

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

const inputCls = "w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors";

function SignupForm() {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const pathParam          = searchParams.get("path");
  const isConsultation     = pathParam === "consultation";
  const isUpload           = pathParam === "upload";
  const nextAfterSignup    = isConsultation
    ? "/portal/consultation"
    : isUpload
      ? "/brief/new?path=upload"
      : "/portal";

  // Account fields
  const [fullName, setFullName]   = useState("");
  const [company, setCompany]     = useState("");
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [role, setRole]           = useState<Role>("client");

  // Consultation-only fields
  const [sport, setSport]         = useState("");
  const [quantity, setQuantity]   = useState("");
  const [message, setMessage]     = useState("");

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
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextAfterSignup)}`,
        data: { full_name: fullName, role },
      },
    });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    // 2. Create profile row via server-side API
    if (data.user) {
      await fetch("/api/auth/create-profile", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          userId:   data.user.id,
          email,
          fullName: fullName || null,
          company:  company  || null,
          role,
        }),
      });
    }

    // 3. If consultation path, submit project details to contact API
    if (isConsultation && (sport || quantity || message)) {
      await fetch("/api/contact", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:    fullName,
          email,
          program: company,
          message: `Sport: ${sport}\nQuantity: ${quantity}\n\n${message}`,
        }),
      });
    }

    setSubmitting(false);
    setDone(true);
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
        <div className={`w-full animate-fade-up space-y-8 ${isConsultation ? "max-w-[520px]" : "max-w-[400px]"}`}>

          {/* Logo + heading */}
          <div className="text-center space-y-5">
            <div className="flex justify-center">
              {/* Always show Grace Enterprise logo on signup — no tenant branding */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/grace-enterprise-logo.jpeg" alt="Grace Enterprise" className="w-[200px] h-auto object-contain" />
            </div>
            <div className="space-y-1">
              {isConsultation ? (
                <>
                  <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-brand-text leading-none">
                    Work Directly with<br />Grace Studios
                  </h1>
                  <p className="text-xs font-display uppercase tracking-[0.2em] text-brand-muted mt-2">
                    Customization · Full Service
                  </p>
                </>
              ) : (
                <>
                  <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-brand-text leading-none">
                    Create Account
                  </h1>
                  <p className="text-xs font-display uppercase tracking-[0.2em] text-brand-muted">
                    Grace Enterprise
                  </p>
                </>
              )}
            </div>
          </div>

          {isConsultation && (
            <div className="rounded-xl border border-brand-border bg-brand-surface px-5 py-4 space-y-3">
              <p className="text-[10px] font-display font-bold uppercase tracking-[0.25em] text-brand-primary">What to Expect</p>
              <ul className="space-y-2">
                {[
                  "Creative direction included, we build around your brief",
                  "Designer-built Illustrator production files",
                  "Two client approvals before anything moves to production",
                  "Matched supplier · First-piece review · Full tracking",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <div className="w-[3px] h-3.5 bg-brand-primary flex-shrink-0 mt-[3px]" />
                    <span className="text-xs font-barlow text-brand-muted leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="h-px bg-brand-border w-full" />

          {done ? (
            /* ── Confirm email state ── */
            <div className="space-y-5 animate-fade-in text-center">
              <div className="flex justify-center">
                <div className="w-14 h-14 rounded-full border border-brand-border bg-brand-surface flex items-center justify-center">
                  <svg className="w-6 h-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <div className="space-y-2">
                <p className="font-display font-bold uppercase tracking-wider text-brand-text text-lg">
                  {isConsultation ? "Request Received" : "Confirm your email"}
                </p>
                <p className="text-sm text-brand-muted font-barlow leading-relaxed">
                  We sent a confirmation link to{" "}
                  <span className="text-brand-text font-medium">{email}</span>.
                  {isConsultation
                    ? " Confirm your email to activate your account. Our team will reach out within 1–2 business days to schedule your creative direction session."
                    : " Click it to activate your account."}
                </p>
              </div>
              <Link
                href="/login"
                className="inline-block text-xs font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors py-2"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            /* ── Signup form ── */
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Role selector — hide for consultation (always client) */}
              {!isConsultation && (
                <div>
                  <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">I am a…</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRole(opt.value)}
                        className={`p-3.5 rounded-lg border text-left transition-all duration-150
                          ${role === opt.value
                            ? "border-brand-primary bg-brand-primary/8 text-brand-text"
                            : "border-brand-border text-brand-muted hover:border-brand-muted hover:text-brand-text"
                          }`}
                      >
                        <span className="block text-xs font-display uppercase tracking-wider font-bold leading-tight">{opt.label}</span>
                        <span className="block text-[10px] font-barlow mt-1 leading-tight opacity-70">{opt.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Account details ── */}
              {isConsultation && (
                <p className="text-[10px] font-display font-bold uppercase tracking-[0.25em] text-brand-muted">Account Details</p>
              )}

              {/* Full name */}
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className={inputCls}
                />
              </div>

              {/* Company / team name */}
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">
                  {isConsultation ? "Program / Organization" : role === "client" ? "Team / Organization Name" : "Company / Factory Name"}
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder={isConsultation ? "e.g. Riverside High School" : role === "client" ? "e.g. Riverside High School" : "e.g. Apex Sportswear Ltd."}
                  className={inputCls}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourteam.com"
                  required
                  className={inputCls}
                />
              </div>

              {/* Password */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    required
                    minLength={8}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">Confirm</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className={`w-full bg-brand-surface border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none transition-colors
                      ${confirm && confirm !== password ? "border-[#C41E1E] focus:border-[#C41E1E]" : "border-brand-border focus:border-brand-primary"}`}
                  />
                </div>
              </div>

              {/* ── Consultation fields ── */}
              {isConsultation && (
                <>
                  <div className="h-px bg-brand-border w-full" />
                  <p className="text-[10px] font-display font-bold uppercase tracking-[0.25em] text-brand-muted">Your Project</p>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">Sport</label>
                      <input
                        type="text"
                        value={sport}
                        onChange={(e) => setSport(e.target.value)}
                        placeholder="e.g. Basketball, Soccer…"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">Estimated Quantity</label>
                      <input
                        type="text"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="e.g. 50 uniforms"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2.5">Tell Us About Your Project</label>
                    <textarea
                      rows={4}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Design direction, colors, logos, timeline, special requirements…"
                      className={`${inputCls} resize-none`}
                    />
                  </div>
                </>
              )}

              {error && (
                <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !email || !password || !confirm}
                className="w-full py-4 rounded-lg font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                  bg-brand-primary text-white hover:bg-brand-secondary
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Creating account…"
                  : isConsultation
                    ? "Create Account & Request Creative Direction →"
                    : "Create Account →"}
              </button>

              <p className="text-xs text-brand-muted font-barlow text-center">
                By creating an account you agree to our{" "}
                <Link href="/terms" className="text-brand-text hover:text-brand-primary transition-colors underline underline-offset-2">
                  Terms of Service
                </Link>
                {" "}and{" "}
                <Link href="/privacy-policy" className="text-brand-text hover:text-brand-primary transition-colors underline underline-offset-2">
                  Privacy Policy
                </Link>
                .
              </p>

              <p className="text-xs text-brand-muted font-barlow text-center">
                Already have an account?{" "}
                <Link href="/login" className="text-brand-text hover:text-brand-primary transition-colors underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            </form>
          )}

        </div>
      </div>

      <div className="h-px w-full bg-brand-border" />
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

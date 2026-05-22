"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";

const STEPS = [
  {
    number: "01",
    title: "Submit Your Brief",
    body: "Tell us your sport, colors, and style direction. Takes under 5 minutes.",
  },
  {
    number: "02",
    title: "AI Designs Your Uniforms",
    body: "Multiple full-color concepts generated and ready to review within minutes.",
  },
  {
    number: "03",
    title: "Approve What You Love",
    body: "Browse concepts, leave feedback, and lock in the design that fits your program.",
  },
  {
    number: "04",
    title: "Produced & Delivered",
    body: "We handle manufacturing, QC, and shipping. Track every step in your portal.",
  },
];

const STYLES = [
  { name: "Bold",     src: "/Jerseys/bold.jpeg"     },
  { name: "Gradient", src: "/Jerseys/gradient.jpeg" },
  { name: "Program",  src: "/Jerseys/program.jpeg"  },
  { name: "Culture",  src: "/Jerseys/culture.jpeg"  },
];

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState("");

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

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-brand-bg/95 backdrop-blur border-b border-brand-border px-6 sm:px-10 py-4 flex items-center justify-between gap-6">
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/grace-enterprise-logo.jpeg"
          alt="Grace Enterprise"
          style={{ width: 200 }}
          className="h-auto object-contain"
        />

        {/* Login form — inline in the header on large screens */}
        <form
          onSubmit={handleSubmit}
          className="hidden lg:flex items-center gap-3"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-52 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            className="w-44 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
          />
          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="px-5 py-2 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {submitting ? "…" : "Sign In →"}
          </button>
          <Link
            href="/signup"
            className="px-5 py-2 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-xs uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors whitespace-nowrap"
          >
            Sign Up
          </Link>
          {error && (
            <p className="text-[#C41E1E] text-xs font-barlow whitespace-nowrap">{error}</p>
          )}
        </form>

        {/* Mobile: just sign-in / sign-up links */}
        <div className="flex lg:hidden items-center gap-3">
          <Link href="/signup" className="text-xs font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">
            Sign Up
          </Link>
          <a
            href="#sign-in"
            className="px-4 py-2 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
          >
            Sign In
          </a>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="flex-1 px-6 sm:px-10 py-16 sm:py-24 flex flex-col items-center text-center border-b border-brand-border">
        <span className="inline-block mb-5 px-3 py-1 rounded-full border border-brand-primary/30 bg-brand-primary/8 text-[10px] font-display font-bold uppercase tracking-[0.25em] text-brand-primary">
          AI-Powered Custom Uniforms
        </span>

        <h1 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none text-5xl sm:text-7xl max-w-4xl">
          Your Program.<br />Your Identity.<br />
          <span className="text-brand-primary">Designed by AI.</span>
        </h1>

        <p className="mt-6 text-base text-brand-muted font-barlow max-w-lg leading-relaxed">
          Submit a brief, get multiple full-color uniform concepts in minutes, approve what you love —
          we handle the rest.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/signup"
            className="w-full sm:w-auto px-10 py-4 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary transition-colors"
          >
            Submit Your First Brief →
          </Link>
          <a
            href="#sign-in"
            className="w-full sm:w-auto px-10 py-4 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-sm uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors lg:hidden"
          >
            Existing Partner? Sign In
          </a>
        </div>

        {/* Jersey style preview strip */}
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-3xl">
          {STYLES.map((s) => (
            <div key={s.name} className="relative overflow-hidden rounded-xl border border-brand-border group">
              <div className="aspect-[3/4]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.src}
                  alt={s.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
                <p className="text-white font-display font-bold uppercase tracking-widest text-[10px]">{s.name}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-16 border-b border-brand-border">
        <div className="max-w-4xl mx-auto">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-2 text-center">The Process</p>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-3xl sm:text-4xl text-center mb-10">
            How It Works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((step, i) => (
              <div key={step.number} className="relative">
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-5 left-full w-full h-px bg-brand-border -translate-x-1/2 z-0" />
                )}
                <div className="relative z-10 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-primary text-white font-display font-bold text-sm flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </div>
                    <div className="h-px flex-1 bg-brand-border lg:hidden" />
                  </div>
                  <div>
                    <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm mb-1">
                      {step.title}
                    </p>
                    <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mobile sign-in card ───────────────────────────────────────────── */}
      <section id="sign-in" className="px-6 sm:px-10 py-16 border-b border-brand-border lg:hidden">
        <div className="max-w-sm mx-auto">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-2 text-center">Existing Partner</p>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-2xl text-center mb-8">
            Sign In
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
            />
            {error && (
              <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="w-full py-4 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors"
            >
              {submitting ? "Signing in…" : "Sign In →"}
            </button>
            <p className="text-center text-xs font-barlow text-brand-muted">
              <Link href="/forgot-password" className="hover:text-brand-primary transition-colors">Forgot password?</Link>
            </p>
          </form>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-brand-border px-6 sm:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/grace-enterprise-logo.jpeg"
          alt="Grace Enterprise"
          style={{ width: 140 }}
          className="h-auto object-contain opacity-60"
        />
        <div className="flex items-center gap-6">
          <Link href="/signup"        className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Sign Up</Link>
          <Link href="/forgot-password" className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Forgot Password</Link>
          <Link href="/privacy-policy" className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Privacy</Link>
          <Link href="/terms"          className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Terms</Link>
        </div>
        <p className="text-[10px] font-barlow text-brand-muted opacity-50">
          © {new Date().getFullYear()} Grace Enterprise
        </p>
      </footer>

    </div>
  );
}

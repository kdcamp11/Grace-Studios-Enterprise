"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";

const STEPS = [
  {
    number: "01",
    who: "Program",
    title: "Submit Your Brief",
    body: "Tell us your sport, colors, style direction, and logo. Takes under 5 minutes. Your dedicated team gets notified immediately.",
    color: "bg-brand-primary",
  },
  {
    number: "02",
    who: "AI + Designer",
    title: "Concepts Generated & Refined",
    body: "AI generates initial concept renders from your brief. Your assigned designer then builds production-ready AI/SVG mockups from those concepts.",
    color: "bg-violet-500",
  },
  {
    number: "03",
    who: "Program",
    title: "Review & Approve Mockups",
    body: "You review exactly what the designer built — not just a rough concept. Approve it or request changes. Nothing moves to production without your sign-off.",
    color: "bg-brand-primary",
  },
  {
    number: "04",
    who: "Supplier",
    title: "Produced & Delivered",
    body: "Approved files go directly to your supplier. They produce a first piece for your review, then run full production. Track every step in your portal.",
    color: "bg-emerald-500",
  },
];

const ROLES = [
  {
    label: "PROGRAM PARTNER",
    headline: "Your team. Your identity.",
    body: "Submit briefs, review designer mockups, approve what goes to production, and track your order from first stitch to delivery.",
    href: "/portal",
    badge: "text-brand-primary bg-brand-primary/10 border-brand-primary/30",
    bar: "bg-brand-primary",
  },
  {
    label: "DESIGNER",
    headline: "AI-assisted. Human-crafted.",
    body: "Receive assigned briefs, use AI concept renders as your starting point, and deliver production-ready SVG/AI mockups your clients can actually approve.",
    href: "/designer",
    badge: "text-violet-400 bg-violet-400/10 border-violet-400/30",
    bar: "bg-violet-500",
  },
  {
    label: "SUPPLIER",
    headline: "Clear files. Clean runs.",
    body: "Receive fully approved production files, upload first-piece photos for client review, then run bulk production with confidence.",
    href: "/supplier",
    badge: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    bar: "bg-emerald-500",
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

  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

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
    if (authError) { setError(authError.message); setSubmitting(false); return; }
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

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-brand-bg/95 backdrop-blur border-b border-brand-border px-6 sm:px-10 py-4 flex items-center justify-between gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/grace-enterprise-logo.jpeg" alt="Grace Enterprise" style={{ width: 200 }} className="h-auto object-contain" />

        {/* Desktop inline login */}
        <form onSubmit={handleSubmit} className="hidden lg:flex items-center gap-3">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" required
            className="w-52 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" required
            className="w-40 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
          />
          <button type="submit" disabled={submitting || !email || !password}
            className="px-5 py-2 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors whitespace-nowrap">
            {submitting ? "…" : "Sign In →"}
          </button>
          <Link href="/signup"
            className="px-5 py-2 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-xs uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors whitespace-nowrap">
            Create Account
          </Link>
          {error && <p className="text-[#C41E1E] text-xs font-barlow">{error}</p>}
        </form>

        {/* Mobile */}
        <div className="flex lg:hidden items-center gap-3">
          <Link href="/signup" className="text-xs font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Sign Up</Link>
          <a href="#sign-in" className="px-4 py-2 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest">Sign In</a>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 pt-20 pb-16 flex flex-col items-center text-center border-b border-brand-border">
        <span className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full border border-brand-primary/30 bg-brand-primary/8 text-[10px] font-display font-bold uppercase tracking-[0.25em] text-brand-primary">
          Programs · Designers · Suppliers — One Platform
        </span>

        <h1 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none text-5xl sm:text-7xl max-w-4xl">
          Custom Uniforms.<br />
          <span className="text-brand-primary">Built by a Team.</span><br />
          Backed by AI.
        </h1>

        <p className="mt-6 text-base text-brand-muted font-barlow max-w-2xl leading-relaxed">
          Grace Enterprise connects sports programs with dedicated designers and vetted suppliers.
          AI accelerates the concept phase — a real designer refines every mockup before you approve a single file for production.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link href="/signup"
            className="w-full sm:w-auto px-10 py-4 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary transition-colors">
            Get Started →
          </Link>
          <a href="#how-it-works"
            className="w-full sm:w-auto px-10 py-4 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-sm uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors">
            See How It Works ↓
          </a>
        </div>

        {/* Jersey strip */}
        <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-3xl">
          {STYLES.map((s) => (
            <div key={s.name} className="relative overflow-hidden rounded-xl border border-brand-border group">
              <div className="aspect-[3/4]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt={s.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2.5">
                <p className="text-white font-display font-bold uppercase tracking-widest text-[10px]">{s.name}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How It Works ──────────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-6 sm:px-10 py-20 border-b border-brand-border">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-3 text-center">The Process</p>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-3xl sm:text-4xl text-center mb-4">How It Works</h2>
          <p className="text-sm font-barlow text-brand-muted text-center max-w-xl mx-auto mb-14 leading-relaxed">
            Every order moves through a structured workflow — brief to approved mockup to production —
            with your team and ours accountable at every step.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step, i) => (
              <div key={step.number} className="relative flex flex-col">
                {/* Connector */}
                {i < STEPS.length - 1 && (
                  <div className="hidden lg:block absolute top-5 left-[calc(100%_-_12px)] w-6 h-px bg-brand-border z-0" />
                )}
                <div className="bg-brand-surface border border-brand-border rounded-2xl p-6 flex flex-col gap-4 flex-1">
                  <div className="flex items-start justify-between">
                    <div className={`w-10 h-10 rounded-full ${step.color} flex items-center justify-center`}>
                      <span className="text-white font-display font-bold text-sm">{i + 1}</span>
                    </div>
                    <span className="font-display font-bold text-3xl text-brand-border select-none">{step.number}</span>
                  </div>
                  <div>
                    <span className={`inline-block text-[9px] font-display uppercase tracking-[0.2em] px-2 py-0.5 rounded border mb-2 ${
                      step.color.includes("violet") ? "text-violet-400 bg-violet-400/10 border-violet-400/30" :
                      step.color.includes("emerald") ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" :
                      "text-brand-primary bg-brand-primary/10 border-brand-primary/30"
                    }`}>
                      {step.who}
                    </span>
                    <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm mb-2">{step.title}</p>
                    <p className="text-xs font-barlow text-brand-muted leading-relaxed">{step.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Key distinction callout */}
          <div className="mt-10 bg-brand-surface border border-brand-border rounded-2xl px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-violet-500/10 border border-violet-500/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
            </div>
            <div>
              <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm mb-1">AI Concepts Are the Starting Point, Not the Final Product</p>
              <p className="text-xs font-barlow text-brand-muted leading-relaxed max-w-2xl">
                Our AI generates multiple concept directions instantly from your brief. A Grace Enterprise designer then takes those renders
                and builds production-quality AI/SVG mockups — the actual files your supplier needs to put on fabric.
                You approve the designer's work, not a raw AI image.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who It's For ──────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-20 border-b border-brand-border">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-3 text-center">Every Role Has a Home</p>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-3xl sm:text-4xl text-center mb-14">Built for Three Sides of the Network</h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {ROLES.map((r) => (
              <div key={r.label} className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden flex flex-col">
                <div className={`h-1 w-full ${r.bar}`} />
                <div className="p-6 flex flex-col gap-3 flex-1">
                  <span className={`self-start text-[9px] font-display font-bold uppercase tracking-[0.2em] px-2 py-1 rounded border ${r.badge}`}>
                    {r.label}
                  </span>
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm">{r.headline}</p>
                  <p className="text-xs font-barlow text-brand-muted leading-relaxed flex-1">{r.body}</p>
                  <Link href={r.href} className="text-[11px] font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors mt-2">
                    Go to Portal →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Mobile sign-in ─────────────────────────────────────────────────── */}
      <section id="sign-in" className="px-6 sm:px-10 py-16 border-b border-brand-border lg:hidden">
        <div className="max-w-sm mx-auto">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-2 text-center">Existing Partner</p>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-2xl text-center mb-8">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" required
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors" />
            {error && <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">{error}</p>}
            <button type="submit" disabled={submitting || !email || !password}
              className="w-full py-4 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors">
              {submitting ? "Signing in…" : "Sign In →"}
            </button>
            <p className="text-center text-xs font-barlow text-brand-muted">
              <Link href="/forgot-password" className="hover:text-brand-primary transition-colors">Forgot password?</Link>
            </p>
          </form>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-20 flex flex-col items-center text-center">
        <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-4xl sm:text-5xl max-w-2xl leading-none mb-4">
          Ready to Build Your Program's Identity?
        </h2>
        <p className="text-sm font-barlow text-brand-muted max-w-md mb-10 leading-relaxed">
          Submit your brief, get AI-generated concepts reviewed and refined by a real designer,
          then approve exactly what goes to your supplier.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link href="/signup"
            className="w-full sm:w-auto px-10 py-4 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary transition-colors">
            Create Free Account →
          </Link>
          <Link href="/login#sign-in"
            className="w-full sm:w-auto px-10 py-4 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-sm uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors">
            Sign In
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-brand-border px-6 sm:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/grace-enterprise-logo.jpeg" alt="Grace Enterprise" style={{ width: 140 }} className="h-auto object-contain opacity-60" />
        <div className="flex items-center gap-6">
          <Link href="/signup"          className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Sign Up</Link>
          <Link href="/forgot-password" className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Forgot Password</Link>
          <Link href="/privacy-policy"  className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Privacy</Link>
          <Link href="/terms"           className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Terms</Link>
        </div>
        <p className="text-[10px] font-barlow text-brand-muted opacity-50">© {new Date().getFullYear()} Grace Enterprise</p>
      </footer>

    </div>
  );
}

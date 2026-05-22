"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";

// ── Static data ──────────────────────────────────────────────────────────────

const PREVIEW_ORDERS = [
  {
    id: "GE-2025-0847",
    team: "Eastside Hoops",
    sport: "Basketball",
    stage: "First Piece Ready for Review",
    cta: "Review Now →",
    urgent: true,
    dot: "bg-amber-400",
  },
  {
    id: "GE-2025-0831",
    team: "Ridge City FC",
    sport: "Soccer",
    stage: "Designer Mockup Ready",
    cta: "Review Mockup →",
    urgent: true,
    dot: "bg-amber-400",
  },
  {
    id: "GE-2025-0819",
    team: "Summit Athletics",
    sport: "Track & Field",
    stage: "In Production",
    cta: "View Status →",
    urgent: false,
    dot: "bg-brand-muted/60",
  },
  {
    id: "GE-2025-0807",
    team: "Westlake Elite",
    sport: "Football",
    stage: "Shipped",
    cta: "Track Order →",
    urgent: false,
    dot: "bg-brand-muted/40",
  },
];

const STATS = [
  { value: "48hr",       label: "Concept Turnaround" },
  { value: "2×",         label: "Client Approvals" },
  { value: "100%",       label: "Designer-Reviewed Files" },
  { value: "End-to-End", label: "Order Tracking" },
];

const STEPS = [
  {
    num: "01",
    who: "Program",
    whoClass: "text-brand-primary bg-brand-primary/10 border-brand-primary/30",
    title: "Submit Brief",
    detail: "Sport, colors, style direction, logo. Under 5 minutes.",
    isApproval: false,
  },
  {
    num: "02",
    who: "AI",
    whoClass: "text-brand-muted bg-brand-surface border-brand-border",
    title: "AI Generates Concepts",
    detail: "Multiple renders from your brief. You select the direction you want.",
    isApproval: true,
    approvalLabel: "You approve the direction",
  },
  {
    num: "03",
    who: "Designer",
    whoClass: "text-brand-muted bg-brand-surface border-brand-border",
    title: "Illustrator Mockup",
    detail: "Designer builds production-ready files from your approved concept.",
    isApproval: false,
  },
  {
    num: "04",
    who: "Program",
    whoClass: "text-brand-primary bg-brand-primary/10 border-brand-primary/30",
    title: "Approve Final Files",
    detail: "You sign off on the actual production file. Nothing moves without it.",
    isApproval: true,
    approvalLabel: "You approve the files",
  },
  {
    num: "05",
    who: "Supplier",
    whoClass: "text-brand-muted bg-brand-surface border-brand-border",
    title: "Production & Delivery",
    detail: "First piece review, then full production. Every step tracked.",
    isApproval: false,
  },
];

const ROLES = [
  {
    label: "PROGRAM PARTNER",
    headline: "Your team.\nYour identity.",
    body: "Submit briefs, approve AI concepts, review designer mockups, and give final sign-off before production. Track your order from first stitch to delivery.",
    href: "/portal",
    badge: "text-brand-primary bg-brand-primary/10 border-brand-primary/30",
    topBar: "bg-brand-primary",
  },
  {
    label: "DESIGNER",
    headline: "AI-assisted.\nHuman-crafted.",
    body: "Receive assigned briefs, use AI renders as a starting point, and deliver production-ready Illustrator mockups your clients can actually approve.",
    href: "/designer",
    badge: "text-brand-muted bg-brand-surface border-brand-border",
    topBar: "bg-brand-border",
  },
  {
    label: "SUPPLIER",
    headline: "Clear files.\nClean runs.",
    body: "Receive fully approved production files, submit first-piece photos for client review, then run bulk production with confidence.",
    href: "/supplier",
    badge: "text-brand-muted bg-brand-surface border-brand-border",
    topBar: "bg-brand-border",
  },
];

const JERSEYS = [
  { name: "Bold",     src: "/jerseys/bold.jpeg"     },
  { name: "Gradient", src: "/jerseys/gradient.jpeg" },
  { name: "Program",  src: "/jerseys/program.jpeg"  },
  { name: "Culture",  src: "/jerseys/culture.jpeg"  },
];

// ── Component ────────────────────────────────────────────────────────────────

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

      {/* ══════════════════════════════════════════════════════════════════
          HEADER
      ══════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 bg-brand-bg/95 backdrop-blur border-b border-brand-border px-6 sm:px-10 py-4 flex items-center justify-between gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/grace-enterprise-logo.jpeg" alt="Grace Enterprise" style={{ width: 200 }} className="h-auto object-contain" />

        {/* Desktop inline sign-in */}
        <form onSubmit={handleSubmit} className="hidden lg:flex items-center gap-3">
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="Email" required
            className="w-52 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
          />
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Password" required
            className="w-40 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
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
            Create Account
          </Link>
          {error && <p className="text-[#C41E1E] text-xs font-barlow">{error}</p>}
        </form>

        {/* Mobile nav */}
        <div className="flex lg:hidden items-center gap-3">
          <Link href="/signup" className="text-xs font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">
            Sign Up
          </Link>
          <a href="#sign-in" className="px-4 py-2 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest">
            Sign In
          </a>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          HERO — asymmetric split
      ══════════════════════════════════════════════════════════════════ */}
      <section className="border-b border-brand-border overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 lg:px-12 grid lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px] gap-0 min-h-[540px] lg:min-h-[600px]">

          {/* Left — editorial headline */}
          <div className="flex flex-col justify-center py-14 lg:py-20 lg:pr-14 border-b lg:border-b-0 lg:border-r border-brand-border">
            <div className="flex items-center gap-2.5 mb-7">
              <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">
                Programs · Designers · Suppliers
              </span>
            </div>

            <h1 className="font-display font-bold uppercase text-brand-text leading-[0.9] tracking-tight mb-6">
              <span className="block" style={{ fontSize: "clamp(1.7rem, 3.4vw, 3rem)" }}>The Operating</span>
              <span className="block" style={{ fontSize: "clamp(1.7rem, 3.4vw, 3rem)" }}>System for</span>
              <span className="block text-brand-primary" style={{ fontSize: "clamp(1.7rem, 3.4vw, 3rem)" }}>Elite Programs.</span>
            </h1>

            <p className="text-sm text-brand-muted font-barlow max-w-[420px] leading-relaxed mb-8">
              AI-accelerated concept generation. Designer-built Illustrator files.
              Two client approvals before a single garment is cut.
              This is how elite programs run their apparel operations.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-3">
              <Link
                href="/signup"
                className="px-7 py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
              >
                Get Started →
              </Link>
              <a
                href="#how-it-works"
                className="px-7 py-3.5 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-xs uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors"
              >
                See the Process
              </a>
            </div>
          </div>

          {/* Right — live order tracker preview */}
          <div className="hidden lg:flex flex-col justify-end pt-12 pl-8 xl:pl-10">
            <div className="bg-brand-surface border border-brand-border border-b-0 rounded-t-2xl overflow-hidden shadow-[0_-8px_40px_rgba(0,0,0,0.25)]">
              {/* Panel chrome */}
              <div className="border-b border-brand-border px-5 py-4 flex items-center justify-between bg-brand-bg/50">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-brand-text">Order Tracker</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-muted/50" />
                  <span className="text-[9px] font-barlow text-brand-muted">Live</span>
                </div>
              </div>

              {/* Order rows */}
              <div className="divide-y divide-brand-border">
                {PREVIEW_ORDERS.map((order) => (
                  <div
                    key={order.id}
                    className={`px-5 py-4 flex items-start justify-between gap-4 cursor-default transition-colors duration-200 ${
                      order.urgent ? "hover:bg-amber-400/5" : "hover:bg-brand-bg/40"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${order.dot}`} />
                        <span className="text-[11px] font-display font-bold text-brand-text tracking-wide truncate">
                          {order.team}
                        </span>
                        {order.urgent && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30 text-amber-400 font-display font-bold text-[8px] uppercase tracking-widest">
                            Action
                          </span>
                        )}
                      </div>
                      <div className="ml-3.5 space-y-0.5">
                        <p className="text-[9px] font-barlow text-brand-muted">{order.id} · {order.sport}</p>
                        <p className="text-[10px] font-barlow text-brand-muted/80">{order.stage}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-display font-bold uppercase tracking-widest flex-shrink-0 mt-0.5 ${
                      order.urgent ? "text-amber-500" : "text-brand-muted"
                    }`}>
                      {order.cta}
                    </span>
                  </div>
                ))}
              </div>

              {/* Panel footer */}
              <div className="border-t border-brand-border px-5 py-3.5 flex items-center justify-between bg-brand-bg/30">
                <span className="text-[9px] font-barlow text-brand-muted">4 active orders</span>
                <span className="text-[9px] font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary cursor-pointer transition-colors">
                  + New Brief
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════════════════════════════════ */}
      <div className="border-b border-brand-border">
        <div className="max-w-6xl mx-auto px-6 sm:px-10 lg:px-12 grid grid-cols-2 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`py-6 flex flex-col gap-1 ${i > 0 ? "border-l border-brand-border pl-6 sm:pl-8" : ""} ${i < STATS.length - 1 ? "pr-6 sm:pr-8" : ""}`}
            >
              <span className="font-display font-bold text-brand-text text-2xl tracking-tight leading-none">{s.value}</span>
              <span className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mt-1">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          JERSEY STRIP — visual proof of work
      ══════════════════════════════════════════════════════════════════ */}
      <div className="border-b border-brand-border">
        <div className="grid grid-cols-4">
          {JERSEYS.map((j) => (
            <div key={j.name} className="relative group border-r last:border-r-0 border-brand-border bg-brand-bg flex items-center justify-center px-4 py-6 sm:py-8">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={j.src}
                alt={j.name}
                className="w-full max-h-52 sm:max-h-64 object-contain group-hover:scale-105 transition-transform duration-500 ease-out"
              />
              <div className="absolute bottom-2 left-3">
                <span className="text-[9px] font-display font-bold uppercase tracking-[0.25em] text-brand-muted/60">{j.name}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PROCESS — connected step grid
      ══════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="px-6 sm:px-10 lg:px-12 py-12 sm:py-16 border-b border-brand-border">
        <div className="max-w-6xl mx-auto">

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-10">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">The Process</span>
              </div>
              <h2 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none" style={{ fontSize: "clamp(1.3rem, 2.4vw, 2.1rem)" }}>
                How Every Order<br />Gets Built.
              </h2>
            </div>
            <p className="text-xs font-barlow text-brand-muted max-w-[260px] leading-relaxed lg:text-right lg:pb-0.5">
              Two client sign-offs. Zero guesswork.
              Every file reviewed by a human before it touches a supplier.
            </p>
          </div>

          {/* Steps grid — gap-px + parent bg trick creates seamless inner borders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-px bg-brand-border border border-brand-border rounded-xl overflow-hidden">
            {STEPS.map((step) => (
              <div
                key={step.num}
                className={`flex flex-col gap-4 p-5 sm:p-6 ${step.isApproval ? "bg-brand-surface" : "bg-brand-bg"}`}
              >
                {/* Top row: step number + approval badge */}
                <div className="flex items-start justify-between">
                  <span className="font-display font-bold text-[2.25rem] leading-none text-brand-border select-none">{step.num}</span>
                  {step.isApproval && (
                    <span className="px-2 py-1 rounded bg-brand-primary/10 border border-brand-primary/30 text-brand-primary font-display font-bold text-[8px] uppercase tracking-widest whitespace-nowrap">
                      ✓ Approval
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-2 flex-1">
                  <span className={`self-start text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border ${step.whoClass}`}>
                    {step.who}
                  </span>
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text text-[11px] leading-snug">{step.title}</p>
                  <p className="text-[11px] font-barlow text-brand-muted leading-relaxed">{step.detail}</p>
                </div>

                {/* Approval indicator */}
                {step.isApproval && "approvalLabel" in step && (
                  <div className="flex items-center gap-2 pt-3 border-t border-brand-border mt-auto">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0" />
                    <span className="text-[9px] font-display uppercase tracking-widest text-brand-primary">
                      {(step as typeof step & { approvalLabel: string }).approvalLabel}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          ROLES — three-panel editorial
      ══════════════════════════════════════════════════════════════════ */}
      <section className="px-6 sm:px-10 lg:px-12 py-12 sm:py-16 border-b border-brand-border">
        <div className="max-w-6xl mx-auto">

          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Every Role Has a Home</span>
          </div>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-12" style={{ fontSize: "clamp(1.3rem, 2.4vw, 2.1rem)" }}>
            Built for Three Sides<br />of the Network.
          </h2>

          {/* Connected panel — no gutter, inner borders only */}
          <div className="border border-brand-border rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-3">
            {ROLES.map((role, i) => (
              <div
                key={role.label}
                className={`group relative flex flex-col gap-5 p-6 xl:p-8 hover:bg-brand-surface transition-colors duration-300
                  ${i > 0 ? "border-t lg:border-t-0 lg:border-l border-brand-border" : ""}
                `}
              >
                {/* Hover accent top bar */}
                <div className={`absolute top-0 left-0 right-0 h-[2px] ${role.topBar} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />

                <span className={`self-start text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border ${role.badge}`}>
                  {role.label}
                </span>

                <div className="flex flex-col gap-2.5 flex-1">
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text text-lg xl:text-xl leading-tight whitespace-pre-line">
                    {role.headline}
                  </p>
                  <p className="text-xs font-barlow text-brand-muted leading-relaxed">{role.body}</p>
                </div>

                <Link
                  href={role.href}
                  className="inline-flex items-center gap-2 text-[10px] font-display font-bold uppercase tracking-widest text-brand-muted group-hover:text-brand-primary transition-colors duration-200"
                >
                  Enter Portal
                  <svg className="w-3 h-3 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          MOBILE SIGN-IN
      ══════════════════════════════════════════════════════════════════ */}
      <section id="sign-in" className="px-6 sm:px-10 py-16 border-b border-brand-border lg:hidden">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-[3px] h-6 bg-brand-primary flex-shrink-0" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Existing Partner</span>
          </div>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-2xl mb-6">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address" required
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
            />
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" required
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
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
              <Link href="/forgot-password" className="hover:text-brand-primary transition-colors">
                Forgot password?
              </Link>
            </p>
          </form>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FINAL CTA — editorial split
      ══════════════════════════════════════════════════════════════════ */}
      <section className="px-6 sm:px-10 lg:px-12 py-12 sm:py-16 border-b border-brand-border">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-start lg:items-end justify-between gap-10">
          <div>
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Ready to Build</span>
            </div>
            <h2 className="font-display font-bold uppercase tracking-tight text-brand-text leading-[0.9]" style={{ fontSize: "clamp(1.6rem, 3vw, 2.6rem)" }}>
              Your Program's<br />
              <span className="text-brand-primary">Identity</span><br />
              Starts Here.
            </h2>
          </div>

          <div className="flex flex-col gap-4 lg:items-end lg:pb-0.5">
            <p className="text-xs font-barlow text-brand-muted max-w-[260px] leading-relaxed lg:text-right">
              Concepts in 48 hours. Designer-reviewed files.
              Full production tracking from brief to delivery.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/signup"
                className="px-7 py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
              >
                Submit Your First Brief →
              </Link>
              <a
                href="#sign-in"
                className="px-7 py-3.5 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-xs uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors lg:hidden"
              >
                Sign In
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-brand-border px-6 sm:px-10 lg:px-12 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/grace-enterprise-logo.jpeg" alt="Grace Enterprise" style={{ width: 140 }} className="h-auto object-contain opacity-50" />
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <Link href="/signup"          className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Sign Up</Link>
            <Link href="/forgot-password" className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Forgot Password</Link>
            <Link href="/privacy-policy"  className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Privacy</Link>
            <Link href="/terms"           className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Terms</Link>
          </div>
          <p className="text-[10px] font-barlow text-brand-muted opacity-40">© {new Date().getFullYear()} Grace Enterprise</p>
        </div>
      </footer>

    </div>
  );
}

"use client";

import Link from "next/link";
import Image from "next/image";

const STEPS = [
  {
    number: "01",
    title: "Submit Your Brief",
    description:
      "Tell us about your team — sport, colors, style direction, and logo. Takes less than 5 minutes.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "AI Generates Concepts",
    description:
      "Our AI designs multiple full-color uniform concepts tailored to your brief — usually within minutes.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Review & Approve",
    description:
      "Browse your concepts, leave feedback, and lock in the design you love. Your call, every step.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    number: "04",
    title: "Produced & Delivered",
    description:
      "We handle manufacturing, quality control, and shipping directly to your door. Track everything in your portal.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
];

const PORTALS = [
  {
    role: "Program Partner",
    label: "CLIENT PORTAL",
    href: "/portal",
    description:
      "Submit briefs, review AI-generated concepts, approve designs, track production, and manage your orders — all in one place.",
    cta: "Go to Portal →",
    accent: "border-brand-primary",
    badge: "bg-brand-primary/10 text-brand-primary border-brand-primary/30",
  },
  {
    role: "Production Partner",
    label: "SUPPLIER PORTAL",
    href: "/supplier",
    description:
      "View assigned orders, upload first-piece photos for review, update production stages, and manage your fulfillment queue.",
    cta: "Go to Portal →",
    accent: "border-violet-400",
    badge: "bg-violet-400/10 text-violet-400 border-violet-400/30",
  },
  {
    role: "Studio Admin",
    label: "ADMIN PORTAL",
    href: "/admin",
    description:
      "Manage the full order workflow, assign designers and suppliers, review concepts, handle billing, and configure your studio settings.",
    cta: "Go to Portal →",
    accent: "border-emerald-400",
    badge: "bg-emerald-400/10 text-emerald-400 border-emerald-400/30",
  },
];

const STYLES = [
  { name: "Bold", src: "/Jerseys/bold.jpeg",     description: "High-contrast graphics, strong typography" },
  { name: "Gradient", src: "/Jerseys/gradient.jpeg", description: "Fluid color transitions, modern feel" },
  { name: "Program", src: "/Jerseys/program.jpeg",   description: "Classic, institutional, coach-approved" },
  { name: "Culture", src: "/Jerseys/culture.jpeg",   description: "Street-inspired, player-first identity" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="border-b border-brand-border px-6 sm:px-10 py-4 flex items-center justify-between sticky top-0 bg-brand-bg z-40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/grace-enterprise-logo.jpeg"
          alt="Grace Enterprise"
          style={{ width: 200 }}
          className="h-auto object-contain"
        />
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-xs font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="px-5 py-2.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
          >
            Get Started →
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-20 sm:py-28 flex flex-col items-center text-center border-b border-brand-border">
        <span className="inline-block mb-6 px-3 py-1 rounded-full border border-brand-primary/30 bg-brand-primary/8 text-[10px] font-display font-bold uppercase tracking-[0.25em] text-brand-primary">
          AI-Powered Custom Uniforms
        </span>
        <h1 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none text-5xl sm:text-7xl max-w-4xl">
          Your Program.<br />Your Identity.<br />
          <span className="text-brand-primary">Designed by AI.</span>
        </h1>
        <p className="mt-6 text-base sm:text-lg text-brand-muted font-barlow max-w-xl leading-relaxed">
          Submit a brief, get multiple full-color uniform concepts within minutes,
          approve what you love, and we handle the rest — production, QC, and delivery.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/signup"
            className="w-full sm:w-auto px-10 py-4 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary transition-colors"
          >
            Submit Your First Brief →
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-10 py-4 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-sm uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors"
          >
            Sign In
          </Link>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-16 sm:py-20 border-b border-brand-border">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-3 text-center">
            The Process
          </p>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-3xl sm:text-4xl text-center mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((step) => (
              <div key={step.number} className="bg-brand-surface border border-brand-border rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
                    {step.icon}
                  </div>
                  <span className="font-display font-bold text-3xl text-brand-border">{step.number}</span>
                </div>
                <div>
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm mb-1.5">
                    {step.title}
                  </p>
                  <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Design Styles ────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-16 sm:py-20 border-b border-brand-border">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-3 text-center">
            Design Systems
          </p>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-3xl sm:text-4xl text-center mb-3">
            Four Distinct Styles
          </h2>
          <p className="text-sm font-barlow text-brand-muted text-center mb-12 max-w-lg mx-auto">
            Choose a design direction in your brief — our AI generates concepts within that system
            so every output fits the identity you're building.
          </p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {STYLES.map((style) => (
              <div key={style.name} className="group relative overflow-hidden rounded-2xl border border-brand-border bg-brand-surface">
                <div className="aspect-[3/4] overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={style.src}
                    alt={style.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <p className="font-display font-bold uppercase tracking-widest text-brand-text text-sm">
                    {style.name}
                  </p>
                  <p className="text-[11px] font-barlow text-brand-muted mt-0.5">
                    {style.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Portal Guide ─────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-16 sm:py-20 border-b border-brand-border">
        <div className="max-w-5xl mx-auto">
          <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-3 text-center">
            Your Dashboard
          </p>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-3xl sm:text-4xl text-center mb-3">
            Every Role Has a Portal
          </h2>
          <p className="text-sm font-barlow text-brand-muted text-center mb-12 max-w-lg mx-auto">
            After signing in you'll be routed to the right workspace automatically based on your account type.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {PORTALS.map((portal) => (
              <div key={portal.label} className={`bg-brand-surface border-t-2 ${portal.accent} border-x border-b border-brand-border rounded-2xl p-6 flex flex-col gap-4`}>
                <div>
                  <span className={`inline-block text-[9px] font-display font-bold uppercase tracking-[0.2em] px-2 py-1 rounded border ${portal.badge} mb-3`}>
                    {portal.label}
                  </span>
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm mb-2">
                    {portal.role}
                  </p>
                  <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                    {portal.description}
                  </p>
                </div>
                <Link
                  href={portal.href}
                  className="mt-auto text-[11px] font-display font-bold uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors"
                >
                  {portal.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────────── */}
      <section className="px-6 sm:px-10 py-20 flex flex-col items-center text-center">
        <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-4xl sm:text-5xl max-w-2xl leading-none mb-4">
          Ready to Build Your Identity?
        </h2>
        <p className="text-sm font-barlow text-brand-muted max-w-md mb-10 leading-relaxed">
          Create a free account, submit your brief, and see AI-generated concepts for your program in minutes.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/signup"
            className="w-full sm:w-auto px-10 py-4 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary transition-colors"
          >
            Create Free Account →
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-10 py-4 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-sm uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors"
          >
            Sign In
          </Link>
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
          <Link href="/login"     className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Sign In</Link>
          <Link href="/signup"    className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Sign Up</Link>
          <Link href="/privacy-policy" className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Privacy</Link>
          <Link href="/terms"     className="text-[11px] font-display uppercase tracking-widest text-brand-muted hover:text-brand-primary transition-colors">Terms</Link>
        </div>
        <p className="text-[10px] font-barlow text-brand-muted opacity-50">
          © {new Date().getFullYear()} Grace Enterprise. All rights reserved.
        </p>
      </footer>

    </div>
  );
}

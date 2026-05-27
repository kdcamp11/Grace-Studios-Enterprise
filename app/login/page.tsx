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
    who: "Design",
    whoClass: "text-brand-primary bg-brand-primary/10 border-brand-primary/30",
    title: "Concept Ready in Minutes",
    detail: "Your concept, built on Grace Studios design philosophy, is ready for review in minutes. You choose the direction.",
    isApproval: true,
    approvalLabel: "You approve the direction",
  },
  {
    num: "03",
    who: "Designer",
    whoClass: "text-brand-primary bg-brand-primary/10 border-brand-primary/30",
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
    whoClass: "text-brand-primary bg-brand-primary/10 border-brand-primary/30",
    title: "Production & Delivery",
    detail: "First piece review, then full production. Every step tracked.",
    isApproval: false,
  },
];

const ROLES = [
  {
    label: "PROGRAM PARTNER",
    headline: "Your team.\nYour identity.",
    body: "Submit briefs, approve design concepts, review designer mockups, and give final sign-off before production. Track your order from first stitch to delivery.",
    href: "/portal",
    badge: "text-brand-muted/70 bg-transparent border-brand-border/50",
    topBar: "bg-brand-primary",
  },
  {
    label: "DESIGNER",
    headline: "Concept-driven.\nHuman-crafted.",
    body: "Receive assigned briefs, use the design concept as a starting point, and deliver production-ready Illustrator mockups your clients can actually approve.",
    href: "/designer",
    badge: "text-brand-muted/70 bg-transparent border-brand-border/50",
    topBar: "bg-brand-border",
  },
  {
    label: "SUPPLIER",
    headline: "Clear files.\nClean runs.",
    body: "Receive fully approved production files, submit first-piece photos for client review, then run bulk production with confidence.",
    href: "/supplier",
    badge: "text-brand-muted/70 bg-transparent border-brand-border/50",
    topBar: "bg-brand-border",
  },
];

const JERSEYS = [
  { name: "Bold",     src: "/jerseys/bold.jpg"     },
  { name: "Gradient", src: "/jerseys/gradient.jpg" },
  { name: "Program",  src: "/jerseys/program.jpg"  },
  { name: "Culture",  src: "/jerseys/culture.jpg"  },
];

const PARTNER_METRICS = [
  { value: "Full Program",   sub: "Home, away, alternate, tracksuits" },
  { value: "Adidas 3SSB",    sub: "Competing on the Adidas circuit"   },
  { value: "Active Partner", sub: "Still partnered today"             },
];

// ── Path cards ───────────────────────────────────────────────────────────────

const PATH_CARDS = [
  {
    href: "/signup?path=consultation",
    badge: "Full Service",
    sub: "Fully Managed",
    headline: "Strategy. Design.\nManaged to Delivery.",
    bullets: [
      "Creative consultation and strategic direction",
      "Concepts developed around your program and identity",
      "Supplier coordination and production management",
      "Starting at $300+",
    ],
    cta: "Work with Grace Studios →",
  },
  {
    href: "/signup?path=self-service",
    badge: "Self Service",
    sub: "Two Paths",
    headline: "Design Freely.\nActivate When Ready.",
    bullets: [
      "Design Brief: submit your vision, we build the concept",
      "Jersey Builder: color every zone in real-time 3D",
      "Grace Studios handles production on activation",
      "Free to build. $100 to activate.",
    ],
    cta: "Get Started →",
  },
  {
    href: "/signup?path=upload",
    badge: "Production Files",
    sub: "Your Artwork",
    headline: "Your Files.\nOur Production\nNetwork.",
    bullets: [
      "Adobe Illustrator, EPS, PDF or SVG",
      "Your artwork. Your IP. Always.",
      "Managed production and fulfillment",
      "Fulfillment, QC, and delivery tracking",
    ],
    cta: "Upload Production Files →",
    note: "Have a sketch or concept? Consultation is the right starting point.",
  },
];

function PathCard({ card, className = "" }: { card: typeof PATH_CARDS[0]; className?: string }) {
  return (
    <Link href={card.href} className={`group relative flex flex-col gap-3 p-5 rounded-2xl border border-brand-border bg-brand-bg hover:bg-brand-surface transition-colors duration-300 shadow-sm ${className}`}>
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-brand-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-t-2xl" />
      <div className="flex items-center justify-between">
        <span className="text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border text-brand-primary bg-brand-primary/10 border-brand-primary/30">{card.badge}</span>
        <span className="text-[8px] font-display uppercase tracking-widest text-brand-muted/60">{card.sub}</span>
      </div>
      <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm leading-snug whitespace-pre-line">{card.headline}</p>
      <ul className="space-y-1.5">
        {card.bullets.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-brand-primary flex-shrink-0" />
            <span className="text-[10px] font-barlow text-brand-muted leading-none">{item}</span>
          </li>
        ))}
      </ul>
      <span className="text-[9px] font-display font-bold uppercase tracking-widest text-brand-muted group-hover:text-brand-primary transition-colors">{card.cta}</span>
    </Link>
  );
}

// ── Consultation form ────────────────────────────────────────────────────────

function ConsultationForm() {
  const [fields, setFields] = useState({ name: "", email: "", program: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  function set(k: keyof typeof fields, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  const inputCls = "w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors";

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-brand-border bg-brand-surface p-8 flex flex-col items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center">
          <svg className="w-5 h-5 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="font-display font-bold uppercase tracking-wide text-brand-text">Message Received</p>
          <p className="text-sm font-barlow text-brand-muted mt-1">We&apos;ll be in touch within 1–2 business days to schedule your consultation.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSend} className="rounded-xl border border-brand-border bg-brand-surface p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Name</label>
          <input
            required
            className={inputCls}
            placeholder="Your name"
            value={fields.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Email</label>
          <input
            type="email"
            required
            className={inputCls}
            placeholder="your@email.com"
            value={fields.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Program / Organization</label>
        <input
          className={inputCls}
          placeholder="Team name or organization"
          value={fields.program}
          onChange={(e) => set("program", e.target.value)}
        />
      </div>
      <div>
        <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Tell us about your project</label>
        <textarea
          required
          rows={4}
          className={`${inputCls} resize-none`}
          placeholder="Sport, quantity, timeline, specific needs…"
          value={fields.message}
          onChange={(e) => set("message", e.target.value)}
        />
      </div>
      {status === "error" && (
        <p className="text-sm font-barlow text-red-600">Something went wrong. Please try again.</p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors"
      >
        {status === "sending" ? "Sending…" : "Request Consultation →"}
      </button>
    </form>
  );
}

// ── Supplier landing data ─────────────────────────────────────────────────────

const SUPPLIER_STATS = [
  { value: "2×",        label: "Client Approvals Before Files Ship" },
  { value: "100%",      label: "Files Designer-Reviewed" },
  { value: "0",         label: "Surprise Revisions" },
  { value: "Built-in",  label: "First-Piece Review" },
];

const SUPPLIER_STEPS = [
  {
    num: "01",
    title: "Get Assigned",
    detail: "Accept orders that match your production catalog: sport, garment type, and capacity.",
  },
  {
    num: "02",
    title: "Receive Approved Files",
    detail: "Every file arrives double-approved: client signed off on the AI concept and the Illustrator mockup.",
  },
  {
    num: "03",
    title: "Produce First Piece",
    detail: "Run your sample. Upload photos directly to the platform for client review.",
  },
  {
    num: "04",
    title: "Client Signs Off",
    detail: "Client approves or requests changes on the first piece. Everything logged, nothing verbal.",
  },
  {
    num: "05",
    title: "Bulk Production",
    detail: "Run the full order with confidence. Ship and mark complete. Payment triggered on delivery.",
  },
];

const SUPPLIER_FEATURES = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    title: "Production-Ready Files",
    body: "Receive fully approved Illustrator files. No ambiguity, no back-and-forth. Every spec confirmed before it reaches you.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    title: "Portfolio Showcase",
    body: "Upload your best work. Programs browse production portfolios when choosing who to work with. Your quality speaks for you.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    title: "Production Catalog",
    body: "Define exactly which sports and garment types you produce. Orders route to your profile when specs align.",
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
    title: "Order Tracking",
    body: "Every order stage tracked and logged. Upload first-piece photos, mark milestones, and communicate directly inside the platform.",
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  const [view, setView]             = useState<"client" | "supplier">("client");
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
      <header className="sticky top-0 z-50 bg-brand-bg/95 backdrop-blur border-b border-brand-border px-5 sm:px-8 lg:px-10 py-4 flex items-center justify-between gap-6">
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
          ROLE TOGGLE — client / supplier switcher
      ══════════════════════════════════════════════════════════════════ */}
      <div className="border-b border-brand-border bg-brand-surface py-4">
        <div className="flex flex-col items-center gap-3">
          <p className="font-display font-bold uppercase text-brand-text" style={{ fontSize: "clamp(0.85rem, 1.4vw, 1.1rem)", letterSpacing: "0.2em" }}>
            Who Are You?
          </p>
          <div className="flex items-center gap-2 p-1 rounded-xl bg-brand-bg border border-brand-border shadow-sm">
            <button
              type="button"
              onClick={() => setView("client")}
              className={`px-7 py-2.5 rounded-lg font-display font-bold uppercase tracking-widest transition-all duration-200 ${
                view === "client"
                  ? "bg-brand-primary text-white shadow-sm"
                  : "text-brand-muted hover:text-brand-text"
              }`}
              style={{ fontSize: "clamp(0.7rem, 1.1vw, 0.85rem)" }}
            >
              Client / Program
            </button>
            <button
              type="button"
              onClick={() => setView("supplier")}
              className={`px-7 py-2.5 rounded-lg font-display font-bold uppercase tracking-widest transition-all duration-200 ${
                view === "supplier"
                  ? "bg-brand-primary text-white shadow-sm"
                  : "text-brand-muted hover:text-brand-text"
              }`}
              style={{ fontSize: "clamp(0.7rem, 1.1vw, 0.85rem)" }}
            >
              Supplier / Manufacturer
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          HERO — asymmetric split
      ══════════════════════════════════════════════════════════════════ */}
      {view === "client" && (<>
      <section className="border-b border-brand-border overflow-hidden">
        <div className="max-w-[90rem] mx-auto px-5 sm:px-8 lg:px-12 py-12 lg:py-20">
          <div className="flex flex-col lg:flex-row gap-10 lg:gap-12 items-center">

            {/* ── Left: brand positioning — wider, more dominant ── */}
            <div className="lg:w-[320px] xl:w-[420px] flex-shrink-0 flex flex-col gap-7 lg:self-center">

              <div className="flex items-center gap-2.5">
                <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">
                  Apparel · Brand Identity · Team Gear
                </span>
              </div>

              <h1
                className="font-display font-bold uppercase text-brand-text leading-none tracking-tight"
                style={{ fontSize: "clamp(2rem, 3.2vw, 3.8rem)" }}
              >
                The Identity Your Program{" "}
                <span className="text-brand-primary">Was Built For.</span>
              </h1>

              <p className="text-sm text-brand-muted font-barlow leading-relaxed">
                Grace Studios helps elite programs achieve their ultimate brand identity through custom apparel
                and team gear, designed around your program, produced with precision, and tracked from first
                concept to final delivery.
              </p>

            </div>

            {/* ── Right: three cards side by side — slightly secondary ── */}
            <div className="flex-1 grid grid-cols-3 gap-3 items-stretch">

              {/* Creative Direction */}
              <div className="flex flex-col gap-3">
                <div className="group relative flex flex-col gap-3 p-4 rounded-2xl border border-brand-border/70 bg-brand-bg hover:bg-brand-surface transition-colors duration-300 shadow-sm flex-1">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-brand-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-t-2xl" />
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded border text-brand-primary bg-brand-primary/10 border-brand-primary/30">Full Service</span>
                    <span className="text-[9px] font-display uppercase tracking-widest text-brand-muted/60">Fully Managed</span>
                  </div>
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text leading-snug" style={{ fontSize: "clamp(0.85rem, 1.1vw, 0.95rem)" }}>Creative Direction. Managed to Delivery.</p>
                  <ul className="space-y-1.5 flex-1">
                    {PATH_CARDS[0].bullets.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-brand-primary flex-shrink-0 mt-1.5" />
                        <span className="text-xs font-barlow text-brand-muted leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href="/signup?path=consultation"
                  className="flex items-center justify-center py-2.5 rounded-xl bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary transition-colors shadow-sm">
                  Creative Direction →
                </Link>
              </div>

              {/* Self Service — two sub-paths */}
              <div className="flex flex-col gap-3">
                <div className="relative flex flex-col gap-3 p-4 rounded-2xl border border-brand-border/70 bg-brand-bg shadow-sm flex-1">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-brand-primary/60 rounded-t-2xl" />
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded border text-brand-primary bg-brand-primary/10 border-brand-primary/30">Self Service</span>
                    <span className="text-[9px] font-display uppercase tracking-widest text-brand-muted/60">Two Paths</span>
                  </div>
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text leading-snug" style={{ fontSize: "clamp(0.85rem, 1.1vw, 0.95rem)" }}>Design Freely. Activate When Ready.</p>
                  <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                    Free to build. $100 activation applied toward your final order.
                  </p>
                  <div className="flex flex-col gap-2 border-t border-brand-border pt-3 flex-1">
                    <p className="text-[8px] font-display font-bold uppercase tracking-[0.28em] text-brand-muted mb-1">Choose your path</p>
                    <Link
                      href="/signup?path=ai"
                      className="group/sp flex items-center justify-between gap-2 p-2.5 rounded-lg border border-brand-border bg-brand-surface hover:border-brand-primary hover:bg-brand-primary/5 transition-all duration-200"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0 mt-0.5" />
                        <span className="text-[10px] font-barlow text-brand-muted leading-snug"><span className="text-brand-text font-medium">Design Brief</span>: submit your vision, we build the concept</span>
                      </div>
                      <svg className="w-3 h-3 text-brand-muted/50 group-hover/sp:text-brand-primary flex-shrink-0 transition-colors mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                    <Link
                      href="/signup?path=builder"
                      className="group/sp flex items-center justify-between gap-2 p-2.5 rounded-lg border border-brand-border bg-brand-surface hover:border-brand-primary hover:bg-brand-primary/5 transition-all duration-200"
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0 mt-0.5" />
                        <span className="text-[10px] font-barlow text-brand-muted leading-snug"><span className="text-brand-text font-medium">Jersey Builder</span>: color every zone, selections drive the brief</span>
                      </div>
                      <svg className="w-3 h-3 text-brand-muted/50 group-hover/sp:text-brand-primary flex-shrink-0 transition-colors mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>

              {/* Production Files */}
              <div className="flex flex-col gap-3">
                <div className="group relative flex flex-col gap-3 p-4 rounded-2xl border border-brand-border/70 bg-brand-bg hover:bg-brand-surface transition-colors duration-300 shadow-sm flex-1">
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-brand-muted/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-t-2xl" />
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded border text-brand-muted bg-brand-muted/10 border-brand-muted/30">Production Files</span>
                    <span className="text-[9px] font-display uppercase tracking-widest text-brand-muted/60">Your Artwork</span>
                  </div>
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text leading-snug" style={{ fontSize: "clamp(0.85rem, 1.1vw, 0.95rem)" }}>Your Files. Our Production Network.</p>
                  <ul className="space-y-1.5 flex-1">
                    {PATH_CARDS[2].bullets.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <span className="w-1 h-1 rounded-full bg-brand-muted/60 flex-shrink-0 mt-1.5" />
                        <span className="text-xs font-barlow text-brand-muted leading-snug">{item}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[9px] font-barlow text-brand-muted/50 italic border-t border-brand-border pt-3 leading-snug">
                    Have a sketch or concept? Creative Direction is the right starting point.
                  </p>
                </div>
                <Link href="/signup?path=upload"
                  className="flex items-center justify-center py-2.5 rounded-xl border border-brand-border/70 text-brand-muted font-display font-bold text-sm uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors">
                  Upload Production Files →
                </Link>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          PARTNER SUCCESS — editorial case study
      ══════════════════════════════════════════════════════════════════ */}
      <section className="border-b border-brand-border">

        {/* 3-column metrics strip */}
        <div className="border-b border-brand-border">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-10 grid grid-cols-3">
            {PARTNER_METRICS.map((m, i) => (
              <div
                key={m.value}
                className={`py-5 sm:py-6 flex flex-col gap-1.5
                  ${i > 0 ? "border-l border-brand-border pl-5 sm:pl-8" : ""}
                  ${i < 2 ? "pr-5 sm:pr-8" : ""}`}
              >
                <span className="font-display font-bold text-brand-text text-base sm:text-lg tracking-tight leading-none">{m.value}</span>
                <span className="text-[9px] sm:text-[10px] font-display uppercase tracking-[0.18em] text-brand-muted leading-snug mt-0.5">{m.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Case study block */}
        <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-10 py-10 sm:py-12 lg:py-14">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">

            {/* Left — editorial text */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Partner Work</span>
              </div>

              <h2
                className="font-display font-bold uppercase tracking-tight text-brand-text leading-none"
                style={{ fontSize: "clamp(1.3rem, 2.4vw, 2.1rem)" }}
              >
                From No Uniforms to<br />the Adidas 3SSB Circuit.
              </h2>

              <div className="space-y-2.5">
                <p className="text-sm font-barlow text-brand-muted leading-relaxed">
                  An AAU program came to us with no uniforms, no identity, and two teams to build from the ground up.
                </p>
                <p className="text-sm font-barlow text-brand-muted leading-relaxed">
                  We developed the full system: home, away, alternate uniforms, and tracksuits.
                </p>
                <p className="text-sm font-barlow text-brand-muted leading-relaxed">
                  They now compete on the Adidas 3SSB circuit and remain an active Grace Studios partner today.
                </p>
              </div>

              <Link
                href="/portfolio"
                className="mt-2 self-start inline-flex items-center gap-2.5 px-5 py-3 rounded-xl border border-brand-border text-brand-muted font-display font-bold text-xs uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors duration-200"
              >
                View Program →
              </Link>
            </div>

            {/* Right — partner video */}
            <div className="relative">
              {/* Ambient glow */}
              <div className="absolute -inset-4 rounded-3xl bg-brand-primary/5 blur-2xl pointer-events-none" />

              <div className="relative rounded-2xl overflow-hidden border border-brand-border bg-brand-surface shadow-lg">

                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src="/partner/aau-program.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full object-cover object-center"
                  style={{ aspectRatio: "9/16", maxHeight: 560 }}
                />

                {/* Gradient overlay — editorial depth */}
                <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-t from-brand-bg/50 to-transparent pointer-events-none" />

                {/* Partner badge */}
                <div className="absolute top-4 left-4">
                  <span className="text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2.5 py-1 rounded border text-brand-primary bg-brand-bg/80 border-brand-primary/30 backdrop-blur-sm">
                    Adidas 3SSB
                  </span>
                </div>

              </div>

              {/* Corner accent dot */}
              <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-brand-primary/40" />
            </div>

          </div>
        </div>

      </section>

      {/* ══════════════════════════════════════════════════════════════════
          STATS BAR
      ══════════════════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════════
          JERSEY STRIP — visual proof of work (commented out)
      ══════════════════════════════════════════════════════════════════ */}
      {/* <div className="border-b border-brand-border px-3 sm:px-4 lg:px-6 pt-12 sm:pt-16 pb-8 sm:pb-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {JERSEYS.map((j) => (
            <div key={j.name} className="group flex flex-col items-center gap-3">
              <div className="jersey-img-card bg-white rounded-xl w-full flex items-center justify-center">
                <img
                  src={j.src}
                  alt={j.name}
                  className="w-full object-contain group-hover:scale-105 transition-transform duration-500 ease-out"
                />
              </div>
              <span className="text-[9px] font-display font-bold uppercase tracking-[0.3em] text-brand-muted/60 text-center">{j.name}</span>
            </div>
          ))}
        </div>
      </div> */}

      {/* ══════════════════════════════════════════════════════════════════
          STATS BAR — below jerseys
      ══════════════════════════════════════════════════════════════════ */}
      <div className="border-b border-brand-border">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-10 grid grid-cols-2 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <div
              key={s.label}
              className={`py-8 flex flex-col gap-1 ${i > 0 ? "border-l border-brand-border pl-6 sm:pl-8" : ""} ${i < STATS.length - 1 ? "pr-6 sm:pr-8" : ""}`}
            >
              <span className="font-display font-bold text-brand-text text-2xl tracking-tight leading-none">{s.value}</span>
              <span className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mt-1">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          PROCESS — connected step grid
      ══════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="px-5 sm:px-8 lg:px-10 py-12 sm:py-16 border-b border-brand-border">
        <div className="max-w-5xl mx-auto">

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-10">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">The Process</span>
              </div>
              <h2 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none" style={{ fontSize: "clamp(1.1rem, 2vw, 1.75rem)" }}>
                How Every Order<br />Gets Built.
              </h2>
            </div>
            <p className="text-xs font-barlow text-brand-muted max-w-[260px] leading-relaxed lg:text-right lg:pb-0.5">
              Two client sign-offs. Zero guesswork.
              Every file reviewed by a human before it touches a supplier.
            </p>
          </div>

          {/* Steps grid — matches ROLES panel design for consistency */}
          <div className="border border-brand-border rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, i) => (
              <div
                key={step.num}
                className={`group relative flex flex-col gap-4 p-6 xl:p-7 bg-brand-bg hover:bg-brand-surface transition-colors duration-300
                  ${i > 0 ? "border-t sm:border-t-0 sm:border-l border-brand-border" : ""}
                  ${i === 2 ? "sm:border-t lg:border-t-0 border-brand-border" : ""}
                `}
              >
                {/* Hover accent bar — matches ROLES section */}
                <div className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-brand-primary" />

                {/* Top row: step number + approval badge */}
                <div className="flex items-start justify-between">
                  <span className="font-display font-bold text-[2rem] leading-none text-brand-border select-none">{step.num}</span>
                  {step.isApproval && (
                    <span className="px-2 py-0.5 rounded border bg-brand-primary/10 border-brand-primary/30 text-brand-primary font-display font-bold text-[8px] uppercase tracking-widest whitespace-nowrap">
                      ✓ Approval
                    </span>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-2 flex-1">
                  <span className={`self-start text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border ${step.whoClass}`}>
                    {step.who}
                  </span>
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm leading-snug">{step.title}</p>
                  <p className="text-xs font-barlow text-brand-muted leading-relaxed">{step.detail}</p>
                </div>

                {/* Approval indicator — matches ROLES "Enter Portal" link style */}
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
      <section className="px-5 sm:px-8 lg:px-10 py-12 sm:py-16 border-b border-brand-border">
        <div className="max-w-5xl mx-auto">

          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Every Role Has a Home</span>
          </div>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-12" style={{ fontSize: "clamp(1.1rem, 2vw, 1.75rem)" }}>
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
          ORDER TRACKER — last section
      ══════════════════════════════════════════════════════════════════ */}
      <div className="border-b border-brand-border">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-10 py-12 sm:py-16">
          <div className="grid lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px] gap-8 lg:gap-14 items-start">

            {/* Left label */}
            <div className="flex flex-col justify-center">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Live Platform</span>
              </div>
              <h2 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-4" style={{ fontSize: "clamp(1.1rem, 2vw, 1.75rem)" }}>
                Every Order.<br />Tracked End-to-End.
              </h2>
              <p className="text-xs font-barlow text-brand-muted leading-relaxed max-w-[300px]">
                From brief submission to delivery. Every stage visible to your program in real time.
              </p>
            </div>

            {/* Right — order tracker panel */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-[0_4px_32px_rgba(0,0,0,0.10)]">
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
              <div className="divide-y divide-brand-border">
                {PREVIEW_ORDERS.map((order) => (
                  <div key={order.id} className={`px-5 py-4 flex items-start justify-between gap-4 cursor-default transition-colors duration-200 ${order.urgent ? "hover:bg-amber-400/5" : "hover:bg-brand-bg/40"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${order.dot}`} />
                        <span className="text-[11px] font-display font-bold text-brand-text tracking-wide truncate">{order.team}</span>
                        {order.urgent && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-amber-400/10 border border-amber-400/30 text-amber-400 font-display font-bold text-[8px] uppercase tracking-widest">Action</span>
                        )}
                      </div>
                      <div className="ml-3.5 space-y-0.5">
                        <p className="text-[9px] font-barlow text-brand-muted">{order.id} · {order.sport}</p>
                        <p className="text-[10px] font-barlow text-brand-muted/80">{order.stage}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-display font-bold uppercase tracking-widest flex-shrink-0 mt-0.5 ${order.urgent ? "text-amber-500" : "text-brand-muted"}`}>{order.cta}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-brand-border px-5 py-4 flex items-center justify-between bg-brand-bg/30">
                <span className="text-[9px] font-barlow text-brand-muted">4 active orders</span>
                <span className="text-[9px] font-display font-bold uppercase tracking-widest text-brand-primary cursor-pointer">+ New Brief</span>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* CLIENT MOBILE SIGN-IN — scrolled to by the header "Sign In" button on mobile */}
      <section id="sign-in" className="px-5 sm:px-8 lg:px-10 py-12 sm:py-16 border-b border-brand-border lg:hidden">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-[3px] h-6 bg-brand-primary flex-shrink-0" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Existing Client</span>
          </div>
          <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-2xl mb-6">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" required
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
            />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
            />
            {error && <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">{error}</p>}
            <button type="submit" disabled={submitting || !email || !password}
              className="w-full py-4 rounded-lg bg-brand-primary text-white font-display font-bold text-sm uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors"
            >
              {submitting ? "Signing in…" : "Sign In →"}
            </button>
            <p className="text-center text-xs font-barlow text-brand-muted">
              <Link href="/forgot-password" className="hover:text-brand-primary transition-colors">Forgot password?</Link>
            </p>
          </form>
          <p className="mt-6 text-center text-xs font-barlow text-brand-muted">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-brand-text hover:text-brand-primary transition-colors underline underline-offset-2">Create one →</Link>
          </p>
        </div>
      </section>

      {/* end client view */}
      </>)}

      {/* ══════════════════════════════════════════════════════════════════
          SUPPLIER VIEW
      ══════════════════════════════════════════════════════════════════ */}
      {view === "supplier" && (
      <>

        {/* SUPPLIER HERO */}
        <section className="border-b border-brand-border overflow-hidden">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-10 grid lg:grid-cols-[1fr_400px] xl:grid-cols-[1fr_440px] gap-0 min-h-[460px] lg:min-h-[520px]">

            {/* Left — headline */}
            <div className="flex flex-col justify-center py-14 lg:py-20 lg:pr-14 border-b lg:border-b-0 lg:border-r border-brand-border">
              <div className="flex items-center gap-2.5 mb-7">
                <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">
                  For Manufacturers & Factories
                </span>
              </div>

              <h1 className="font-display font-bold uppercase text-brand-text leading-[0.9] tracking-tight mb-6">
                <span className="block" style={{ fontSize: "clamp(1.5rem, 2.8vw, 2.5rem)" }}>Clean Files.</span>
                <span className="block" style={{ fontSize: "clamp(1.5rem, 2.8vw, 2.5rem)" }}>Clear Orders.</span>
                <span className="block text-brand-primary" style={{ fontSize: "clamp(1.5rem, 2.8vw, 2.5rem)" }}>No Surprises.</span>
              </h1>

              <p className="text-xs text-brand-muted font-barlow max-w-[380px] leading-relaxed mb-7">
                Every file you receive has been approved twice: by the client and by a designer.
                First-piece review is built into every order. Run production with confidence.
              </p>

              <div className="flex flex-col sm:flex-row items-start gap-3">
                <Link
                  href="/signup"
                  className="px-7 py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
                >
                  Apply as a Supplier →
                </Link>
                <a
                  href="#supplier-how-it-works"
                  className="px-7 py-3.5 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-xs uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors"
                >
                  See How It Works
                </a>
              </div>
            </div>

            {/* Right — supplier feature preview panel */}
            <div className="hidden lg:flex flex-col justify-end pt-12 pl-8 xl:pl-10 pb-8">
              <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden shadow-[0_4px_32px_rgba(0,0,0,0.18)]">
                {/* Panel chrome */}
                <div className="border-b border-brand-border px-5 py-4 flex items-center justify-between bg-brand-bg/50">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                    <span className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-brand-text">Supplier Dashboard</span>
                  </div>
                  <span className="text-[9px] font-barlow text-brand-muted">Active Orders</span>
                </div>

                {/* Mock order rows */}
                {[
                  { id: "GE-2025-0847", sport: "Basketball", garment: "Full Uniform", stage: "Files Ready", badge: "bg-brand-primary/10 text-brand-primary border-brand-primary/30" },
                  { id: "GE-2025-0831", sport: "Soccer",     garment: "Jersey + Shorts", stage: "First Piece Review", badge: "bg-amber-400/10 text-amber-500 border-amber-400/30" },
                  { id: "GE-2025-0819", sport: "Football",   garment: "Practice Kit",  stage: "In Production", badge: "bg-brand-muted/10 text-brand-muted border-brand-border" },
                ].map((o) => (
                  <div key={o.id} className="px-5 py-4 border-b border-brand-border flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-display font-bold text-brand-text tracking-wide">{o.sport}, {o.garment}</p>
                      <p className="text-[9px] font-barlow text-brand-muted mt-0.5">{o.id}</p>
                    </div>
                    <span className={`flex-shrink-0 px-2 py-0.5 rounded border text-[8px] font-display font-bold uppercase tracking-widest ${o.badge}`}>
                      {o.stage}
                    </span>
                  </div>
                ))}

                <div className="px-5 py-4 flex items-center justify-between bg-brand-bg/30">
                  <span className="text-[9px] font-barlow text-brand-muted">3 active orders</span>
                  <span className="text-[9px] font-display font-bold uppercase tracking-widest text-brand-primary cursor-pointer">View All →</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SUPPLIER STATS */}
        <div className="border-b border-brand-border">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 lg:px-10 grid grid-cols-2 sm:grid-cols-4">
            {SUPPLIER_STATS.map((s, i) => (
              <div
                key={s.label}
                className={`py-8 flex flex-col gap-1 ${i > 0 ? "border-l border-brand-border pl-6 sm:pl-8" : ""} ${i < SUPPLIER_STATS.length - 1 ? "pr-6 sm:pr-8" : ""}`}
              >
                <span className="font-display font-bold text-brand-text text-2xl tracking-tight leading-none">{s.value}</span>
                <span className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mt-1">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SUPPLIER HOW IT WORKS */}
        <section id="supplier-how-it-works" className="px-5 sm:px-8 lg:px-10 py-12 sm:py-16 border-b border-brand-border">
          <div className="max-w-5xl mx-auto">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 mb-10">
              <div>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
                  <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">The Process</span>
                </div>
                <h2 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none" style={{ fontSize: "clamp(1.1rem, 2vw, 1.75rem)" }}>
                  How Orders<br />Flow to You.
                </h2>
              </div>
              <p className="text-xs font-barlow text-brand-muted max-w-[260px] leading-relaxed lg:text-right">
                Every brief arrives client-approved. Every file arrives designer-reviewed.
                You produce. You deliver.
              </p>
            </div>

            <div className="border border-brand-border rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
              {SUPPLIER_STEPS.map((step, i) => (
                <div
                  key={step.num}
                  className={`group relative flex flex-col gap-4 p-6 xl:p-7 bg-brand-bg hover:bg-brand-surface transition-colors duration-300
                    ${i > 0 ? "border-t sm:border-t-0 sm:border-l border-brand-border" : ""}
                    ${i === 2 ? "sm:border-t lg:border-t-0 border-brand-border" : ""}
                  `}
                >
                  <div className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-brand-primary" />
                  <span className="font-display font-bold text-[2rem] leading-none text-brand-border select-none">{step.num}</span>
                  <div className="flex flex-col gap-2 flex-1">
                    <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm leading-snug">{step.title}</p>
                    <p className="text-xs font-barlow text-brand-muted leading-relaxed">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SUPPLIER FEATURES */}
        <section className="px-5 sm:px-8 lg:px-10 py-12 sm:py-16 border-b border-brand-border">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Platform Features</span>
            </div>
            <h2 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-12" style={{ fontSize: "clamp(1.1rem, 2vw, 1.75rem)" }}>
              Everything You Need<br />to Run Clean.
            </h2>

            <div className="border border-brand-border rounded-xl overflow-hidden grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
              {SUPPLIER_FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className={`group relative flex flex-col gap-4 p-6 xl:p-8 bg-brand-bg hover:bg-brand-surface transition-colors duration-300
                    ${i % 2 === 1 ? "border-t sm:border-t-0 sm:border-l border-brand-border" : ""}
                    ${i >= 2 ? "border-t border-brand-border" : ""}
                  `}
                >
                  <div className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-brand-primary" />
                  <div className="w-10 h-10 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary flex-shrink-0">
                    {f.icon}
                  </div>
                  <div className="flex flex-col gap-2">
                    <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm">{f.title}</p>
                    <p className="text-xs font-barlow text-brand-muted leading-relaxed">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SUPPLIER CTA */}
        <section className="px-5 sm:px-8 lg:px-10 py-12 sm:py-16 border-b border-brand-border">
          <div className="max-w-5xl mx-auto flex flex-col lg:flex-row items-start lg:items-end justify-between gap-10">
            <div>
              <div className="flex items-center gap-2.5 mb-6">
                <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
                <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Join the Network</span>
              </div>
              <h2 className="font-display font-bold uppercase tracking-tight text-brand-text leading-[0.9]" style={{ fontSize: "clamp(1.4rem, 2.5vw, 2.2rem)" }}>
                Run Better<br />
                <span className="text-brand-primary">Orders.</span><br />
                Build Your Book.
              </h2>
            </div>
            <div className="flex flex-col gap-4 lg:items-end lg:pb-0.5">
              <p className="text-xs font-barlow text-brand-muted max-w-[260px] leading-relaxed lg:text-right">
                Apply to join the supplier network. Set your catalog, upload your portfolio, and start receiving
                pre-approved production orders.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/signup"
                  className="px-7 py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
                >
                  Apply as a Supplier →
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

        {/* SUPPLIER MOBILE SIGN-IN */}
        <section id="sign-in" className="px-5 sm:px-8 lg:px-10 py-12 sm:py-16 border-b border-brand-border lg:hidden">
          <div className="max-w-sm mx-auto">
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-[3px] h-6 bg-brand-primary flex-shrink-0" />
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">Existing Supplier</span>
            </div>
            <h2 className="font-display font-bold uppercase tracking-tight text-brand-text text-2xl mb-6">Sign In</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" required
                className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
              />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required
                className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3.5 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors"
              />
              {error && <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">{error}</p>}
              <button type="submit" disabled={submitting || !email || !password}
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

      </>
      )} {/* end supplier view */}

      {/* ══════════════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-brand-border px-5 sm:px-8 lg:px-10 py-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
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

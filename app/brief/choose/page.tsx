"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────────────────────
// Pre-order design path selection — shown BEFORE Team Info.
// The user picks how they want to build their brief, then we send them to
// Team Info with ?path=ai or ?path=builder so Team Info can skip the
// choose step after creating the order.
// ─────────────────────────────────────────────────────────────────────────────

const PATHS = [
  {
    id: "consultation",
    badge: "Full Service",
    sub: "Fully Managed",
    headline: "Creative Direction.\nManaged to Delivery.",
    bullets: [
      "Creative direction and strategic partnership",
      "Concepts developed around your program and identity",
      "Supplier coordination and production management",
      "Full-service production typically begins at $2,500",
    ],
    cta: "Work with Grace Studios →",
    href: "/contact",
  },
  {
    id: "self-service",
    badge: "Self-Directed",
    sub: "Flexible Workflow",
    headline: "Structured Development.\nReady When You Are.",
    body: "$149 Creative Activation applied toward your final order.",
    subPaths: [
      { label: "Design Brief", desc: "Define your direction. We develop the concept.", href: "/brief/new?path=ai" },
      { label: "Jersey Builder", desc: "Select your colorway. Your choices build the production brief.", href: "/brief/new?path=builder" },
    ],
  },
  {
    id: "upload",
    badge: "Production Files",
    sub: "Your Artwork",
    headline: "Your Files.\nOur Production Network.",
    bullets: [
      "Adobe Illustrator, EPS, PDF or SVG",
      "Your artwork. Your IP. Always.",
      "Managed production and fulfillment",
      "Fulfillment, QC, and delivery tracking",
    ],
    cta: "Upload Production Files →",
    note: "Have a sketch or concept? Creative Direction is the right starting point.",
    href: "/brief/new?path=upload",
  },
] as const;

export default function ChoosePage() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {/* ── Header ── */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-4 flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/grace-enterprise-logo.jpeg"
          alt="Grace Enterprise"
          style={{ width: 160 }}
          className="h-auto object-contain"
        />
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <a href="/contact" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Creative Direction</a>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 px-6 sm:px-10 py-12">
        <div className="max-w-5xl mx-auto">

          {/* Heading */}
          <div className="mb-10">
            <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-wide text-brand-text leading-none">
              How Would You Like to Design?
            </h1>
            <p className="mt-3 text-sm text-brand-muted font-barlow leading-relaxed max-w-lg">
              Every path leads to the same standard of execution. Choose how you want to get there.
            </p>
          </div>

          {/* Cards */}
          <div className="border border-brand-border rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-3">

            {/* ── Card 1: Full Service ── */}
            <div className="flex flex-col p-7 border-b lg:border-b-0 lg:border-r border-brand-border">
              <div className="flex items-center justify-between mb-5">
                <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-primary">Full Service</span>
                <span className="text-[9px] font-display uppercase tracking-widest text-brand-muted/60">Fully Managed</span>
              </div>
              <p className="font-display font-bold uppercase tracking-wide text-brand-text text-lg leading-snug mb-4">
                Elevated Apparel Development.<br />Concept Through Delivery.
              </p>
              <ul className="space-y-2.5 flex-1 mb-6">
                {["Creative direction and program strategy", "Concepts built around your program identity", "Managed supplier coordination and fulfillment oversight"].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="w-1 h-1 rounded-full bg-brand-primary flex-shrink-0 mt-1.5" />
                    <span className="text-[11px] font-barlow text-brand-muted leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/contact"
                className="inline-flex items-center justify-center w-full py-3 rounded-lg bg-brand-primary text-white font-display font-bold text-[10px] uppercase tracking-widest hover:bg-brand-secondary transition-colors"
              >
                Creative Direction →
              </a>
            </div>

            {/* ── Card 2: Self Service ── */}
            <div className="flex flex-col p-7 border-b lg:border-b-0 lg:border-r border-brand-border">
              <div className="flex items-center justify-between mb-5">
                <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-primary">Self-Directed</span>
                <span className="text-[9px] font-display uppercase tracking-widest text-brand-muted/60">Flexible Workflow</span>
              </div>
              <p className="font-display font-bold uppercase tracking-wide text-brand-text text-lg leading-snug mb-2">
                Structured Development.<br />Ready When You Are.
              </p>
              <p className="text-[11px] font-barlow text-brand-muted mb-5 leading-relaxed">
                $149 Creative Activation applied toward your final order.
              </p>
              <div className="space-y-3 flex-1">
                <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">Choose Your Path</p>
                <Link
                  href="/brief/new?path=ai"
                  className="group flex items-center justify-between p-3.5 rounded-lg border border-brand-border hover:border-brand-primary/40 bg-brand-surface hover:bg-brand-bg transition-all"
                >
                  <div>
                    <p className="text-[11px] font-display font-bold uppercase tracking-wider text-brand-text group-hover:text-brand-primary transition-colors">Design Brief</p>
                    <p className="text-[10px] font-barlow text-brand-muted mt-0.5">Define your direction. We develop the concept.</p>
                  </div>
                  <span className="text-brand-muted group-hover:text-brand-primary transition-colors">→</span>
                </Link>
                <Link
                  href="/brief/new?path=builder"
                  className="group flex items-center justify-between p-3.5 rounded-lg border border-brand-border hover:border-brand-primary/40 bg-brand-surface hover:bg-brand-bg transition-all"
                >
                  <div>
                    <p className="text-[11px] font-display font-bold uppercase tracking-wider text-brand-text group-hover:text-brand-primary transition-colors">Jersey Builder</p>
                    <p className="text-[10px] font-barlow text-brand-muted mt-0.5">Select your colorway. Your choices build the production brief.</p>
                  </div>
                  <span className="text-brand-muted group-hover:text-brand-primary transition-colors">→</span>
                </Link>
              </div>
            </div>

            {/* ── Card 3: Production Files ── */}
            <div className="flex flex-col p-7">
              <div className="flex items-center justify-between mb-5">
                <span className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-primary">Production Files</span>
                <span className="text-[9px] font-display uppercase tracking-widest text-brand-muted/60">Your Artwork</span>
              </div>
              <p className="font-display font-bold uppercase tracking-wide text-brand-text text-lg leading-snug mb-4">
                Your Files.<br />Managed to Delivery.
              </p>
              <ul className="space-y-2.5 flex-1 mb-6">
                {["Adobe Illustrator, EPS, PDF or SVG", "Your artwork. Your IP. Always.", "Managed production support and fulfillment oversight", "Fulfillment, QC, and delivery tracking"].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="w-1 h-1 rounded-full bg-brand-primary flex-shrink-0 mt-1.5" />
                    <span className="text-[11px] font-barlow text-brand-muted leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[10px] font-barlow text-brand-muted/60 italic mb-4 leading-relaxed">
                Have a concept in progress? Creative Direction is the right starting point.
              </p>
              <a
                href="/brief/new?path=upload"
                className="inline-flex items-center justify-center w-full py-3 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-[10px] uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-colors"
              >
                Upload Production Files →
              </a>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import OrgLogo from "@/components/OrgLogo";

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
      {/* Header */}
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between border-b border-brand-border">
        <OrgLogo href="/portal" />
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <a href="/contact" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Creative Direction</a>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-14">
        <div className="w-full max-w-4xl animate-fade-up">

          <div className="mb-8">
            <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-wide text-brand-text leading-none">
              How Would You Like to Design?
            </h1>
            <p className="mt-2.5 text-sm text-brand-muted font-barlow leading-relaxed max-w-lg">
              Every path leads to the same standard of execution. Choose how you want to get there.
            </p>
          </div>

          {/* ── Three top-level cards ─────────────────────────────────────── */}
          <div className="grid sm:grid-cols-3 gap-5 mt-2">

            {/* ── 1. Consultation ──────────────────────────────────────────── */}
            <Link
              href="/contact"
              className="group relative flex flex-col gap-5 p-6 rounded-2xl border border-brand-border bg-brand-bg hover:bg-brand-surface hover:border-brand-primary/40 transition-all duration-300 shadow-sm hover:shadow-md"
            >
              <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl bg-brand-border group-hover:bg-brand-primary transition-all duration-300" />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border text-brand-primary bg-brand-primary/10 border-brand-primary/30">
                  Full Service
                </span>
                <span className="text-[8px] font-display uppercase tracking-widest text-brand-muted/60">
                  Fully Managed
                </span>
              </div>

              <div>
                <h2 className="font-display font-bold uppercase tracking-wide text-brand-text text-lg leading-snug">
                  Designed.{"\n"}Managed.{"\n"}Delivered.
                </h2>
                <p className="mt-2 text-[11px] font-barlow text-brand-muted leading-relaxed">
                  Full creative and production partnership. Strategy, concept, manufacturing, and delivery. Handled.
                </p>
              </div>

              <ul className="space-y-2 flex-1">
                {[
                  "Creative consultation and strategic direction",
                  "Concepts developed around your program and identity",
                  "Production and manufacturing coordination",
                  "Starting at $300+",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0" />
                    <span className="text-[10px] font-barlow text-brand-muted leading-none">{item}</span>
                  </li>
                ))}
              </ul>

              <span className="text-[10px] font-display font-bold uppercase tracking-widest text-brand-muted group-hover:text-brand-primary transition-colors">
                Work with Grace Studios →
              </span>
            </Link>

            {/* ── 2. Self Service — compound card with two sub-paths ──────── */}
            <div className="relative flex flex-col gap-4 p-6 rounded-2xl border border-brand-border bg-brand-bg shadow-sm">
              <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl bg-brand-primary/60" />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border text-brand-primary bg-brand-primary/10 border-brand-primary/30">
                  Self Service
                </span>
                <span className="text-[8px] font-display uppercase tracking-widest text-brand-muted/60">
                  Two Paths
                </span>
              </div>

              <div>
                <h2 className="font-display font-bold uppercase tracking-wide text-brand-text text-lg leading-snug">
                  Design Freely.{"\n"}Activate When Ready.
                </h2>
                <p className="mt-2 text-[11px] font-barlow text-brand-muted leading-relaxed">
                  Free to build. $100 activation applied toward your final order.
                </p>
              </div>

              {/* Sub-path divider */}
              <div className="border-t border-brand-border pt-4 flex flex-col gap-3 flex-1">
                <p className="text-[8px] font-display font-bold uppercase tracking-[0.28em] text-brand-muted">
                  Choose your path
                </p>

                {/* Design Brief sub-path */}
                <Link
                  href="/brief/new?path=ai"
                  className="group/sub flex flex-col gap-1.5 p-3.5 rounded-xl border border-brand-border bg-brand-surface hover:border-brand-primary hover:bg-brand-primary/5 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-display font-bold uppercase tracking-wider text-brand-text group-hover/sub:text-brand-primary transition-colors">
                      Design Brief
                    </span>
                    <svg className="w-3 h-3 text-brand-muted group-hover/sub:text-brand-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                  <p className="text-[9px] font-barlow text-brand-muted leading-snug">
                    Submit your vision, colors, and direction. We build the concept.
                  </p>
                </Link>

                {/* Jersey Builder sub-path */}
                <Link
                  href="/brief/new?path=builder"
                  className="group/sub flex flex-col gap-1.5 p-3.5 rounded-xl border border-brand-border bg-brand-surface hover:border-brand-primary hover:bg-brand-primary/5 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-display font-bold uppercase tracking-wider text-brand-text group-hover/sub:text-brand-primary transition-colors">
                      Jersey Builder
                    </span>
                    <svg className="w-3 h-3 text-brand-muted group-hover/sub:text-brand-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                  <p className="text-[9px] font-barlow text-brand-muted leading-snug">
                    Color every zone in real-time 3D. Your selections drive the production brief.
                  </p>
                </Link>
              </div>
            </div>

            {/* ── 3. Bring Your Own — production files only ────────────────── */}
            <Link
              href="/brief/new?path=upload"
              className="group relative flex flex-col gap-5 p-6 rounded-2xl border border-brand-border bg-brand-bg hover:bg-brand-surface hover:border-brand-primary/40 transition-all duration-300 shadow-sm hover:shadow-md"
            >
              <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl bg-brand-border group-hover:bg-brand-muted/50 transition-all duration-300" />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border text-brand-muted bg-brand-muted/10 border-brand-muted/30">
                  Production Files
                </span>
                <span className="text-[8px] font-display uppercase tracking-widest text-brand-muted/60">
                  Your Artwork
                </span>
              </div>

              <div>
                <h2 className="font-display font-bold uppercase tracking-wide text-brand-text text-lg leading-snug">
                  Your Files.{"\n"}Our Production{"\n"}Network.
                </h2>
                <p className="mt-2 text-[11px] font-barlow text-brand-muted leading-relaxed">
                  Production-ready artwork, managed to delivery. Your files. Your IP. Always.
                </p>
              </div>

              <ul className="space-y-2 flex-1">
                {[
                  "Adobe Illustrator, EPS, PDF or SVG",
                  "Your artwork. Your IP. Always.",
                  "Managed production and fulfillment",
                  "Fulfillment, QC, and delivery tracking",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-muted/60 flex-shrink-0" />
                    <span className="text-[10px] font-barlow text-brand-muted leading-none">{item}</span>
                  </li>
                ))}
              </ul>

              <p className="text-[9px] font-barlow text-brand-muted/50 italic border-t border-brand-border pt-3 leading-snug">
                Have a sketch or concept? Creative Direction is the right starting point.
              </p>

              <span className="text-[10px] font-display font-bold uppercase tracking-widest text-brand-muted group-hover:text-brand-primary transition-colors">
                Upload Production Files →
              </span>
            </Link>

          </div>
        </div>
      </main>
    </div>
  );
}

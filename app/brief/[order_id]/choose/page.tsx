"use client";

import { use } from "react";
import Link from "next/link";
import BriefLayout from "@/components/brief/BriefLayout";

// ─────────────────────────────────────────────────────────────────────────────
// This interstitial sits between Step 1 (Team Info) and Step 2 (Design System).
// The user picks how they want to build their brief:
//   AI Brief  → /brief/[orderId]/style  (existing AI-driven flow)
//   Jersey Builder → /jersey-builder?orderId=[orderId]
// ─────────────────────────────────────────────────────────────────────────────

const PATHS = [
  {
    id: "ai",
    badge: "Self Service",
    sub: "AI-Powered Brief",
    headline: "Describe Your Vision.\nWe Handle the Rest.",
    body: "Answer a few quick questions about your style, colors, and inspirations. Our AI turns your answers into a design brief — reviewed and executed by a Grace Studios designer.",
    bullets: [
      "Guided questions — under 3 minutes",
      "AI concept generated immediately",
      "Designer mockup follows",
      "Two client approval checkpoints",
    ],
    cta: "Continue with AI Brief →",
    accentColor: "group-hover:bg-brand-primary",
    hrefFn: (orderId: string) => `/brief/${orderId}/style`,
  },
  {
    id: "builder",
    badge: "Visual Design",
    sub: "Jersey Builder",
    headline: "Build It Visually.\nSee It in 3D.",
    body: "Color every zone of your jersey live — body, collar, sleeves, panels, shorts — upload your logo and position it on a 3D model. Your choices pre-fill the brief automatically.",
    bullets: [
      "Real-time 3D jersey preview",
      "7 independently colorable zones",
      "Drag-and-drop logo placement",
      "Colors carry into your brief",
    ],
    cta: "Open Jersey Builder →",
    accentColor: "group-hover:bg-brand-secondary",
    hrefFn: (orderId: string) => `/jersey-builder?orderId=${orderId}`,
  },
] as const;

export default function ChoosePage({ params }: { params: Promise<{ order_id: string }> }) {
  const { order_id } = use(params);

  return (
    <BriefLayout
      currentStep={1}
      title="How Would You Like to Design?"
      subtitle="Both paths lead to the same Grace Studios design quality. Choose what works best for your team."
    >
      <div className="grid sm:grid-cols-2 gap-5 mt-2">
        {PATHS.map((path) => (
          <Link
            key={path.id}
            href={path.hrefFn(order_id)}
            className="group relative flex flex-col gap-5 p-6 rounded-2xl border border-brand-border bg-brand-bg hover:bg-brand-surface hover:border-brand-primary/40 transition-all duration-300 shadow-sm hover:shadow-md"
          >
            {/* Accent bar */}
            <div
              className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl bg-brand-border transition-all duration-300 ${path.accentColor}`}
            />

            {/* Badges */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border text-brand-primary bg-brand-primary/10 border-brand-primary/30">
                {path.badge}
              </span>
              <span className="text-[8px] font-display uppercase tracking-widest text-brand-muted/60">
                {path.sub}
              </span>
            </div>

            {/* Headline + body */}
            <div>
              <h2 className="font-display font-bold uppercase tracking-wide text-brand-text text-lg leading-snug whitespace-pre-line">
                {path.headline}
              </h2>
              <p className="mt-2 text-[11px] font-barlow text-brand-muted leading-relaxed">
                {path.body}
              </p>
            </div>

            {/* Bullets */}
            <ul className="space-y-2 flex-1">
              {path.bullets.map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0" />
                  <span className="text-[10px] font-barlow text-brand-muted leading-none">{item}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <span className="text-[10px] font-display font-bold uppercase tracking-widest text-brand-muted group-hover:text-brand-primary transition-colors">
              {path.cta}
            </span>
          </Link>
        ))}
      </div>
    </BriefLayout>
  );
}

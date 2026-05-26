"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import OrgLogo from "@/components/OrgLogo";

// ─────────────────────────────────────────────────────────────────────────────
// Pre-order design path selection — shown BEFORE Team Info.
// The user picks how they want to build their brief, then we send them to
// Team Info with ?path=ai or ?path=builder so Team Info can skip the
// choose step after creating the order.
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
    href: "/brief/new?path=ai",
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
    href: "/brief/new?path=builder",
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
      {/* Header — same as BriefLayout */}
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between border-b border-brand-border">
        <OrgLogo href="/portal" />
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <a href="/contact" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Consultation</a>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-14">
        <div className="w-full max-w-2xl animate-fade-up">
          {/* No progress bar — this is before the brief officially starts */}

          <div className="mb-8">
            <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-wide text-brand-text leading-none">
              How Would You Like to Design?
            </h1>
            <p className="mt-2.5 text-sm text-brand-muted font-barlow leading-relaxed max-w-lg">
              Both paths lead to the same Grace Studios design quality. Choose what works best for your team.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5 mt-2">
            {PATHS.map((path) => (
              <Link
                key={path.id}
                href={path.href}
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
        </div>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import Link from "next/link";
import OrgLogo from "@/components/OrgLogo";

// ─────────────────────────────────────────────────────────────────────────────
// Path choice cards
// ─────────────────────────────────────────────────────────────────────────────

const PATHS = [
  {
    id: "ai",
    href: "/brief/choose",
    badge: "Self Service",
    sub: "AI-Powered Brief",
    headline: "Describe Your Vision.\nWe Handle the Rest.",
    body: "Answer a few questions about your team, sport, colors, and style. Our AI translates your input into a full design brief, ready for a Grace Studios designer in minutes.",
    bullets: [
      "Ready in under 5 minutes",
      "AI concept generated immediately",
      "Designer mockup follows",
      "Two client approval checkpoints",
    ],
    cta: "Start with AI Brief →",
    accentClass: "group-hover:bg-brand-primary",
  },
  {
    id: "builder",
    href: "/jersey-builder",
    badge: "Visual Design",
    sub: "Jersey Builder",
    headline: "Build It Visually.\nSee It in 3D.",
    body: "Choose colors for every panel (jersey, shorts, collar, sleeves), upload your logo, and position it on a live 3D model. Your design choices flow directly into your brief.",
    bullets: [
      "Real-time 3D preview",
      "7 independently colorable zones",
      "Drag-and-drop logo placement",
      "Design choices auto-fill your brief",
    ],
    cta: "Open Jersey Builder →",
    accentClass: "group-hover:bg-brand-secondary",
  },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function StartPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const [ready, setReady]     = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  // ── Auth guard ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      try {
        createClient();
        await sessionReady();
        const profile = await getProfile();
        if (!profile) { router.replace("/login"); return; }
        if (profile.role === "supplier") { router.replace("/supplier"); return; }
        if (profile.role === "designer") { router.replace("/designer"); return; }
        setReady(true);
      } catch {
        router.replace("/login");
      }
    }
    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignOut() {
    await supabaseRef.current.auth.signOut();
    router.push("/login");
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {/* Header */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-5 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <div className="flex items-center gap-5">
          <Link href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
            ← Portal
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-10 py-16">
        <div className="w-full max-w-3xl space-y-10 animate-fade-up">

          {/* Headline */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-[3px] h-5 bg-brand-primary" />
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-muted">
                New Order
              </span>
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-wide text-brand-text leading-none">
              How Would You<br />Like to Start?
            </h1>
            <p className="text-sm font-barlow text-brand-muted max-w-md mx-auto leading-relaxed">
              Choose the path that works best for your team. Both lead to the same Grace Studios design quality.
            </p>
          </div>

          {/* Path cards */}
          <div className="grid sm:grid-cols-2 gap-5">
            {PATHS.map((path) => (
              <Link
                key={path.id}
                href={path.href}
                onMouseEnter={() => setHovered(path.id)}
                onMouseLeave={() => setHovered(null)}
                className="group relative flex flex-col gap-5 p-6 rounded-2xl border border-brand-border bg-brand-bg hover:bg-brand-surface hover:border-brand-primary/40 transition-all duration-300 shadow-sm hover:shadow-md"
              >
                {/* Accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-2xl bg-brand-border transition-all duration-300 ${path.accentClass}`} />

                {/* Badges */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[8px] font-display font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded border text-brand-primary bg-brand-primary/10 border-brand-primary/30">
                    {path.badge}
                  </span>
                  <span className="text-[8px] font-display uppercase tracking-widest text-brand-muted/60">
                    {path.sub}
                  </span>
                </div>

                {/* Headline */}
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

          {/* Subtle divider / already have a brief */}
          <p className="text-center text-[10px] font-barlow text-brand-muted/50">
            Looking for a previous order?{" "}
            <Link href="/portal" className="text-brand-muted hover:text-brand-primary underline underline-offset-2 transition-colors">
              Back to portal
            </Link>
          </p>

        </div>
      </main>
    </div>
  );
}

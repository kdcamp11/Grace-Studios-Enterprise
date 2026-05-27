"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BriefProgress, { type Step } from "./BriefProgress";
import OrgLogo from "@/components/OrgLogo";

interface BriefLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  steps?: Step[];
}

export default function BriefLayout({ children, currentStep, title, subtitle, maxWidth = "max-w-2xl", steps }: BriefLayoutProps) {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {/* Header */}
      <header className="px-6 sm:px-10 py-5 flex items-center justify-between border-b border-brand-border">
        <OrgLogo href="/portal" />

        <div className="flex items-center gap-4 sm:gap-5">
          {/* Back — always visible */}
          <button
            type="button"
            onClick={() => router.back()}
            className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
          >
            ← Back
          </button>

          {/* Desktop nav — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-5">
            <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
            <a href="/contact" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Creative Direction</a>
            <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
          </div>

          {/* Mobile menu — hamburger + dropdown */}
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="text-brand-muted hover:text-brand-primary transition-colors p-1"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
            >
              {menuOpen ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>

            {menuOpen && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                {/* Dropdown */}
                <div className="absolute right-0 top-full mt-2 w-52 bg-brand-surface border border-brand-border rounded-xl shadow-lg py-1.5 z-50">
                  <a
                    href="/portal"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center px-4 py-3 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
                  >
                    Home
                  </a>
                  <a
                    href="/contact"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center px-4 py-3 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
                  >
                    Creative Direction
                  </a>
                  <div className="mx-4 my-1 border-t border-brand-border" />
                  <button
                    type="button"
                    onClick={() => { setMenuOpen(false); signOut(); }}
                    className="w-full text-left px-4 py-3 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-14">
        <div className={`w-full ${maxWidth} animate-fade-up`}>
          <BriefProgress currentStep={currentStep} steps={steps} />

          <div className="mb-8">
            <h1 className="font-display text-4xl sm:text-5xl font-bold uppercase tracking-wide text-brand-text leading-none">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-2.5 text-sm text-brand-muted font-barlow leading-relaxed max-w-lg">
                {subtitle}
              </p>
            )}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}

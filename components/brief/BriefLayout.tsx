"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useRef } from "react";
import BriefProgress from "./BriefProgress";
import OrgLogo from "@/components/OrgLogo";

interface BriefLayoutProps {
  children: React.ReactNode;
  currentStep: number;
  title: string;
  subtitle?: string;
  maxWidth?: string;
}

export default function BriefLayout({ children, currentStep, title, subtitle, maxWidth = "max-w-2xl" }: BriefLayoutProps) {
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
        <div className="flex items-center gap-4">
          <OrgLogo href="/portal" />
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Client Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 py-10 sm:py-14">
        <div className={`w-full ${maxWidth} animate-fade-up`}>
          <BriefProgress currentStep={currentStep} />

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

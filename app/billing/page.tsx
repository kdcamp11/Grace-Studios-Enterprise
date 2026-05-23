"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";

interface PlanTier {
  id: string;
  label: string;
  price: string;
  current: boolean;
  badge?: string;
  tagline: string;
  features: string[];
}

const CLIENT_PLANS: PlanTier[] = [
  {
    id: "free",
    label: "Free",
    price: "$0",
    current: true,
    badge: "Your Plan",
    tagline: "Full access to the Grace Studios platform at no cost.",
    features: [
      "Submit briefs and start orders",
      "AI concept generation",
      "Designer mockup review & approval",
      "First piece review",
      "Order tracking from brief to delivery",
      "Consultation requests",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    price: "$0",
    current: false,
    tagline: "Premium features for programs with higher volume needs.",
    features: [
      "Everything in Free",
      "Priority concept generation",
      "Dedicated account manager",
      "Faster turnaround SLA",
      "Multi-order dashboard",
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "$0",
    current: false,
    tagline: "Full identity systems for large programs.",
    features: [
      "Everything in Pro",
      "Full identity system design",
      "Exclusive colorway development",
      "Custom payment terms",
      "White-glove onboarding",
    ],
  },
];

export default function ClientBillingPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;
  const [loading, setLoading] = useState(true);
  const [email, setEmail]     = useState("");

  useEffect(() => {
    async function load() {
      await sessionReady();
      const profile = await getProfile();
      if (!profile) { router.replace("/login"); return; }
      // Suppliers have their own billing page
      if (profile.role === "supplier") { router.replace("/supplier/billing"); return; }
      // Admins use the admin billing page
      if (profile.role === "admin" || profile.role === "super_admin") { router.replace("/admin/billing"); return; }
      setEmail(profile.email);
      setLoading(false);
    }
    load();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
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
      {/* Header — matches client portal */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-5 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">My Orders</a>
          <a href="/brief/new" className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">+ New Order</a>
          <a href="/portfolio" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Portfolio</a>
          <a href="/contact" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Consultation</a>
          <a href="/portal/settings" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Settings</a>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-10 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto space-y-10">

          {/* Section label */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">
                Account & Billing
              </span>
            </div>
            <h1
              className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-3"
              style={{ fontSize: "clamp(1.8rem, 3vw, 2.8rem)" }}
            >
              Your Plan
            </h1>
            <p className="text-sm font-barlow text-brand-muted max-w-[460px] leading-relaxed">
              Grace Studios covers the platform for program partners. Submitting briefs, reviewing
              concepts, and approving files are always free.
            </p>
          </div>

          {/* Current plan callout */}
          <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 px-6 py-5 flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-display font-bold uppercase tracking-wide text-brand-text">
                Free — Active
              </p>
              <p className="text-xs font-barlow text-brand-muted mt-0.5">{email}</p>
              <p className="text-xs font-barlow text-brand-muted mt-1.5 leading-relaxed">
                You have full access to submit briefs, review AI concepts, approve designer files,
                and track production. No credit card required — ever.
              </p>
            </div>
          </div>

          {/* Plan comparison */}
          <div className="space-y-4">
            <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted">Plan Comparison</p>

            <div className="grid sm:grid-cols-3 gap-4">
              {CLIENT_PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative rounded-xl border p-6 flex flex-col gap-4 ${
                    plan.current
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-brand-border bg-brand-surface opacity-60"
                  }`}
                >
                  {plan.badge && (
                    <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary font-display font-bold text-[8px] uppercase tracking-widest">
                      {plan.badge}
                    </span>
                  )}

                  <div>
                    <p className="font-display font-bold uppercase tracking-widest text-brand-text text-sm mb-1">{plan.label}</p>
                    <p className="text-xs font-barlow text-brand-muted leading-snug">{plan.tagline}</p>
                  </div>

                  <ul className="space-y-1.5 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <div className={`w-[3px] h-3 flex-shrink-0 mt-0.5 ${plan.current ? "bg-brand-primary" : "bg-brand-border"}`} />
                        <span className="text-xs font-barlow text-brand-muted leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Pro/Enterprise CTA */}
          <div className="border-t border-brand-border pt-8 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-display font-bold uppercase tracking-wide text-brand-text">
                Need priority access or a dedicated account manager?
              </p>
              <p className="text-xs font-barlow text-brand-muted mt-1">
                Large programs with 50+ athletes or multi-sport identity systems can request Pro or Enterprise access.
              </p>
            </div>
            <a
              href="/contact"
              className="flex-shrink-0 px-6 py-3 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
            >
              Contact Us →
            </a>
          </div>

        </div>
      </main>

      <footer className="border-t border-brand-border px-6 py-5 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted">
          Grace Studios · Program Partner Portal
        </p>
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import { createClient } from "@/lib/supabase/client";
import { useRef } from "react";

type Plan = "pro" | "enterprise";

interface PlanCard {
  id: Plan;
  label: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  badge?: string;
}

const SUPPLIER_PLANS: PlanCard[] = [
  {
    id: "pro",
    label: "Pro",
    price: "$299",
    period: "/mo",
    tagline: "For production partners ready to scale.",
    badge: "Most Popular",
    features: [
      "Unlimited assigned orders",
      "Full supplier portal access",
      "Portfolio gallery (up to 50 items)",
      "Stripe Connect payouts",
      "Priority order routing",
      "Email & chat support",
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise",
    price: "$999",
    period: "/mo",
    tagline: "For large factories with dedicated account support.",
    features: [
      "Everything in Pro",
      "Dedicated account manager",
      "Custom SLA & delivery guarantees",
      "Multi-location production support",
      "White-label integration",
      "Custom onboarding",
    ],
  },
];

export default function SupplierBillingPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [selected, setSelected]   = useState<Plan | null>(null);
  const [name, setName]           = useState("");
  const [loading, setLoading]     = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    async function load() {
      const profile = await getProfile();
      if (!profile || profile.role !== "supplier") {
        router.replace("/portal");
        return;
      }
      setName(profile.full_name ?? profile.email);
      setLoading(false);
    }
    load();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleUpgrade() {
    if (!selected) return;
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selected }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setUpgrading(false);
    }
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
      {/* Header */}
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TenantLogo href="/supplier" />
        </div>
        <div className="flex items-center gap-5">
          <span className="text-xs text-brand-muted font-barlow hidden sm:block">{name}</span>
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Orders</a>
          <a href="/supplier/portfolio" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Portfolio</a>
          <a href="/settings" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Settings</a>
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
                Studio License
              </span>
            </div>
            <h1 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-3"
                style={{ fontSize: "clamp(1.8rem, 3vw, 2.8rem)" }}>
              Production Partner Plans
            </h1>
            <p className="text-sm font-barlow text-brand-muted leading-relaxed max-w-[480px]">
              Your Grace Studios license gives you access to the supplier portal, order management,
              and Stripe Connect payouts. Select the plan that fits your production volume.
            </p>
          </div>

          {/* Client access note */}
          <div className="rounded-xl border border-brand-border bg-brand-surface px-6 py-5 flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-display font-bold uppercase tracking-wide text-brand-text">
                Your clients use Grace Studios for free
              </p>
              <p className="text-xs font-barlow text-brand-muted mt-1 leading-relaxed">
                Clients submit briefs, review concepts, and approve production files at no cost.
                Your studio license covers the platform infrastructure — they just use the service.
              </p>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid sm:grid-cols-2 gap-5">
            {SUPPLIER_PLANS.map((plan) => {
              const isSelected = selected === plan.id;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelected(isSelected ? null : plan.id)}
                  className={`relative text-left rounded-xl border p-6 flex flex-col gap-5 transition-all duration-200 focus:outline-none ${
                    isSelected
                      ? "border-brand-primary bg-brand-primary/5 shadow-[0_0_0_1px_var(--color-primary,#CC0000)]"
                      : "border-brand-border bg-brand-surface hover:border-brand-primary/50"
                  }`}
                >
                  {plan.badge && (
                    <span className="absolute top-4 right-4 px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary font-display font-bold text-[8px] uppercase tracking-widest">
                      {plan.badge}
                    </span>
                  )}

                  {/* Plan name + price */}
                  <div>
                    <p className="font-display font-bold uppercase tracking-widest text-brand-text text-base mb-1">
                      {plan.label}
                    </p>
                    <div className="flex items-end gap-0.5">
                      <span className="font-display font-bold text-3xl text-brand-text leading-none">{plan.price}</span>
                      <span className="text-sm font-barlow text-brand-muted mb-0.5">{plan.period}</span>
                    </div>
                    <p className="text-xs font-barlow text-brand-muted mt-2">{plan.tagline}</p>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <div className="w-[3px] h-3.5 bg-brand-primary flex-shrink-0 mt-0.5" />
                        <span className="text-xs font-barlow text-brand-muted leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Selection indicator */}
                  <div className={`flex items-center gap-2 pt-4 border-t border-brand-border ${isSelected ? "border-brand-primary/30" : ""}`}>
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected ? "border-brand-primary bg-brand-primary" : "border-brand-border"
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className={`text-[10px] font-display uppercase tracking-widest transition-colors ${
                      isSelected ? "text-brand-primary" : "text-brand-muted"
                    }`}>
                      {isSelected ? "Selected" : "Select Plan"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* CTA bar — appears when a plan is selected */}
          {selected && (
            <div className="sticky bottom-6 rounded-xl border border-brand-primary/30 bg-brand-surface shadow-lg px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-display font-bold uppercase tracking-wide text-brand-text">
                  {SUPPLIER_PLANS.find((p) => p.id === selected)?.label} Plan Selected
                </p>
                <p className="text-xs font-barlow text-brand-muted mt-0.5">
                  {SUPPLIER_PLANS.find((p) => p.id === selected)?.price}/mo — billed monthly, cancel anytime
                </p>
              </div>
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={upgrading}
                className="flex-shrink-0 px-6 py-3 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary disabled:opacity-40 transition-colors"
              >
                {upgrading ? "Redirecting…" : "Upgrade Now →"}
              </button>
            </div>
          )}

          {/* Custom / enterprise contact */}
          <div className="border-t border-brand-border pt-8 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-display font-bold uppercase tracking-wide text-brand-text">Need a custom arrangement?</p>
              <p className="text-xs font-barlow text-brand-muted mt-1">Large factory groups, multi-region setup, or custom SLAs — reach out directly.</p>
            </div>
            <a
              href="/contact"
              className="flex-shrink-0 text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors"
            >
              Contact Us →
            </a>
          </div>
        </div>
      </main>

      <footer className="border-t border-brand-border px-6 py-5 text-center">
        <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted">
          Grace Studios · Studio License
        </p>
      </footer>
    </div>
  );
}

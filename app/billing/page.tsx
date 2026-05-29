"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";
import { CLIENT_PLANS, fmt$, type ClientAiPlan } from "@/lib/payments/client-plans";
import { Suspense } from "react";

const PLANS_ORDER: ClientAiPlan[] = ["starter", "growth", "studio"];

interface UsageData {
  totalOrders:        number;
  ordersWithConcepts: number;
  thisMonth:          number;
  conceptsGenerated:  number;
  history: { month: string; runs: number }[];
}

function UsageBar({ used, included }: { used: number; included: number | null }) {
  if (included === null) {
    return (
      <div className="space-y-1.5">
        <div className="h-2 rounded-full bg-brand-primary w-full" />
        <span className="text-[10px] font-barlow text-brand-muted">Unlimited access this cycle</span>
      </div>
    );
  }
  const pct  = Math.min((used / Math.max(included, 1)) * 100, 100);
  const over = used > included;
  return (
    <div className="space-y-1.5">
      <div className="h-2 rounded-full bg-brand-border overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${over ? "bg-amber-400" : "bg-brand-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between">
        <span className="text-[10px] font-barlow text-brand-muted">{used} of {included} included this cycle</span>
        {over && (
          <span className="text-[10px] font-display uppercase tracking-wider text-amber-500 font-bold">
            {used - included} over limit
          </span>
        )}
      </div>
    </div>
  );
}

function BillingContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;

  const [loading, setLoading]       = useState(true);
  const [email, setEmail]           = useState("");
  const [usage, setUsage]           = useState<UsageData | null>(null);
  const [currentPlan, setCurrentPlan] = useState<ClientAiPlan>("starter");
  const [runsIncluded, setRunsIncluded] = useState<number | null>(3);
  const [selected, setSelected]     = useState<ClientAiPlan | null>(null);
  const [upgrading, setUpgrading]   = useState(false);

  const successMsg = searchParams.get("success") === "1"
    ? `Plan activated! You're now on ${CLIENT_PLANS[searchParams.get("plan") as ClientAiPlan ?? "starter"]?.label ?? "your new plan"}.`
    : searchParams.get("canceled") === "1"
    ? "Checkout canceled. No changes were made."
    : null;

  useEffect(() => {
    async function load() {
      await sessionReady();
      const profile = await getProfile();
      if (!profile) { router.replace("/login"); return; }
      if (profile.role === "supplier") { router.replace("/supplier/billing"); return; }
      setEmail(profile.email);

      const [usageRes, subRes] = await Promise.all([
        fetch("/api/portal/usage"),
        fetch("/api/billing/client-subscription"),
      ]);

      if (usageRes.ok) {
        const { usage: u } = await usageRes.json();
        setUsage(u);
      }
      if (subRes.ok) {
        const d = await subRes.json();
        setCurrentPlan(d.plan ?? "starter");
        setRunsIncluded(d.runsIncluded ?? 3);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleUpgrade() {
    if (!selected || selected === currentPlan) return;
    if (selected === "starter") return; // downgrade — contact support
    setUpgrading(true);
    try {
      const res = await fetch("/api/billing/client-checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ plan: selected }),
      });
      const { url, error } = await res.json();
      if (url) { window.location.href = url; return; }
      console.error("Checkout error:", error);
    } catch (e) {
      console.error(e);
    }
    setUpgrading(false);
  }

  const thisMonth  = usage?.thisMonth  ?? 0;
  const over       = runsIncluded !== null ? Math.max(0, thisMonth - runsIncluded) : 0;
  const now        = new Date();
  const cycleEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysLeft   = Math.ceil((cycleEnd.getTime() - now.getTime()) / 86400000);

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
      <header className="border-b border-brand-border px-6 sm:px-10 py-5 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <div className="flex items-center gap-5">
          <a href="/portal"          className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">My Orders</a>
          <a href="/brief/choose"       className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">+ New Order</a>
          <a href="/contact"         className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Creative Direction</a>
          <a href="/portal/settings" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Settings</a>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-10 py-12 sm:py-16">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* Page header */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-[3px] h-5 bg-brand-primary flex-shrink-0" />
              <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-brand-primary">
                Concept Development
              </span>
            </div>
            <h1 className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-2"
                style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)" }}>
              Concept Development
            </h1>
            <p className="text-sm font-barlow text-brand-muted max-w-md leading-relaxed">
              Concept development access is included with your account. Your activity resets on the 1st of each month.
            </p>
          </div>

          {/* Success / canceled banner */}
          {successMsg && (
            <div className={`rounded-xl border px-5 py-4 text-sm font-barlow ${
              searchParams.get("success") === "1"
                ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-600"
                : "border-brand-border bg-brand-surface text-brand-muted"
            }`}>
              {successMsg}
            </div>
          )}

          {/* ── This month usage ──────────────────────────────── */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary">
                {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </p>
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary font-display font-bold text-[8px] uppercase tracking-widest">
                  {CLIENT_PLANS[currentPlan].label}
                </span>
                <span className="text-[10px] font-barlow text-brand-muted">{daysLeft} days left</span>
              </div>
            </div>

            <UsageBar used={thisMonth} included={runsIncluded} />

            <div className="grid grid-cols-3 gap-4 pt-1">
              {[
                { label: "Included",   value: runsIncluded === null ? "∞" : runsIncluded, sub: "per cycle" },
                { label: "Used",       value: thisMonth,  sub: "this month" },
                { label: "Additional", value: over,       sub: over > 0 ? "billed separately" : "none", alert: over > 0 },
              ].map(({ label, value, sub, alert }) => (
                <div key={label} className="text-center">
                  <p className={`font-display font-bold text-2xl leading-none ${alert ? "text-amber-500" : "text-brand-text"}`}>{value}</p>
                  <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mt-1">{label}</p>
                  <p className="text-[10px] font-barlow text-brand-muted mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Plan selector ─────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted">Concept Development Plan</p>

            <div className="grid sm:grid-cols-3 gap-4">
              {PLANS_ORDER.map((planId) => {
                const plan      = CLIENT_PLANS[planId];
                const isCurrent = planId === currentPlan;
                const isSelected = planId === selected;

                return (
                  <button
                    key={planId}
                    type="button"
                    onClick={() => !isCurrent && setSelected(isSelected ? null : planId)}
                    disabled={isCurrent}
                    className={`relative text-left rounded-xl border p-5 flex flex-col gap-4 transition-all duration-200 focus:outline-none ${
                      isCurrent
                        ? "border-brand-primary bg-brand-primary/5 cursor-default"
                        : isSelected
                        ? "border-brand-text bg-brand-surface shadow-[0_0_0_1px_theme(colors.black)]"
                        : "border-brand-border bg-brand-surface hover:border-brand-text/50 cursor-pointer"
                    }`}
                  >
                    {/* Badges */}
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display font-bold uppercase tracking-widest text-brand-text text-sm">{plan.label}</p>
                      <div className="flex gap-1.5">
                        {isCurrent && (
                          <span className="px-2 py-0.5 rounded-full bg-brand-primary/10 border border-brand-primary/30 text-brand-primary font-display font-bold text-[8px] uppercase tracking-widest">
                            Current
                          </span>
                        )}
                        {plan.priorityAccess && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-600 font-display font-bold text-[8px] uppercase tracking-widest">
                            Priority
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="flex items-end gap-1">
                      <span className="font-display font-bold text-3xl text-brand-text leading-none">
                        {plan.priceMonthly === 0 ? "Free" : `$${plan.priceMonthly / 100}`}
                      </span>
                      {plan.priceMonthly > 0 && (
                        <span className="text-xs font-barlow text-brand-muted mb-0.5">/mo</span>
                      )}
                    </div>

                    <p className="text-[11px] font-barlow text-brand-muted leading-snug">{plan.tagline}</p>

                    {/* Features */}
                    <ul className="space-y-1.5 flex-1">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <div className={`w-[3px] h-3 flex-shrink-0 mt-0.5 ${isCurrent || isSelected ? "bg-brand-primary" : "bg-brand-border"}`} />
                          <span className="text-[11px] font-barlow text-brand-muted leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Selection radio */}
                    {!isCurrent && (
                      <div className={`flex items-center gap-2 pt-3 border-t ${isSelected ? "border-brand-text/20" : "border-brand-border"}`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected ? "border-brand-text bg-brand-text" : "border-brand-border"
                        }`}>
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <span className={`text-[10px] font-display uppercase tracking-widest transition-colors ${
                          isSelected ? "text-brand-text" : "text-brand-muted"
                        }`}>
                          {isSelected ? "Selected" : "Select Plan"}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Sticky CTA ────────────────────────────────────── */}
          {selected && selected !== currentPlan && (
            <div className="sticky bottom-6 rounded-xl border border-brand-text/20 bg-brand-surface shadow-lg px-6 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-display font-bold uppercase tracking-wide text-brand-text">
                  Upgrade to {CLIENT_PLANS[selected].label}
                </p>
                <p className="text-xs font-barlow text-brand-muted mt-0.5">
                  {fmt$(CLIENT_PLANS[selected].priceMonthly)}/mo · billed monthly · cancel anytime
                </p>
              </div>
              <button
                type="button"
                onClick={handleUpgrade}
                disabled={upgrading}
                className="flex-shrink-0 px-6 py-3 rounded-lg bg-brand-text text-white font-display font-bold text-xs uppercase tracking-widest hover:opacity-80 disabled:opacity-40 transition-all"
              >
                {upgrading ? "Redirecting…" : "Upgrade Now →"}
              </button>
            </div>
          )}

          {/* ── Generation history ────────────────────────────── */}
          {usage && usage.history.some((h) => h.runs > 0) && (
            <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-brand-border">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Generation History</p>
              </div>
              <div className="divide-y divide-brand-border">
                {usage.history.map((h) => {
                  const inc = runsIncluded ?? 999;
                  const add = Math.max(0, h.runs - inc);
                  return (
                    <div key={h.month} className="px-6 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <p className="text-xs font-barlow text-brand-muted w-20">{h.month}</p>
                        <div className="flex gap-1">
                          {Array.from({ length: Math.max(h.runs, runsIncluded ?? 3) }).map((_, i) => (
                            <div key={i} className={`w-2 h-2 rounded-sm ${
                              i < h.runs
                                ? i < (runsIncluded ?? 999) ? "bg-brand-primary" : "bg-amber-400"
                                : "bg-brand-border"
                            }`} />
                          ))}
                        </div>
                        <span className="text-xs font-barlow text-brand-muted">{h.runs} run{h.runs !== 1 ? "s" : ""}</span>
                      </div>
                      <span className="text-xs font-barlow text-brand-muted">
                        {add > 0 ? "billed separately" : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── All-time stats ─────────────────────────────────── */}
          {usage && (
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "Total Orders",             value: usage.totalOrders },
                { label: "Orders with Concepts",     value: usage.ordersWithConcepts },
                { label: "Concept Images Generated", value: usage.conceptsGenerated },
              ].map(({ label, value }) => (
                <div key={label} className="bg-brand-surface border border-brand-border rounded-xl px-5 py-4 text-center">
                  <p className="font-display font-bold text-2xl text-brand-text leading-none">{value}</p>
                  <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mt-1.5">{label}</p>
                </div>
              ))}
            </div>
          )}

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

export default function ClientBillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}

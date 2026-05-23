"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";

// ── Rate card ─────────────────────────────────────────────────────────────────
// Each "generation run" = 1 order's AI concepts (4 concept images per run).
// Clients get N runs included per billing cycle; additional runs billed per-run.
const INCLUDED_RUNS_PER_MONTH = 3;   // free included monthly runs
const RATE_PER_ADDITIONAL     = 25;  // $25 per additional generation run
const PRIORITY_RATE           = 49;  // $49 per priority (same-day) generation

interface UsageData {
  totalOrders:       number;
  ordersWithConcepts: number;
  thisMonth:         number;
  conceptsGenerated: number;
  history: { month: string; runs: number }[];
}

function UsageBar({ used, included }: { used: number; included: number }) {
  const pct = Math.min((used / Math.max(included, 1)) * 100, 100);
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
        <span className="text-[10px] font-barlow text-brand-muted">{used} of {included} included runs used</span>
        {over && (
          <span className="text-[10px] font-display uppercase tracking-wider text-amber-500 font-bold">
            {used - included} additional
          </span>
        )}
      </div>
    </div>
  );
}

export default function ClientBillingPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [loading, setLoading] = useState(true);
  const [email, setEmail]     = useState("");
  const [usage, setUsage]     = useState<UsageData | null>(null);

  useEffect(() => {
    async function load() {
      await sessionReady();
      const profile = await getProfile();
      if (!profile) { router.replace("/login"); return; }
      // Suppliers have their own billing page; everyone else (including admins
      // testing the client portal) sees the client usage dashboard here.
      if (profile.role === "supplier") { router.replace("/supplier/billing"); return; }
      setEmail(profile.email);

      const res = await fetch("/api/portal/usage");
      if (res.ok) {
        const { usage: u } = await res.json();
        setUsage(u);
      }
      setLoading(false);
    }
    load();
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const thisMonth  = usage?.thisMonth  ?? 0;
  const additional = Math.max(0, thisMonth - INCLUDED_RUNS_PER_MONTH);
  const monthCost  = additional * RATE_PER_ADDITIONAL;

  const now = new Date();
  const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysLeft = Math.ceil((cycleEnd.getTime() - now.getTime()) / 86400000);

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
          <a href="/brief/new"       className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">+ New Order</a>
          <a href="/portfolio"       className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Portfolio</a>
          <a href="/contact"         className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Consultation</a>
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
                AI Usage & Billing
              </span>
            </div>
            <h1
              className="font-display font-bold uppercase tracking-tight text-brand-text leading-none mb-2"
              style={{ fontSize: "clamp(1.8rem, 3vw, 2.6rem)" }}
            >
              Concept Generation
            </h1>
            <p className="text-sm font-barlow text-brand-muted max-w-md leading-relaxed">
              Each order includes AI-generated concept designs. Your included runs reset on the 1st of each month.
            </p>
          </div>

          {/* ── This month ─────────────────────────────────────── */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary">
                {now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </p>
              <span className="text-[10px] font-barlow text-brand-muted">{daysLeft} days left in cycle</span>
            </div>

            <UsageBar used={thisMonth} included={INCLUDED_RUNS_PER_MONTH} />

            <div className="grid grid-cols-3 gap-4 pt-1">
              {[
                { label: "Included",   value: INCLUDED_RUNS_PER_MONTH, sub: "runs/month" },
                { label: "Used",       value: thisMonth,                sub: "this month" },
                { label: "Additional", value: additional,               sub: additional > 0 ? `$${monthCost} due` : "none", alert: additional > 0 },
              ].map(({ label, value, sub, alert }) => (
                <div key={label} className="text-center">
                  <p className={`font-display font-bold text-2xl leading-none ${alert ? "text-amber-500" : "text-brand-text"}`}>
                    {value}
                  </p>
                  <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mt-1">{label}</p>
                  <p className="text-[10px] font-barlow text-brand-muted mt-0.5">{sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Rate card ──────────────────────────────────────── */}
          <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-brand-border">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Rate Card</p>
            </div>
            {[
              {
                label:   "Included Runs",
                rate:    `${INCLUDED_RUNS_PER_MONTH} runs / month`,
                detail:  "4 AI concept designs per run. Resets on the 1st.",
                price:   "Free",
                highlight: false,
              },
              {
                label:   "Additional Runs",
                rate:    "Per run, same cycle",
                detail:  "Charged when you exceed your monthly included runs.",
                price:   `$${RATE_PER_ADDITIONAL}`,
                highlight: false,
              },
              {
                label:   "Priority Generation",
                rate:    "Same-day turnaround",
                detail:  "Moves your order to the front of the AI queue.",
                price:   `$${PRIORITY_RATE}`,
                highlight: false,
              },
            ].map((row, i) => (
              <div key={row.label} className={`px-6 py-4 flex items-center justify-between gap-4 ${i > 0 ? "border-t border-brand-border" : ""}`}>
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-[3px] h-3.5 bg-brand-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-display font-bold uppercase tracking-wide text-brand-text">{row.label}</p>
                    <p className="text-[11px] font-barlow text-brand-muted mt-0.5">{row.rate} · {row.detail}</p>
                  </div>
                </div>
                <span className="text-sm font-display font-bold text-brand-text flex-shrink-0">{row.price}</span>
              </div>
            ))}
          </div>

          {/* ── Monthly history ────────────────────────────────── */}
          {usage && usage.history.some((h) => h.runs > 0) && (
            <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-brand-border">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Generation History</p>
              </div>
              <div className="divide-y divide-brand-border">
                {usage.history.map((h) => {
                  const add = Math.max(0, h.runs - INCLUDED_RUNS_PER_MONTH);
                  return (
                    <div key={h.month} className="px-6 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <p className="text-xs font-barlow text-brand-muted w-24">{h.month}</p>
                        <div className="flex gap-1">
                          {Array.from({ length: Math.max(h.runs, INCLUDED_RUNS_PER_MONTH) }).map((_, i) => (
                            <div
                              key={i}
                              className={`w-2 h-2 rounded-sm ${
                                i < h.runs
                                  ? i < INCLUDED_RUNS_PER_MONTH ? "bg-brand-primary" : "bg-amber-400"
                                  : "bg-brand-border"
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-barlow text-brand-muted">{h.runs} run{h.runs !== 1 ? "s" : ""}</span>
                      </div>
                      <span className="text-xs font-barlow text-brand-muted">
                        {add > 0 ? `+$${add * RATE_PER_ADDITIONAL}` : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── All-time stats ─────────────────────────────────── */}
          {usage && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: "Total Orders",           value: usage.totalOrders },
                { label: "Orders with Concepts",   value: usage.ordersWithConcepts },
                { label: "Concept Images Generated", value: usage.conceptsGenerated },
              ].map(({ label, value }) => (
                <div key={label} className="bg-brand-surface border border-brand-border rounded-xl px-5 py-4 text-center">
                  <p className="font-display font-bold text-2xl text-brand-text leading-none">{value}</p>
                  <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mt-1.5">{label}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Need more / questions ──────────────────────────── */}
          <div className="border-t border-brand-border pt-8 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-display font-bold uppercase tracking-wide text-brand-text">
                Need a higher monthly limit?
              </p>
              <p className="text-xs font-barlow text-brand-muted mt-1 leading-relaxed">
                Programs with multiple active orders can request an increased included allowance.
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

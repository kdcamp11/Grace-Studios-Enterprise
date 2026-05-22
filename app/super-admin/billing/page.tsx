"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSuperAdmin } from "@/lib/super-admin";
import type { SubscriptionStatus, TenantPlan } from "@/lib/supabase/types";

interface SubRow {
  id: string;
  tenant_id: string;
  plan: TenantPlan;
  status: SubscriptionStatus;
  mrr: number;
  current_period_end: string | null;
  trial_end: string | null;
  stripe_subscription_id: string | null;
  tenants: { name: string; slug: string; brand_primary: string } | null;
}

interface Summary {
  totalMrr: number;
  activeSubs: number;
  trialingSubs: number;
  pastDueSubs: number;
  fees30d: number;
}

interface TenantRow {
  id: string;
  name: string;
  plan: TenantPlan;
  active: boolean;
}

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  active:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  trialing: "bg-blue-50 text-blue-700 border-blue-200",
  past_due: "bg-amber-50 text-amber-700 border-amber-200",
  canceled: "bg-gray-100 text-gray-500 border-gray-200",
  paused:   "bg-gray-100 text-gray-500 border-gray-200",
};

function fmt$(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function SuperAdminBillingPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [summary, setSummary]     = useState<Summary | null>(null);
  const [subs, setSubs]           = useState<SubRow[]>([]);
  const [tenants, setTenants]     = useState<TenantRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState<SubscriptionStatus | "all">("all");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user || !isSuperAdmin(user.email)) { router.replace("/portal"); return; }
      fetch("/api/super-admin/billing")
        .then((r) => r.json())
        .then(({ summary, subscriptions, tenants }) => {
          setSummary(summary);
          setSubs(subscriptions ?? []);
          setTenants(tenants ?? []);
          setLoading(false);
        });
    });
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--brand-bg)" }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--brand-primary)" }} />
      </div>
    );
  }

  // Tenants with no subscription row
  const subsWithTenant = new Set(subs.map((s) => s.tenant_id));
  const unsubscribed = tenants.filter((t) => !subsWithTenant.has(t.id) && t.plan === "starter");

  const filtered = filter === "all" ? subs : subs.filter((s) => s.status === filter);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
      <header className="border-b px-6 py-4 flex items-center gap-4" style={{ borderColor: "var(--brand-border)" }}>
        <button onClick={() => router.push("/super-admin")} className="text-sm font-display uppercase tracking-wider hover:opacity-60 transition-opacity" style={{ color: "var(--brand-muted)" }}>
          ← Back
        </button>
        <div>
          <p className="text-[10px] font-display uppercase tracking-[0.25em]" style={{ color: "var(--brand-muted)" }}>Super Admin</p>
          <h1 className="font-display text-xl font-bold uppercase tracking-wide">Billing Overview</h1>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-5xl space-y-6">

          {/* Summary tiles */}
          {summary && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {[
                { label: "MRR",         value: fmt$(summary.totalMrr),       highlight: true },
                { label: "Active",      value: summary.activeSubs.toString() },
                { label: "Trialing",    value: summary.trialingSubs.toString() },
                { label: "Past Due",    value: summary.pastDueSubs.toString(), warn: summary.pastDueSubs > 0 },
                { label: "Fees (30d)",  value: fmt$(summary.fees30d) },
              ].map(({ label, value, highlight, warn }) => (
                <div
                  key={label}
                  className="rounded-xl border px-4 py-3 text-center"
                  style={{ borderColor: warn ? "#fbbf24" : "var(--brand-border)", background: "var(--brand-surface)" }}
                >
                  <p className="text-[10px] font-display uppercase tracking-widest mb-1" style={{ color: "var(--brand-muted)" }}>{label}</p>
                  <p className={`font-display font-bold text-base ${warn ? "text-amber-600" : ""}`} style={highlight ? { color: "var(--brand-primary)" } : {}}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-2 flex-wrap">
            {(["all", "active", "trialing", "past_due", "canceled"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-display uppercase tracking-wider border transition-colors ${
                  filter === f ? "bg-black text-white border-black" : "border-gray-200 text-gray-500 hover:border-gray-400"
                }`}
              >
                {f.replace("_", " ")}
              </button>
            ))}
          </div>

          {/* Subscriptions table */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--brand-border)" }}>
            <table className="w-full text-sm font-barlow">
              <thead>
                <tr className="border-b" style={{ background: "var(--brand-surface)", borderColor: "var(--brand-border)" }}>
                  {["Tenant", "Plan", "Status", "MRR", "Renews / Trial ends", "Stripe ID"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider" style={{ color: "var(--brand-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sub) => (
                  <tr key={sub.id} className="border-b last:border-b-0" style={{ borderColor: "var(--brand-border)" }}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        {sub.tenants && (
                          <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ background: sub.tenants.brand_primary }} />
                        )}
                        <div>
                          <p className="font-medium">{sub.tenants?.name ?? sub.tenant_id}</p>
                          {sub.tenants?.slug && (
                            <p className="text-xs font-mono" style={{ color: "var(--brand-muted)" }}>{sub.tenants.slug}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 font-display uppercase text-xs tracking-wider">{sub.plan}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider border ${STATUS_STYLES[sub.status] ?? ""}`}>
                        {sub.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-display font-bold">{fmt$(sub.mrr)}</td>
                    <td className="px-5 py-4 text-xs" style={{ color: "var(--brand-muted)" }}>
                      {sub.status === "trialing"
                        ? fmtDate(sub.trial_end ?? null)
                        : fmtDate(sub.current_period_end ?? null)}
                    </td>
                    <td className="px-5 py-4">
                      {sub.stripe_subscription_id ? (
                        <span className="font-mono text-xs" style={{ color: "var(--brand-muted)" }}>
                          {sub.stripe_subscription_id.slice(0, 20)}…
                        </span>
                      ) : (
                        <span style={{ color: "var(--brand-muted)" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-sm" style={{ color: "var(--brand-muted)" }}>
                      No subscriptions match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tenants on free / no subscription */}
          {unsubscribed.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display font-bold uppercase tracking-widest text-xs" style={{ color: "var(--brand-muted)" }}>
                Free / No Subscription ({unsubscribed.length})
              </h2>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--brand-border)" }}>
                <table className="w-full text-sm font-barlow">
                  <tbody>
                    {unsubscribed.map((t) => (
                      <tr key={t.id} className="border-b last:border-b-0" style={{ borderColor: "var(--brand-border)" }}>
                        <td className="px-5 py-3">
                          <p className="font-medium">{t.name}</p>
                        </td>
                        <td className="px-5 py-3 text-xs font-display uppercase tracking-wider" style={{ color: "var(--brand-muted)" }}>starter</td>
                        <td className="px-5 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-display uppercase tracking-wider border ${t.active ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                            {t.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

        </div>
      </main>
    </div>
  );
}

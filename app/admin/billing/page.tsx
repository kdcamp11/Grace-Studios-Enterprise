"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Subscription, TenantPlan } from "@/lib/supabase/types";
import type { PlanConfig } from "@/lib/payments/plans";
import { PLANS } from "@/lib/payments/plans";

type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "paused";

interface BillingData {
  subscription: Subscription | null;
  plan: TenantPlan;
  planConfig: PlanConfig;
  platform_fee_percent: number;
}

const STATUS_STYLES: Record<SubscriptionStatus, string> = {
  active:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  trialing: "bg-blue-50 text-blue-700 border-blue-200",
  past_due: "bg-amber-50 text-amber-700 border-amber-200",
  canceled: "bg-gray-100 text-gray-500 border-gray-200",
  paused:   "bg-gray-100 text-gray-500 border-gray-200",
};

function fmt$(cents: number) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0 });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(iso: string | null) {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

interface ConnectStatus {
  connected: boolean;
  stale?: boolean;
  account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  platform_fee_percent?: number;
}

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [data, setData]             = useState<BillingData | null>(null);
  const [connect, setConnect]       = useState<ConnectStatus | null>(null);
  const [loading, setLoading]       = useState(true);
  const [upgrading, setUpgrading]   = useState<TenantPlan | null>(null);
  const [portalLoading, setPortalLoading]   = useState(false);
  const [onboarding, setOnboarding]         = useState(false);
  const [loginLoading, setLoginLoading]     = useState(false);
  const [connectRefreshing, setConnectRefreshing] = useState(false);
  const [error, setError]           = useState("");

  const connectParam = searchParams.get("connect");
  const successMsg = searchParams.get("success") === "1"
    ? "Subscription activated! Your plan has been updated."
    : searchParams.get("canceled") === "1"
    ? "Checkout canceled — no changes were made."
    : connectParam === "success"
    ? "Stripe account connected! Your payout settings are ready."
    : null;

  useEffect(() => {
    Promise.all([
      fetch("/api/billing/subscription").then((r) => r.json()),
      fetch("/api/billing/connect/status").then((r) => r.json()),
    ]).then(([subData, connectData]) => {
      setData(subData);
      setConnect(connectData);
      setLoading(false);
    }).catch(() => { setError("Failed to load billing info."); setLoading(false); });
  }, []);

  async function upgrade(plan: TenantPlan) {
    setUpgrading(plan); setError("");
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Something went wrong"); setUpgrading(null); return; }
    window.location.href = d.url;
  }

  async function openPortal() {
    setPortalLoading(true); setError("");
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Something went wrong"); setPortalLoading(false); return; }
    window.location.href = d.url;
  }

  async function startOnboarding() {
    setOnboarding(true); setError("");
    const res = await fetch("/api/billing/connect/onboard", { method: "POST" });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Something went wrong"); setOnboarding(false); return; }
    window.location.href = d.url;
  }

  async function openStripeDashboard() {
    setLoginLoading(true); setError("");
    const res = await fetch("/api/billing/connect/login", { method: "POST" });
    const d = await res.json();
    if (!res.ok) { setError(d.error ?? "Something went wrong"); setLoginLoading(false); return; }
    window.open(d.url, "_blank");
    setLoginLoading(false);
  }

  async function refreshConnectStatus() {
    setConnectRefreshing(true);
    const d = await fetch("/api/billing/connect/status").then((r) => r.json());
    setConnect(d);
    setConnectRefreshing(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--brand-bg)" }}>
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--brand-primary)" }} />
      </div>
    );
  }

  const sub     = data?.subscription ?? null;
  const current = data?.plan ?? "starter";
  const status  = (sub?.status ?? (current === "starter" ? "active" : "active")) as SubscriptionStatus;
  const trialDays = sub?.status === "trialing" ? daysUntil(sub.trial_end ?? null) : null;

  const label = "text-[10px] font-display uppercase tracking-widest";
  const card  = "rounded-xl border p-5 space-y-1";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
      <header className="border-b px-6 py-4" style={{ borderColor: "var(--brand-border)" }}>
        <p className="text-[10px] font-display uppercase tracking-[0.25em]" style={{ color: "var(--brand-muted)" }}>Admin</p>
        <h1 className="font-display text-xl font-bold uppercase tracking-wide">Billing & Plan</h1>
      </header>

      <main className="flex-1 px-4 py-8 flex justify-center">
        <div className="w-full max-w-3xl space-y-8">

          {successMsg && (
            <div className={`rounded-xl border px-4 py-3 text-sm font-barlow ${
              searchParams.get("success") ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"
            }`}>
              {successMsg}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* Current plan */}
          <section className="space-y-4">
            <h2 className="font-display font-bold uppercase tracking-widest text-xs border-b pb-2" style={{ borderColor: "var(--brand-border)", color: "var(--brand-muted)" }}>Current Plan</h2>
            <div className={card} style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <p className="font-display font-bold text-lg uppercase tracking-wide">{data?.planConfig.label}</p>
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider border ${STATUS_STYLES[status] ?? ""}`}>
                      {status.replace("_", " ")}
                    </span>
                  </div>
                  {current !== "starter" && (
                    <p className="text-sm font-barlow" style={{ color: "var(--brand-muted)" }}>
                      {fmt$(data?.planConfig.priceMonthly ?? 0)} / month
                    </p>
                  )}
                  {trialDays !== null && (
                    <p className="text-sm font-barlow mt-1" style={{ color: "var(--brand-primary)" }}>
                      {trialDays} day{trialDays !== 1 ? "s" : ""} left in trial
                    </p>
                  )}
                </div>
                {sub?.stripe_subscription_id && (
                  <button
                    onClick={openPortal}
                    disabled={portalLoading}
                    className="flex-shrink-0 px-4 py-2 rounded-lg border text-xs font-display font-bold uppercase tracking-widest transition-colors hover:opacity-80 disabled:opacity-40"
                    style={{ borderColor: "var(--brand-border)" }}
                  >
                    {portalLoading ? "Loading…" : "Manage Billing"}
                  </button>
                )}
              </div>

              {sub && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t mt-3" style={{ borderColor: "var(--brand-border)" }}>
                  {[
                    { label: "MRR",          value: fmt$(sub.mrr) },
                    { label: "Period Start",  value: fmtDate(sub.current_period_start ?? null) },
                    { label: "Period End",    value: fmtDate(sub.current_period_end ?? null) },
                    { label: "Platform Fee",  value: data?.platform_fee_percent ? data.platform_fee_percent + "%" : "—" },
                  ].map(({ label: l, value }) => (
                    <div key={l}>
                      <p className={label} style={{ color: "var(--brand-muted)" }}>{l}</p>
                      <p className="font-display font-bold text-sm mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Features on current plan */}
          <section className="space-y-4">
            <h2 className="font-display font-bold uppercase tracking-widest text-xs border-b pb-2" style={{ borderColor: "var(--brand-border)", color: "var(--brand-muted)" }}>Included Features</h2>
            <ul className="space-y-2">
              {(data?.planConfig.features ?? []).map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm font-barlow">
                  <span className="text-emerald-500 flex-shrink-0">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </section>

          {/* Plan comparison / upgrade */}
          <section className="space-y-4">
            <h2 className="font-display font-bold uppercase tracking-widest text-xs border-b pb-2" style={{ borderColor: "var(--brand-border)", color: "var(--brand-muted)" }}>
              {current === "enterprise" ? "All Plans" : "Upgrade"}
            </h2>
            <div className="grid sm:grid-cols-3 gap-4">
              {(Object.values(PLANS) as PlanConfig[]).map((plan) => {
                const isCurrent = plan.id === current;
                const isDowngrade = (
                  (current === "enterprise" && plan.id !== "enterprise") ||
                  (current === "pro" && plan.id === "starter")
                );
                return (
                  <div
                    key={plan.id}
                    className={`rounded-xl border p-5 flex flex-col gap-3 transition-colors ${
                      isCurrent ? "ring-2" : ""
                    }`}
                    style={{
                      borderColor: isCurrent ? "var(--brand-primary)" : "var(--brand-border)",
                      background: "var(--brand-surface)",
                      ...(isCurrent ? { "--tw-ring-color": "var(--brand-primary)" } as React.CSSProperties : {}),
                    }}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-display font-bold uppercase tracking-wider">{plan.label}</p>
                        {isCurrent && (
                          <span className="text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ background: "var(--brand-primary)", color: "#fff" }}>
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-xl font-display font-bold">
                        {plan.priceMonthly === 0 ? "Free" : fmt$(plan.priceMonthly)}
                        {plan.priceMonthly > 0 && <span className="text-xs font-barlow font-normal" style={{ color: "var(--brand-muted)" }}>/mo</span>}
                      </p>
                    </div>
                    <ul className="flex-1 space-y-1.5">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-xs font-barlow">
                          <span className="text-emerald-500 flex-shrink-0 mt-0.5">✓</span>
                          {f}
                        </li>
                      ))}
                    </ul>
                    {!isCurrent && !isDowngrade && plan.stripePriceId && (
                      <button
                        onClick={() => upgrade(plan.id)}
                        disabled={upgrading === plan.id}
                        className="w-full py-2.5 rounded-lg text-xs font-display font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ background: "var(--brand-primary)" }}
                      >
                        {upgrading === plan.id ? "Redirecting…" : `Upgrade to ${plan.label}`}
                      </button>
                    )}
                    {!isCurrent && isDowngrade && (
                      <p className="text-xs text-center font-barlow" style={{ color: "var(--brand-muted)" }}>
                        Manage via billing portal
                      </p>
                    )}
                    {!isCurrent && !isDowngrade && !plan.stripePriceId && plan.id !== "starter" && (
                      <p className="text-xs text-center font-barlow" style={{ color: "var(--brand-muted)" }}>
                        Contact us to upgrade
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Stripe Connect ── */}
          <section className="space-y-4">
            <h2 className="font-display font-bold uppercase tracking-widest text-xs border-b pb-2" style={{ borderColor: "var(--brand-border)", color: "var(--brand-muted)" }}>
              Stripe Payouts
            </h2>

            {connect?.connected && !connect.stale ? (
              <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-display font-bold uppercase tracking-wide">Connected Account</p>
                      {connect.charges_enabled && connect.payouts_enabled ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider border bg-emerald-50 text-emerald-700 border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider border bg-amber-50 text-amber-700 border-amber-200">
                          Setup Incomplete
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs" style={{ color: "var(--brand-muted)" }}>{connect.account_id}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={refreshConnectStatus}
                      disabled={connectRefreshing}
                      className="px-3 py-2 rounded-lg border text-xs font-display font-bold uppercase tracking-widest transition-colors hover:opacity-70 disabled:opacity-40"
                      style={{ borderColor: "var(--brand-border)" }}
                    >
                      {connectRefreshing ? "…" : "Refresh"}
                    </button>
                    {connect.charges_enabled ? (
                      <button
                        onClick={openStripeDashboard}
                        disabled={loginLoading}
                        className="px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ background: "var(--brand-primary)" }}
                      >
                        {loginLoading ? "Loading…" : "Stripe Dashboard ↗"}
                      </button>
                    ) : (
                      <button
                        onClick={startOnboarding}
                        disabled={onboarding}
                        className="px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                        style={{ background: "var(--brand-primary)" }}
                      >
                        {onboarding ? "Redirecting…" : "Complete Setup →"}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-3 border-t" style={{ borderColor: "var(--brand-border)" }}>
                  {[
                    { label: "Charges",   enabled: connect.charges_enabled },
                    { label: "Payouts",   enabled: connect.payouts_enabled },
                    { label: "Details",   enabled: connect.details_submitted },
                  ].map(({ label: l, enabled }) => (
                    <div key={l} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${enabled ? "bg-emerald-500" : "bg-amber-400"}`} />
                      <div>
                        <p className="text-[10px] font-display uppercase tracking-widest" style={{ color: "var(--brand-muted)" }}>{l}</p>
                        <p className="text-xs font-barlow" style={{ color: enabled ? "var(--brand-text)" : "var(--brand-muted)" }}>
                          {enabled ? "Enabled" : "Pending"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {connect.platform_fee_percent != null && connect.platform_fee_percent > 0 && (
                  <p className="text-xs font-barlow pt-1" style={{ color: "var(--brand-muted)" }}>
                    Platform retains <strong>{connect.platform_fee_percent}%</strong> of each order payment. The remainder is transferred to your Stripe account automatically.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border p-6" style={{ borderColor: "var(--brand-border)", background: "var(--brand-surface)" }}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 space-y-2">
                    <p className="font-display font-bold uppercase tracking-wide">Connect Your Stripe Account</p>
                    <p className="text-sm font-barlow leading-relaxed" style={{ color: "var(--brand-muted)" }}>
                      Link a Stripe account to receive automatic payouts when your clients pay invoices. The platform fee is deducted and the remainder is transferred to you instantly.
                    </p>
                    {connect?.stale && (
                      <p className="text-xs font-barlow text-amber-600">Previous account may have been removed — connect a new one.</p>
                    )}
                  </div>
                  <button
                    onClick={startOnboarding}
                    disabled={onboarding}
                    className="flex-shrink-0 px-5 py-2.5 rounded-lg text-xs font-display font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: "var(--brand-primary)" }}
                  >
                    {onboarding ? "Redirecting…" : "Connect Stripe →"}
                  </button>
                </div>
              </div>
            )}
          </section>

        </div>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OrgLogo from "@/components/OrgLogo";
import { getClientEstimate, fmtRange, type ClientEstimate } from "@/lib/pricing/client-estimates";

// ─── Pricing env vars ─────────────────────────────────────────────────────────
// Set these in Vercel environment settings to update pricing without a deploy.
// NEXT_PUBLIC_PRODUCTION_DEPOSIT  — 50% deposit shown at checkout (e.g. "$850")
// NEXT_PUBLIC_PRODUCTION_BALANCE  — remaining 50% on delivery  (e.g. "$850")
// NEXT_PUBLIC_PRODUCTION_TOTAL    — full order total            (e.g. "$1,700")
// NEXT_PUBLIC_DESIGN_FILE_PRICE   — design-file-only price      (e.g. "Included")

const PRODUCTION_DEPOSIT = process.env.NEXT_PUBLIC_PRODUCTION_DEPOSIT ?? "TBD";
const PRODUCTION_BALANCE = process.env.NEXT_PUBLIC_PRODUCTION_BALANCE ?? "TBD";
const PRODUCTION_TOTAL   = process.env.NEXT_PUBLIC_PRODUCTION_TOTAL   ?? "Contact us for a quote";
const DESIGN_FILE_PRICE  = process.env.NEXT_PUBLIC_DESIGN_FILE_PRICE  ?? "Included";

// ─── Timeline ─────────────────────────────────────────────────────────────────

const TIMELINE = [
  {
    phase: "01",
    label: "Design Mockup",
    days:  "Up to 3 days",
    desc:  "Final production files are prepared and sent to the manufacturing team. Colors, graphics, and roster details locked.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
  },
  {
    phase: "02",
    label: "First Piece Sample",
    days:  "Up to 2 days",
    desc:  "A single sample garment is produced for your review. You approve before bulk production begins.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    phase: "03",
    label: "Bulk Production",
    days:  "Up to 10 days",
    desc:  "Full order manufactured to spec. Every piece goes through quality control before shipping.",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

function fmt(cents: number | null | undefined): string {
  if (!cents) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100);
}

interface OrderInfo {
  order_number:            string;
  team_name:               string;
  garment_type:            string;
  design_system:           string;
  preview_url:             string | null;
  production_choice:       string | null;
  production_total_cents:   number | null;
  production_deposit_cents: number | null;
  production_balance_cents: number | null;
  production_quantity:      number | null;
}

export default function ProductionChoicePage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router       = useRouter();
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;

  const [info, setInfo]           = useState<OrderInfo | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<"design_file" | "production" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const [estimatedQty, setEstimatedQty] = useState("");

  const hasPricing = !!info?.production_total_cents;

  const qtyNum  = parseInt(estimatedQty, 10);
  const estimate: ClientEstimate | null = !hasPricing && estimatedQty && qtyNum >= 1
    ? getClientEstimate(qtyNum)
    : null;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const res = await fetch(`/api/orders/info?orderId=${order_id}`);
      if (!res.ok) { setLoading(false); return; }

      const data = await res.json() as OrderInfo & { production_choice?: string | null };

      // Already chose — skip to tracker
      if (data.production_choice) {
        router.replace(`/orders/${order_id}/tracker`);
        return;
      }

      setInfo(data);
      setLoading(false);
    }
    load();
  }, [order_id, supabase, router]);

  async function handleConfirm() {
    if (!selected) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/api/orders/choose-production", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ order_id, choice: selected }),
      });
      if (!res.ok) throw new Error("Something went wrong. Please try again.");
      router.push(`/orders/${order_id}/tracker?production=${selected}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
          Home
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-8">

          {/* Heading */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-brand-primary" />
              <span className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary">Design Approved</span>
            </div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text">
              What Would You Like to Do Next?
            </h1>
            {info && (
              <p className="text-sm text-brand-muted font-barlow">
                {info.team_name} · {info.garment_type} · {info.order_number}
              </p>
            )}
          </div>

          {/* ── Timeline ──────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-brand-border bg-brand-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-brand-border">
              <p className="text-[9px] font-display uppercase tracking-[0.28em] text-brand-muted">
                Production Timeline: What to Expect
              </p>
            </div>
            <div className="divide-y divide-brand-border">
              {TIMELINE.map((step) => (
                <div key={step.phase} className="flex items-start gap-4 px-5 py-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-surface border border-brand-border flex items-center justify-center text-brand-primary mt-0.5">
                    {step.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <p className="text-sm font-display font-bold uppercase tracking-wide text-brand-text">
                        {step.label}
                      </p>
                      <span className="text-[10px] font-display uppercase tracking-widest text-brand-primary flex-shrink-0">
                        {step.days}
                      </span>
                    </div>
                    <p className="text-xs text-brand-muted font-barlow mt-1 leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-brand-border bg-brand-surface flex items-center justify-between">
              <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted">
                Total estimated time
              </span>
              <span className="text-[10px] font-display font-bold uppercase tracking-widest text-brand-primary">
                Up to 15 business days
              </span>
            </div>
          </div>

          {/* ── Choice cards ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-brand-muted">
              Choose Your Path
            </p>

            {/* Option 1 — Design Package */}
            <button
              type="button"
              onClick={() => setSelected("design_file")}
              className={`w-full text-left rounded-2xl border p-5 transition-all duration-200
                ${selected === "design_file"
                  ? "border-brand-primary bg-brand-surface shadow-[0_0_0_1px_rgba(212,175,55,0.3)]"
                  : "border-brand-border bg-brand-surface hover:border-brand-primary/40 hover:bg-brand-surface"
                }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all
                      ${selected === "design_file" ? "border-brand-primary bg-brand-primary" : "border-brand-border"}`}>
                      {selected === "design_file" && (
                        <svg className="w-full h-full p-0.5" viewBox="0 0 8 8" fill="white">
                          <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      )}
                    </div>
                    <p className="font-display font-bold uppercase tracking-wide text-sm text-brand-text">
                      Design Package
                    </p>
                  </div>
                  <p className="text-xs text-brand-muted font-barlow leading-relaxed ml-6">
                    Receive all high-resolution concept renders and design files — ready for your production vendor or internal use.
                  </p>
                  <ul className="mt-3 ml-6 space-y-1">
                    {[
                      "All 4 high-resolution concept renders",
                      "Design specification and colorway sheet",
                      "Hex and Pantone color references",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[11px] text-brand-muted font-barlow">
                        <span className="text-brand-primary text-[8px]">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-lg font-display font-bold text-brand-primary">{DESIGN_FILE_PRICE}</p>
                </div>
              </div>
            </button>

            {/* Option 2 — Managed Production */}
            <div
              className={`rounded-2xl border transition-all duration-200 bg-brand-surface
                ${selected === "production"
                  ? "border-brand-primary shadow-[0_0_0_1px_rgba(212,175,55,0.3)]"
                  : "border-brand-border hover:border-brand-primary/40"
                }`}
            >
              {/* Card selection button */}
              <button
                type="button"
                onClick={() => setSelected("production")}
                className="w-full text-left p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all
                        ${selected === "production" ? "border-brand-primary bg-brand-primary" : "border-brand-border"}`}>
                        {selected === "production" && (
                          <svg className="w-full h-full p-0.5" viewBox="0 0 8 8" fill="white">
                            <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                          </svg>
                        )}
                      </div>
                      <p className="font-display font-bold uppercase tracking-wide text-sm text-brand-text">
                        Managed Production
                      </p>
                      <span className="text-[8px] font-display font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-brand-primary/20 text-brand-primary border border-brand-primary/30">
                        Recommended
                      </span>
                    </div>
                    <p className="text-xs text-brand-muted font-barlow leading-relaxed ml-6">
                      Grace Studios manages production end to end — from first piece sample through bulk fulfillment, quality inspection, and delivery.
                    </p>
                    <ul className="mt-3 ml-6 space-y-1">
                      {[
                        "Everything in Design Package",
                        "First piece sample for your review and approval",
                        "Managed bulk production to your full roster",
                        "Quality control and fulfillment oversight",
                        "Shipping coordination and delivery tracking",
                      ].map((item) => (
                        <li key={item} className="flex items-center gap-2 text-[11px] text-brand-muted font-barlow">
                          <span className="text-brand-primary text-[8px]">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex-shrink-0 text-right space-y-0.5 min-w-[90px]">
                    {hasPricing ? (
                      <>
                        <p className="text-lg font-display font-bold text-brand-primary">{fmt(info!.production_total_cents)}</p>
                        <p className="text-[9px] text-brand-muted font-barlow">Split in two payments</p>
                      </>
                    ) : estimate ? (
                      <>
                        <p className="text-base font-display font-bold text-brand-primary leading-tight">
                          {fmtRange(estimate.totalRange.min, estimate.totalRange.max)}
                        </p>
                        <p className="text-[9px] text-amber-400/80 font-barlow mt-0.5">Estimated total</p>
                      </>
                    ) : (
                      <p className="text-[10px] text-brand-muted font-barlow text-right leading-snug">Enter quantity for estimate</p>
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded panel — shown when Managed Production is selected */}
              {selected === "production" && (
                <div className="px-5 pb-5 -mt-1">
                  <div className="ml-6 space-y-3">
                    {hasPricing ? (
                      /* Admin has confirmed exact pricing — show it */
                      <div className="rounded-xl border border-brand-border bg-brand-bg overflow-hidden">
                        {info!.production_quantity && (
                          <div className="px-4 py-3 border-b border-brand-border bg-brand-surface flex items-center justify-between">
                            <div>
                              <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted">Order Summary</p>
                              <p className="text-sm font-barlow text-brand-text mt-0.5">
                                {info!.production_quantity} uniform {info!.production_quantity === 1 ? "set" : "sets"}
                              </p>
                            </div>
                            {info!.production_total_cents && info!.production_quantity && (
                              <p className="text-xs font-barlow text-brand-muted">
                                {fmt(Math.round(info!.production_total_cents / info!.production_quantity))} / set
                              </p>
                            )}
                          </div>
                        )}
                        <div className="px-4 py-3 flex items-center justify-between border-b border-brand-border">
                          <div>
                            <p className="text-xs font-display font-bold uppercase tracking-wider text-brand-text">Deposit Due</p>
                            <p className="text-[10px] text-brand-muted font-barlow mt-0.5">Required to begin production · 50% of total</p>
                          </div>
                          <p className="text-base font-display font-bold text-brand-primary">{fmt(info!.production_deposit_cents)}</p>
                        </div>
                        <div className="px-4 py-3 flex items-center justify-between opacity-60">
                          <div>
                            <p className="text-xs font-display font-bold uppercase tracking-wider text-brand-text">Remaining Balance</p>
                            <p className="text-[10px] text-brand-muted font-barlow mt-0.5">Due before your order ships · 50% of total</p>
                          </div>
                          <p className="text-base font-display font-bold text-brand-muted">{fmt(info!.production_balance_cents)}</p>
                        </div>
                      </div>
                    ) : (
                      /* No confirmed pricing — show live quantity estimator */
                      <div className="rounded-xl border border-brand-border bg-brand-bg overflow-hidden">
                        {/* Quantity input */}
                        <div className="px-4 py-4 border-b border-brand-border">
                          <label className="block text-[10px] font-display uppercase tracking-widest text-brand-muted mb-2">
                            Estimated Quantity
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={estimatedQty}
                              onChange={(e) => setEstimatedQty(e.target.value)}
                              placeholder="e.g. 20"
                              className="w-28 bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors text-center"
                            />
                            <span className="text-xs font-barlow text-brand-muted">uniform sets</span>
                          </div>
                        </div>

                        {/* Live estimate — shown when quantity is valid */}
                        {estimate ? (
                          <div className="px-4 py-4 space-y-3">
                            <p className="text-[9px] font-display uppercase tracking-[0.22em] text-brand-muted">
                              Estimated Project Summary
                            </p>

                            {/* Per-set range */}
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-barlow font-medium text-brand-text">Estimated Price Range</p>
                                <p className="text-[10px] font-barlow text-brand-muted mt-0.5">Per uniform set</p>
                              </div>
                              <p className="text-sm font-display font-bold text-brand-primary text-right">
                                {fmtRange(estimate.priceRange.minCents, estimate.priceRange.maxCents, true)}
                              </p>
                            </div>

                            {/* Total range */}
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-barlow font-medium text-brand-text">Estimated Project Total</p>
                                <p className="text-[10px] font-barlow text-brand-muted mt-0.5">{estimate.quantity} sets</p>
                              </div>
                              <p className="text-sm font-display font-bold text-brand-primary text-right">
                                {fmtRange(estimate.totalRange.min, estimate.totalRange.max)}
                              </p>
                            </div>

                            {/* Deposit range */}
                            <div className="flex items-start justify-between gap-3 opacity-75">
                              <div>
                                <p className="text-xs font-barlow font-medium text-brand-text">Estimated Deposit</p>
                                <p className="text-[10px] font-barlow text-brand-muted mt-0.5">50% due to begin production</p>
                              </div>
                              <p className="text-sm font-display font-bold text-brand-muted text-right">
                                {fmtRange(estimate.depositRange.min, estimate.depositRange.max)}
                              </p>
                            </div>

                            {/* Disclaimer */}
                            <div className="pt-2 border-t border-brand-border space-y-1">
                              <p className="text-[9px] font-barlow text-brand-muted/70 leading-relaxed">
                                Estimated pricing based on current order details. Final pricing confirmed before invoice generation. Pricing may vary based on customization, production requirements, and final quantities.
                              </p>
                            </div>
                          </div>
                        ) : (
                          /* No quantity entered yet */
                          <div className="px-4 py-4">
                            <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                              Enter your estimated order quantity above to see projected pricing for your production run.
                            </p>
                            <div className="flex items-center gap-3 mt-3">
                              <div className="h-px flex-1 bg-brand-border" />
                              <p className="text-[9px] font-display uppercase tracking-wider text-brand-muted">50 / 50 split payment</p>
                              <div className="h-px flex-1 bg-brand-border" />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Confirm CTA ───────────────────────────────────────────────── */}
          {selected && (
            <div className="space-y-3">
              {error && (
                <p className="text-xs text-red-400 font-barlow bg-red-950/30 border border-red-800/40 rounded-xl px-4 py-3">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirming}
                className="w-full py-4 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em]
                  bg-brand-primary text-white hover:bg-brand-secondary transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  shadow-[0_4px_24px_rgba(212,175,55,0.2)] hover:shadow-[0_4px_32px_rgba(212,175,55,0.35)]"
              >
                {confirming
                  ? "Processing…"
                  : selected === "production"
                  ? "Confirm Managed Production →"
                  : "Get My Design Files →"
                }
              </button>
              <p className="text-[10px] text-brand-muted font-barlow text-center leading-relaxed">
                {selected === "production"
                  ? "Your Grace Studios production team will begin your order within 1 business day."
                  : "Your design files will be available in your order portal within 24 hours."
                }
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

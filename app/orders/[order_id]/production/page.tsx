"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GraceLogo from "@/components/GraceLogo";

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

interface OrderInfo {
  order_number: string;
  team_name: string;
  garment_type: string;
  design_system: string;
  preview_url: string | null;
  production_choice: string | null;
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
      if (!res.ok) throw new Error("Something went wrong — please try again.");
      router.push(`/orders/${order_id}/tracker?production=${selected}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setConfirming(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gs-dark flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      <header className="border-b border-gs-border px-6 py-4 flex items-center justify-between">
        <GraceLogo className="h-7" href="/portal" />
        <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">
          Home
        </a>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-2xl space-y-8">

          {/* Heading */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-gs-gold" />
              <span className="text-[10px] font-display uppercase tracking-[0.3em] text-gs-gold">Design Approved</span>
            </div>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-gs-white">
              What Would You Like to Do Next?
            </h1>
            {info && (
              <p className="text-sm text-gs-muted font-barlow">
                {info.team_name} · {info.garment_type} · {info.order_number}
              </p>
            )}
          </div>

          {/* ── Timeline ──────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-gs-border bg-gs-dark-3 overflow-hidden">
            <div className="px-5 py-3 border-b border-gs-border">
              <p className="text-[9px] font-display uppercase tracking-[0.28em] text-gs-muted">
                Production Timeline — What to Expect
              </p>
            </div>
            <div className="divide-y divide-gs-border">
              {TIMELINE.map((step) => (
                <div key={step.phase} className="flex items-start gap-4 px-5 py-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gs-dark-2 border border-gs-border flex items-center justify-center text-gs-gold mt-0.5">
                    {step.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                      <p className="text-sm font-display font-bold uppercase tracking-wide text-gs-white">
                        {step.label}
                      </p>
                      <span className="text-[10px] font-display uppercase tracking-widest text-gs-gold flex-shrink-0">
                        {step.days}
                      </span>
                    </div>
                    <p className="text-xs text-gs-muted font-barlow mt-1 leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-gs-border bg-gs-dark-2 flex items-center justify-between">
              <span className="text-[10px] font-display uppercase tracking-wider text-gs-muted">
                Total estimated time
              </span>
              <span className="text-[10px] font-display font-bold uppercase tracking-widest text-gs-gold">
                Up to 15 business days
              </span>
            </div>
          </div>

          {/* ── Choice cards ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <p className="text-[10px] font-display uppercase tracking-[0.28em] text-gs-muted">
              Choose Your Path
            </p>

            {/* Option 1 — Design File Only */}
            <button
              type="button"
              onClick={() => setSelected("design_file")}
              className={`w-full text-left rounded-2xl border p-5 transition-all duration-200
                ${selected === "design_file"
                  ? "border-gs-gold bg-gs-dark-2 shadow-[0_0_0_1px_rgba(212,175,55,0.3)]"
                  : "border-gs-border bg-gs-dark-3 hover:border-gs-gold/40 hover:bg-gs-dark-2"
                }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all
                      ${selected === "design_file" ? "border-gs-gold bg-gs-gold" : "border-gs-border"}`}>
                      {selected === "design_file" && (
                        <svg className="w-full h-full p-0.5" viewBox="0 0 8 8" fill="white">
                          <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      )}
                    </div>
                    <p className="font-display font-bold uppercase tracking-wide text-sm text-gs-white">
                      Design File Only
                    </p>
                  </div>
                  <p className="text-xs text-gs-muted font-barlow leading-relaxed ml-6">
                    Receive all high-res AI concept renders and design files. Perfect if you&apos;re printing
                    independently or want the files for your own production vendor.
                  </p>
                  <ul className="mt-3 ml-6 space-y-1">
                    {[
                      "All 4 high-res concept renders (PNG)",
                      "Design system specification sheet",
                      "Color swatches with hex + Pantone codes",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[11px] text-gs-muted font-barlow">
                        <span className="text-gs-gold text-[8px]">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-lg font-display font-bold text-gs-gold">{DESIGN_FILE_PRICE}</p>
                </div>
              </div>
            </button>

            {/* Option 2 — Full Production */}
            <button
              type="button"
              onClick={() => setSelected("production")}
              className={`w-full text-left rounded-2xl border p-5 transition-all duration-200
                ${selected === "production"
                  ? "border-gs-gold bg-gs-dark-2 shadow-[0_0_0_1px_rgba(212,175,55,0.3)]"
                  : "border-gs-border bg-gs-dark-3 hover:border-gs-gold/40 hover:bg-gs-dark-2"
                }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-all
                      ${selected === "production" ? "border-gs-gold bg-gs-gold" : "border-gs-border"}`}>
                      {selected === "production" && (
                        <svg className="w-full h-full p-0.5" viewBox="0 0 8 8" fill="white">
                          <path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      )}
                    </div>
                    <p className="font-display font-bold uppercase tracking-wide text-sm text-gs-white">
                      Full Production
                    </p>
                    <span className="text-[8px] font-display font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-gs-gold/20 text-gs-gold border border-gs-gold/30">
                      Recommended
                    </span>
                  </div>
                  <p className="text-xs text-gs-muted font-barlow leading-relaxed ml-6">
                    We manufacture everything to spec — from first piece sample to full bulk run, QC checked and delivered.
                  </p>
                  <ul className="mt-3 ml-6 space-y-1">
                    {[
                      "Everything in Design File",
                      "First piece sample for your approval",
                      "Full bulk production to your roster",
                      "Quality control inspection",
                      "Shipping & delivery tracking",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-[11px] text-gs-muted font-barlow">
                        <span className="text-gs-gold text-[8px]">✓</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex-shrink-0 text-right space-y-0.5">
                  <p className="text-lg font-display font-bold text-gs-gold">{PRODUCTION_TOTAL}</p>
                  <p className="text-[9px] text-gs-muted font-barlow">Split in two payments</p>
                </div>
              </div>

              {/* Payment structure — visible when production is selected */}
              {selected === "production" && (
                <div className="mt-4 ml-6 rounded-xl border border-gs-border bg-gs-dark divide-y divide-gs-border">
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-display font-bold uppercase tracking-wider text-gs-white">
                        Deposit — Pay Now
                      </p>
                      <p className="text-[10px] text-gs-muted font-barlow mt-0.5">
                        Required to start production · 50% of order total
                      </p>
                    </div>
                    <p className="text-base font-display font-bold text-gs-gold">{PRODUCTION_DEPOSIT}</p>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between opacity-60">
                    <div>
                      <p className="text-xs font-display font-bold uppercase tracking-wider text-gs-white">
                        Balance — On Delivery
                      </p>
                      <p className="text-[10px] text-gs-muted font-barlow mt-0.5">
                        Due when your order ships · 50% of order total
                      </p>
                    </div>
                    <p className="text-base font-display font-bold text-gs-muted">{PRODUCTION_BALANCE}</p>
                  </div>
                </div>
              )}
            </button>
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
                  bg-gs-gold text-white hover:bg-gs-gold-light transition-all duration-200
                  disabled:opacity-50 disabled:cursor-not-allowed
                  shadow-[0_4px_24px_rgba(212,175,55,0.2)] hover:shadow-[0_4px_32px_rgba(212,175,55,0.35)]"
              >
                {confirming
                  ? "Processing…"
                  : selected === "production"
                  ? `Pay ${PRODUCTION_DEPOSIT} Deposit & Start Production →`
                  : "Get My Design Files →"
                }
              </button>
              <p className="text-[10px] text-gs-muted font-barlow text-center leading-relaxed">
                {selected === "production"
                  ? "Production begins within 1 business day of payment confirmation."
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

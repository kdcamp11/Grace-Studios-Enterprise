"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OrgLogo from "@/components/OrgLogo";

interface OrderInfo {
  order_number:    string;
  team_name:       string;
  sport:           string;
  garment_type:    string;
  design_system:   string;
  preview_url:     string | null;
  design_fee_paid: boolean;
  concept_source:  "ai" | "client_provided";
}

// Design deposit — $150.00 (matches DESIGN_DEPOSIT_CENTS in the API)
const DESIGN_FEE_DISPLAY = "$150";

export default function CheckoutPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router       = useRouter();
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;

  const [info, setInfo]       = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const isClientProvided = info?.concept_source === "client_provided";

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const res = await fetch(`/api/orders/info?orderId=${order_id}`);
      if (!res.ok) { setLoading(false); return; }

      const data = await res.json() as OrderInfo;

      // Already paid — skip to the right destination
      if (data.design_fee_paid) {
        if (data.concept_source === "client_provided") {
          router.replace(`/orders/${order_id}/tracker`);
        } else {
          router.replace(`/orders/${order_id}/concepts`);
        }
        return;
      }

      setInfo(data);
      setLoading(false);
    }
    load();
  }, [order_id, supabase, router]);

  async function handlePay() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order_id}/design-deposit`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json() as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Unable to start checkout. Please try again.");
      }

      // Redirect to Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <p className="text-brand-muted font-barlow">Order not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
        >
          ← Back
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">

          {/* Heading */}
          <div className="text-center space-y-2">
            <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary">
              {isClientProvided ? "Design Execution Deposit" : "Design Deposit"}
            </p>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text">
              {isClientProvided ? "Start Production" : "Unlock Your Concept"}
            </h1>
            <p className="text-sm text-brand-muted font-barlow leading-relaxed">
              {isClientProvided
                ? "Pay the design execution deposit to send your concept to a Grace Studios designer for production-ready execution."
                : "Your designs are ready. Pay the design deposit to view all 4 renders and approve your concept for production."}
            </p>
          </div>

          {/* Preview thumbnail (AI path only) */}
          {info.preview_url && !isClientProvided && (
            <div className="relative rounded-2xl overflow-hidden border border-brand-border bg-gray-50 aspect-square max-w-[180px] mx-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={info.preview_url}
                alt="Concept preview"
                className="w-full h-full object-contain"
              />
              {/* Lock overlay on the right half */}
              <div className="absolute inset-y-0 right-0 w-1/2 backdrop-blur-md bg-brand-bg/60 flex items-center justify-center">
                <svg className="w-6 h-6 text-brand-muted/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </div>
            </div>
          )}

          {/* Upload confirmation (client-provided path) */}
          {isClientProvided && (
            <div className="flex items-center gap-3 rounded-2xl border border-green-800/40 bg-green-950/10 px-5 py-4">
              <div className="w-8 h-8 rounded-full bg-green-900/30 border border-green-700/40 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-display font-bold uppercase tracking-wider text-green-400">Concept Uploaded</p>
                <p className="text-[10px] text-brand-muted font-barlow mt-0.5">
                  Your design file has been received. Pay below to send it to a designer.
                </p>
              </div>
            </div>
          )}

          {/* Order summary card */}
          <div className="rounded-2xl border border-brand-border bg-brand-surface divide-y divide-brand-border">
            <div className="px-6 py-4 flex items-center justify-between">
              <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Team</span>
              <span className="text-sm font-bold text-brand-text font-display uppercase tracking-wide">
                {info.team_name}
              </span>
            </div>
            {!isClientProvided && (
              <div className="px-6 py-4 flex items-center justify-between">
                <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Garment</span>
                <span className="text-xs text-brand-text font-barlow">{info.garment_type}</span>
              </div>
            )}
            {!isClientProvided && (
              <div className="px-6 py-4 flex items-center justify-between">
                <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Design System</span>
                <span className="inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-gray-900 text-white border border-brand-border">
                  {info.design_system.toUpperCase()}
                </span>
              </div>
            )}
            <div className="px-6 py-4 flex items-center justify-between">
              <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Order</span>
              <span className="text-xs font-mono text-brand-text">{info.order_number}</span>
            </div>
            <div className="px-6 py-5 flex items-center justify-between bg-brand-surface rounded-b-2xl">
              <div>
                <span className="text-sm font-display font-bold uppercase tracking-wider text-brand-text">
                  {isClientProvided ? "Execution Deposit" : "Design Deposit"}
                </span>
                <p className="text-[9px] text-brand-muted font-barlow mt-0.5">
                  Credited toward your total order
                </p>
              </div>
              <span className="text-2xl font-display font-bold text-brand-primary tracking-wide">
                {DESIGN_FEE_DISPLAY}
              </span>
            </div>
          </div>

          {/* What's included */}
          <div className="rounded-2xl border border-brand-border bg-brand-surface px-5 py-4 space-y-2">
            <p className="text-[9px] font-display font-bold uppercase tracking-[0.28em] text-brand-muted mb-3">
              What&apos;s included
            </p>
            {isClientProvided ? (
              <>
                <IncludedItem text="Designer execution of your uploaded concept" />
                <IncludedItem text="Production-ready Illustrator file" />
                <IncludedItem text="Two revision rounds" />
                <IncludedItem text="Full order tracking" />
              </>
            ) : (
              <>
                <IncludedItem text="All 4 concept views unlocked" />
                <IncludedItem text="Design approval + designer assignment" />
                <IncludedItem text="Production-ready Illustrator file" />
                <IncludedItem text="Full order tracking" />
              </>
            )}
          </div>

          {/* Pay button */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handlePay}
              disabled={paying}
              className="w-full py-4 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em]
                bg-brand-primary text-white hover:bg-brand-secondary
                disabled:opacity-50 disabled:cursor-not-allowed
                transition-all duration-200 shadow-[0_4px_24px_rgba(212,175,55,0.25)]
                hover:shadow-[0_4px_32px_rgba(212,175,55,0.4)]"
            >
              {paying
                ? "Redirecting to checkout…"
                : `Pay ${DESIGN_FEE_DISPLAY} — ${isClientProvided ? "Start Production" : "Unlock Designs"}`}
            </button>

            {error && (
              <p className="text-xs text-red-400 font-barlow text-center">{error}</p>
            )}

            <p className="text-[10px] text-brand-muted font-barlow text-center leading-relaxed">
              Secure payment via Stripe. {DESIGN_FEE_DISPLAY} deposit is credited toward
              your total order — no additional charge at this stage.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}

function IncludedItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0" />
      <span className="text-[10px] font-barlow text-brand-muted">{text}</span>
    </div>
  );
}

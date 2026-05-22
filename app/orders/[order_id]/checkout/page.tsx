"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OrgLogo from "@/components/OrgLogo";

interface OrderInfo {
  order_number: string;
  team_name: string;
  sport: string;
  garment_type: string;
  design_system: string;
  preview_url: string | null;
  design_fee_paid: boolean;
}

// Design fee pulled from env — set NEXT_PUBLIC_DESIGN_FEE to override.
// Format: "$149" (used for display only in this placeholder build).
const DESIGN_FEE = process.env.NEXT_PUBLIC_DESIGN_FEE ?? "$149";

export default function CheckoutPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router       = useRouter();
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;

  const [info, setInfo]       = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Auth guard
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      // Fetch order + client via service-role API (bypasses RLS for join)
      const res = await fetch(`/api/orders/info?orderId=${order_id}`);
      if (!res.ok) { setLoading(false); return; }

      const data = await res.json() as OrderInfo;

      // Already paid — skip to concepts
      if (data.design_fee_paid) {
        router.replace(`/orders/${order_id}/concepts`);
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
      const res = await fetch("/api/orders/mark-paid", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ order_id }),
      });
      if (!res.ok) throw new Error("Payment failed — please try again.");
      router.push(`/orders/${order_id}/concepts?unlocked=1`);
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
        <OrgLogo className="h-10" href="/portal" />
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
              Design Deposit
            </p>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text">
              Unlock Your Concept
            </h1>
            <p className="text-sm text-brand-muted font-barlow leading-relaxed">
              Your designs are ready. Pay the design deposit to view all 4
              renders and approve your concept for production.
            </p>
          </div>

          {/* Preview thumbnail */}
          {info.preview_url && (
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

          {/* Order summary card */}
          <div className="rounded-2xl border border-brand-border bg-brand-surface divide-y divide-brand-border">
            <div className="px-6 py-4 flex items-center justify-between">
              <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Team</span>
              <span className="text-sm font-bold text-brand-text font-display uppercase tracking-wide">
                {info.team_name}
              </span>
            </div>
            <div className="px-6 py-4 flex items-center justify-between">
              <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Garment</span>
              <span className="text-xs text-brand-text font-barlow">{info.garment_type}</span>
            </div>
            <div className="px-6 py-4 flex items-center justify-between">
              <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Design System</span>
              <span className="inline-block px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-gray-900 text-white border border-brand-border">
                {info.design_system.toUpperCase()}
              </span>
            </div>
            <div className="px-6 py-4 flex items-center justify-between">
              <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Order</span>
              <span className="text-xs font-mono text-brand-text">{info.order_number}</span>
            </div>
            <div className="px-6 py-5 flex items-center justify-between bg-brand-surface rounded-b-2xl">
              <span className="text-sm font-display font-bold uppercase tracking-wider text-brand-text">
                Design Deposit
              </span>
              <span className="text-2xl font-display font-bold text-brand-primary tracking-wide">
                {DESIGN_FEE}
              </span>
            </div>
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
              {paying ? "Processing…" : `Pay ${DESIGN_FEE} — Unlock Designs`}
            </button>

            {error && (
              <p className="text-xs text-red-400 font-barlow text-center">{error}</p>
            )}

            <p className="text-[10px] text-brand-muted font-barlow text-center leading-relaxed">
              Design deposit is credited toward your total order. No additional
              charge for standard production.
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}

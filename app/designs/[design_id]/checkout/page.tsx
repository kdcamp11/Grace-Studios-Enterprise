"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import OrgLogo from "@/components/OrgLogo";

interface DesignInfo {
  teamName:          string | null;
  sport:             string | null;
  clientConceptUrl:  string | null;
  status:            string;
  kind:              string | null;
}

const ACTIVATION_FEE_DISPLAY = "$149";

export default function DesignCheckoutPage() {
  const { design_id } = useParams<{ design_id: string }>();
  const router        = useRouter();
  const supabaseRef   = useRef(createClient());
  const supabase      = supabaseRef.current;

  const [info, setInfo]       = useState<DesignInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const res = await fetch(`/api/designs/${design_id}/info`);
      if (!res.ok) { setLoading(false); return; }

      const data = await res.json() as DesignInfo;

      // Already converted — redirect to the minted order
      if (data.status === "converted") {
        const statusRes = await fetch(`/api/designs/${design_id}/status`);
        if (statusRes.ok) {
          const { orderId } = await statusRes.json() as { orderId: string | null };
          if (orderId) {
            router.replace(data.kind === "upload"
              ? `/orders/${orderId}/tracker`
              : `/orders/${orderId}/concepts`);
            return;
          }
        }
        router.replace("/portal");
        return;
      }

      setInfo(data);
      setLoading(false);
    }
    load();
  }, [design_id, supabase, router]);

  async function handlePay() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(`/api/designs/${design_id}/design-deposit`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
      });

      const text = await res.text();
      if (!text) throw new Error("Server did not respond. Please try again in a moment.");

      const data = JSON.parse(text) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Unable to start checkout.");

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
        <p className="text-brand-muted font-barlow">Design not found.</p>
      </div>
    );
  }

  const isUpload = info.kind === "upload";

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
          <div className="text-center space-y-3">
            <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary">
              Creative Activation
            </p>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text leading-tight">
              Your Project Starts Here.
            </h1>
            <p className="text-sm text-brand-muted font-barlow leading-relaxed max-w-sm mx-auto">
              Creative Activation includes onboarding, project setup, concept development
              access, and production preparation.
            </p>
          </div>

          {/* Confirmation */}
          <div className="flex items-center gap-3 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 px-5 py-4">
            <div className="w-8 h-8 rounded-full bg-brand-primary/15 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary">Design Ready</p>
              <p className="text-[10px] text-brand-muted font-barlow mt-0.5">
                {isUpload
                  ? "Your file is uploaded. Activate to put a Grace Studios designer on it."
                  : "Your design direction is set. Activate to move into production."}
              </p>
            </div>
          </div>

          {/* Order summary */}
          <div className="rounded-2xl border border-brand-border bg-brand-surface divide-y divide-brand-border">
            {info.teamName && (
              <div className="px-6 py-4 flex items-center justify-between">
                <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Team</span>
                <span className="text-sm font-bold text-brand-text font-display uppercase tracking-wide">
                  {info.teamName}
                </span>
              </div>
            )}
            {info.sport && (
              <div className="px-6 py-4 flex items-center justify-between">
                <span className="text-xs font-display uppercase tracking-wider text-brand-muted">Sport</span>
                <span className="text-xs text-brand-text font-barlow">{info.sport}</span>
              </div>
            )}
            <div className="px-6 py-5 flex items-center justify-between bg-brand-surface rounded-b-2xl">
              <div>
                <span className="text-sm font-display font-bold uppercase tracking-wider text-brand-text">
                  Creative Activation
                </span>
                <p className="text-[9px] text-brand-muted font-barlow mt-0.5">
                  Applied toward your final order total
                </p>
              </div>
              <span className="text-2xl font-display font-bold text-brand-primary tracking-wide">
                {ACTIVATION_FEE_DISPLAY}
              </span>
            </div>
          </div>

          {/* What's included */}
          <div className="rounded-2xl border border-brand-border bg-brand-surface px-5 py-4 space-y-2">
            <p className="text-[9px] font-display font-bold uppercase tracking-[0.28em] text-brand-muted mb-3">
              What&apos;s Included
            </p>
            {isUpload ? (
              <>
                <IncludedItem text="Grace Studios designer assigned to your project" />
                <IncludedItem text="Production-ready artwork prepared from your direction" />
                <IncludedItem text="One revision round included" />
                <IncludedItem text="Full production tracking from brief to delivery" />
              </>
            ) : (
              <>
                <IncludedItem text="Full concept set released for your review" />
                <IncludedItem text="Designer assigned and brief confirmed" />
                <IncludedItem text="Production-ready artwork prepared" />
                <IncludedItem text="Full production tracking from brief to delivery" />
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
              {paying ? "Redirecting…" : `Creative Activation — ${ACTIVATION_FEE_DISPLAY}`}
            </button>

            {error && (
              <p className="text-xs text-red-400 font-barlow text-center">{error}</p>
            )}

            <p className="text-[10px] text-brand-muted font-barlow text-center leading-relaxed">
              Secure checkout via Stripe. Your Creative Activation is applied toward your final order total.
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

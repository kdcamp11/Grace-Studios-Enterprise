"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import OrgLogo from "@/components/OrgLogo";

/**
 * /designs/[design_id]/activated
 *
 * Stripe success redirect landing page for design-keyed checkout.
 * Polls GET /api/designs/[design_id]/status until status === "converted",
 * then redirects to the minted order's destination page.
 *
 * This page exists because the order doesn't yet exist at Stripe session
 * creation time — the webhook mints it asynchronously on payment success.
 */
export default function DesignActivatedPage() {
  const { design_id } = useParams<{ design_id: string }>();
  const router        = useRouter();
  const attempts      = useRef(0);
  const MAX_ATTEMPTS  = 30; // 30 × 2s = 60s max wait

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (cancelled) return;

      attempts.current += 1;
      if (attempts.current > MAX_ATTEMPTS) {
        // Webhook took too long — send to portal; they'll see the order once it appears
        router.replace("/portal");
        return;
      }

      try {
        const res = await fetch(`/api/designs/${design_id}/status`);
        if (res.ok) {
          const { status, orderId, kind } = await res.json() as {
            status:  string;
            orderId: string | null;
            kind:    string | null;
          };

          if (status === "converted" && orderId) {
            // Upload and builder designs are executed by a Grace Studios designer
            // (no AI concept set to review) → tracker. AI briefs → concepts board.
            router.replace(kind === "upload" || kind === "builder"
              ? `/orders/${orderId}/tracker`
              : `/orders/${orderId}/concepts`);
            return;
          }
        }
      } catch { /* network hiccup — keep polling */ }

      // Not converted yet — wait 2s and try again
      setTimeout(() => { if (!cancelled) poll(); }, 2000);
    }

    // Start polling after a brief pause to give the webhook time to fire
    const t = setTimeout(poll, 1500);
    return () => { cancelled = true; clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design_id]);

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4">
        <OrgLogo href="/portal" />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center mb-6">
          <svg className="w-6 h-6 text-brand-primary animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>

        <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-2">
          Payment Received
        </p>
        <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text mb-3">
          Activating Your Project
        </h1>
        <p className="text-sm text-brand-muted font-barlow leading-relaxed max-w-xs">
          Setting up your order now. This takes just a moment.
        </p>
      </main>
    </div>
  );
}

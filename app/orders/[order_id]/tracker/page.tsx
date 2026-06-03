"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";
import MobileDropdown from "@/components/MobileDropdown";
import { useTenant } from "@/lib/tenant/context";
import type { OrderStage } from "@/types/database";
import { normalizeStage } from "@/lib/order-stages";
import { deriveTimeline, type Milestones } from "@/lib/order-milestones";

// ─── Action card config ─────────────────────────────────────────────────────
//
// The timeline itself is derived from real workflow conditions (see
// lib/order-milestones.ts). The headline card describes the CURRENT step, keyed
// by its index in TIMELINE_STEPS so the card and the timeline can never disagree.

interface StageCard {
  title:       string;
  description: string;
  urgent?:     boolean;   // amber highlight
  success?:    boolean;   // green highlight
}

// One card per production step (index aligns with TIMELINE_STEPS / currentIndex).
const STEP_CARDS: StageCard[] = [
  { // 0 Mockup In Progress
    title:       "Mockup In Progress",
    description: "The Grace Studios design team is creating your official 2D mockup based on your brief, design selections, and references. You'll be notified as soon as it's ready for your review.",
  },
  { // 1 Mockup Review
    title:       "Action Required: Review Your Mockup",
    description: "Your official 2D mockup is ready. Review the designs below and approve to move to production, or request one revision.",
    urgent:      true,
  },
  { // 2 Production Files
    title:       "Production Files Being Prepared",
    description: "Your mockup is approved. Grace Studios is preparing supplier-ready production files. The first 50% production payment is required before supplier production can begin.",
    success:     true,
  },
  { // 3 First Piece In Production
    title:       "First Piece In Production",
    description: "Your supplier is creating the first physical sample using your finalized production files. You'll be notified as soon as it's ready for your review.",
  },
  { // 4 First Piece Review
    title:       "Action Required: Review Your First Piece",
    description: "Your first piece sample is ready. Review the photos or video below and approve to begin bulk production, or request one adjustment.",
    urgent:      true,
  },
  { // 5 Bulk Production
    title:       "Bulk Production Underway",
    description: "First piece approved. Your supplier is now manufacturing your full bulk order to your locked production specifications. No major changes can be made at this stage.",
  },
  { // 6 Quality Check
    title:       "Quality Check",
    description: "Your full order is undergoing final quality inspection — print quality, sizing, stitching, quantities, and packaging. Your final 50% production payment is required before shipment is released.",
  },
  { // 7 Shipped
    title:       "Order Shipped",
    description: "Your order is on its way. Tracking information is below. You'll receive a shipping confirmation with full details.",
    success:     true,
  },
  { // 8 Delivered
    title:       "Order Delivered",
    description: "Your order has been delivered. All order assets, files, and history remain accessible in your account.",
    success:     true,
  },
];

// Holding card shown before an order has entered production.
const PRE_PRODUCTION_CARD: StageCard = {
  title:       "Order In Progress",
  description: "Your project is being prepared for production. You'll be notified as soon as your mockup is ready for review.",
};

const COMPLETE_CARD: StageCard = {
  title:       "Order Complete",
  description: "Your order is complete and delivered. All order assets, files, and history remain accessible in your account.",
  success:     true,
};

/**
 * Resolves the headline card from the current step index, applying sub-state
 * overrides (revision-in-progress, awaiting payment) based on real signals.
 */
function resolveCard(currentIndex: number, stage: string, m: Milestones): StageCard {
  if (currentIndex < 0) return PRE_PRODUCTION_CARD;
  if (currentIndex >= STEP_CARDS.length) return COMPLETE_CARD;

  const norm = normalizeStage(stage);

  // Mockup Review — distinguish "awaiting your review" vs "revision in progress"
  if (currentIndex === 1 && norm === "mockup_revision") {
    return {
      title:       "Mockup Revision In Progress",
      description: "Your revision request has been received. The design team is applying updates to your mockup. Revision scope is limited to minor adjustments. You'll be notified when it's ready.",
      urgent:      true,
    };
  }

  // Production Files — clarify whether the first payment is the blocker
  if (currentIndex === 2 && m.productionFilesUploaded && !m.firstPaymentPaid) {
    return {
      title:       "Action Required: First Production Payment",
      description: "Your supplier-ready production files are prepared. Your first 50% production payment is required before supplier production can begin.",
      urgent:      true,
    };
  }

  // First Piece Review — distinguish "awaiting your review" vs "adjustment in progress"
  if (currentIndex === 4 && norm === "first_piece_revision") {
    return {
      title:       "First Piece Adjustment In Progress",
      description: "Your adjustment request has been received. The supplier is correcting your first piece sample. Revision scope is limited to production corrections and small adjustments.",
      urgent:      true,
    };
  }

  // Quality Check — clarify whether the final payment is the blocker
  if (currentIndex === 6 && m.qcComplete && !m.finalPaymentPaid) {
    return {
      title:       "Action Required: Final Production Payment",
      description: "Your order has passed quality inspection. Your final 50% production payment is required before your shipment is released.",
      urgent:      true,
    };
  }

  return STEP_CARDS[currentIndex];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  media_url: string;
  media_type: "photo" | "video";
  caption: string | null;
  client_approved: boolean | null;
  client_note: string | null;
}

interface MockupItem {
  id: string;
  image_url: string;
  label: string | null;
  revision_round: number;
  created_at: string;
}

interface OrderFile {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  label: string | null;
}

interface InvoiceSummary {
  id: string;
  status: string;
  total_amount: number;
  deposit_amount: number;
}

interface OrderData {
  id: string;
  order_number: string;
  stage: OrderStage;
  created_at: string;
  estimated_delivery: string | null;
  tracking_number: string | null;
  has_concepts: boolean;
  media: MediaItem[];
  files: OrderFile[];
  mockups: MockupItem[];
  mockup_revision_used: boolean;
  production_choice: string | null;
  deposit_paid: boolean | null;
  balance_paid: boolean | null;
  invoice: InvoiceSummary | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  return (
    <Suspense>
      <TrackerPageContent />
    </Suspense>
  );
}

function TrackerPageContent() {
  const { order_id } = useParams<{ order_id: string }>();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;
  const tenant       = useTenant();

  const paymentResult = searchParams.get("payment");

  const [order, setOrder]             = useState<OrderData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [isAdminView, setIsAdminView] = useState(false);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [clientNote, setClientNote]   = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [reviewDone, setReviewDone]   = useState(false);

  // Mockup review state
  const [mockupAction, setMockupAction]   = useState<"approve" | "request_revision" | null>(null);
  const [mockupSubmitting, setMockupSubmitting] = useState(false);
  const [mockupReviewDone, setMockupReviewDone] = useState(false);

  useEffect(() => {
    async function load() {
      await sessionReady();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace("/login"); return; }

      const profile = await getProfile();
      if (profile?.role === "supplier") { router.replace("/supplier"); return; }
      if (profile?.role === "admin" || profile?.role === "super_admin") setIsAdminView(true);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/portal/order-detail?order_id=${order_id}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) { setLoading(false); return; }

      const { order: o } = await res.json() as { order: OrderData };
      if (!o) { setLoading(false); return; }
      setOrder({ ...o, stage: o.stage as OrderStage, mockups: o.mockups ?? [], mockup_revision_used: o.mockup_revision_used ?? false });
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  // After a Stripe payment redirect, call sync-payment to confirm the Stripe
  // session server-side (idempotent — safe if webhook already ran), then poll
  // until the DB reflects the payment. Stripe webhooks can take 2–15 s.
  useEffect(() => {
    if (paymentResult !== "success") return;

    let stopped = false;
    let attempt = 0;
    const MAX_ATTEMPTS = 8;

    async function poll() {
      if (stopped) return;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/portal/order-detail?order_id=${order_id}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (stopped || !res.ok) return;
      const { order: o } = await res.json() as { order: OrderData };
      if (!o || stopped) return;
      setOrder({ ...o, stage: o.stage as OrderStage, mockups: o.mockups ?? [], mockup_revision_used: o.mockup_revision_used ?? false });
      // Stop once payment is reflected in the DB
      if (o.deposit_paid || o.balance_paid || o.invoice?.status === "partially_paid" || o.invoice?.status === "paid") return;
      attempt++;
      if (attempt < MAX_ATTEMPTS) setTimeout(poll, 3000);
    }

    async function syncThenPoll() {
      if (stopped) return;
      const { data: { session } } = await supabase.auth.getSession();
      // Confirm the Stripe session server-side so DB is updated even if the
      // webhook hasn't fired yet. Idempotent — safe to call multiple times.
      try {
        await fetch(`/api/orders/${order_id}/sync-payment`, {
          method: "POST",
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
      } catch { /* best-effort — poll will still run */ }
      await poll();
    }

    const initial = setTimeout(syncThenPoll, 1500);
    return () => { stopped = true; clearTimeout(initial); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentResult, order_id]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function submitReview(mediaId: string, approved: boolean) {
    setSubmitting(true);
    const note = clientNote || null;
    await fetch(`/api/orders/${order_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review_media", media_id: mediaId, approved, note }),
    });
    setOrder((prev) => {
      if (!prev) return prev;
      return { ...prev, media: prev.media.map((m) => m.id === mediaId ? { ...m, client_approved: approved, client_note: note } : m) };
    });
    setReviewingId(null);
    setClientNote("");
    setSubmitting(false);
    setReviewDone(true);
  }

  async function submitMockupReview(action: "approve" | "request_revision") {
    setMockupSubmitting(true);
    const res = await fetch(`/api/orders/${order_id}/review-mockup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const { stage } = await res.json() as { stage: OrderStage };
      setOrder((prev) => prev ? { ...prev, stage } : prev);
      setMockupAction(null);
      setMockupReviewDone(true);
    }
    setMockupSubmitting(false);
  }

  // ─── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <p className="text-brand-muted font-barlow">Order not found.</p>
      </div>
    );
  }

  // Derive the timeline from REAL workflow conditions, not the raw stage enum.
  // A step can only be complete when every prior dependency is satisfied, so the
  // timeline can never show a later stage done while an earlier one is missing.
  //
  // Once the order reaches sent_to_supplier or beyond, production files were
  // prepared and a supplier was assigned — otherwise the admin couldn't advance.
  // We infer both gates from stage so the client timeline advances correctly.
  const SUPPLIER_STAGES: ReadonlySet<string> = new Set([
    "sent_to_supplier", "files_sent", "first_piece_in_progress", "first_piece_review",
    "first_piece_revision", "bulk_production", "qc_verified", "shipped", "delivered", "complete",
  ]);
  const inSupplierStage = SUPPLIER_STAGES.has(normalizeStage(order.stage));
  const timeline = deriveTimeline({
    stage:               order.stage,
    production_choice:   order.production_choice,
    deposit_paid:        order.deposit_paid,
    balance_paid:        order.balance_paid,
    tracking_number:     order.tracking_number,
    mockups:             order.mockups,
    media:               order.media,
    files:               order.files,
    // Infer from stage: admin couldn't reach sent_to_supplier without production files
    production_file_url: inSupplierStage ? "stage-inferred" : undefined,
    supplier_user_id:    inSupplierStage ? "assigned" : null,
  });
  const { steps, currentIndex, milestones } = timeline;

  const pendingMedia  = order.media.filter((m) => m.client_approved === null);
  const reviewedMedia = order.media.filter((m) => m.client_approved !== null);

  const card: StageCard = resolveCard(currentIndex, order.stage, milestones);

  const cardBorder = card.urgent  ? "border-amber-400/50 bg-amber-400/5"
    : card.success ? "border-green-500/40 bg-green-500/5"
    : "border-brand-primary/40 bg-brand-surface";

  const cardTitleColor = card.urgent  ? "text-amber-400"
    : card.success ? "text-green-400"
    : "text-brand-primary";

  const cardDot = card.urgent  ? "bg-amber-400"
    : card.success ? "bg-green-500"
    : "bg-brand-primary";

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between">
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">Admin View: Client Portal</span>
          <a href={`/admin/orders/${order_id}`} className="text-xs font-display font-bold uppercase tracking-wider text-amber-600 hover:text-amber-800 transition-colors">Open in Admin →</a>
        </div>
      )}

      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <OrgLogo href="/portal" />
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">Client Portal</a>
        </div>
        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
        {/* Mobile nav */}
        <div className="lg:hidden">
          <MobileDropdown
            groups={[
              [{ label: "Home", href: "/portal" }, { label: "← Back", onClick: () => router.back() }],
              [{ label: "Sign Out", onClick: signOut }],
            ]}
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-xl space-y-6">

          {/* Payment success banner */}
          {paymentResult === "success" && (
            <div className="bg-green-400/10 border border-green-400/30 rounded-xl px-5 py-4 flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-green-400/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-display font-bold uppercase tracking-wide text-green-400 text-sm">Payment Received</p>
                <p className="text-xs font-barlow text-brand-muted mt-0.5 leading-relaxed">
                  Your payment has been processed. Your order is moving forward — the timeline below will update shortly.
                </p>
              </div>
            </div>
          )}

          {/* Order header */}
          <div className="space-y-0.5">
            <p className="text-xs font-display uppercase tracking-widest text-brand-muted">Order Status</p>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">
              {order.order_number || order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-xs text-brand-muted font-barlow">
              Submitted {new Date(order.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* ── Stage action card ────────────────────────────────────────────── */}
          <div className={`border rounded-xl p-5 space-y-4 ${cardBorder}`}>
            <div className="flex items-start gap-4">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cardDot}`}>
                {card.success ? (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className="font-display font-bold text-brand-bg text-sm">
                    {currentIndex >= 0 ? currentIndex + 1 : "—"}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-display font-bold uppercase tracking-wide text-sm ${cardTitleColor}`}>
                  {card.title}
                </p>
                <p className="text-xs text-brand-muted font-barlow mt-1 leading-relaxed">
                  {card.description}
                </p>
              </div>
            </div>

          </div>

          {/* ── Payment CTA — deposit (step 2) or final balance (step 6) ──────── */}
          {order.invoice && (() => {
            const inv = order.invoice!;
            const needsDeposit = currentIndex === 2 && !milestones.firstPaymentPaid;
            const needsBalance = currentIndex === 6 && milestones.qcComplete && !milestones.finalPaymentPaid;

            // When the client just returned from Stripe (paymentResult=success) but the
            // webhook hasn't written to the DB yet, show a confirmation card so they don't
            // see a still-active payment button. The polling loop will update the real state.
            if ((needsDeposit || needsBalance) && paymentResult === "success") {
              const confirmLabel = needsDeposit
                ? "First Production Payment Received"
                : "Final Production Payment Received";
              return (
                <div className="border border-green-400/40 bg-green-400/5 rounded-xl p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-9 h-9 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-display font-bold uppercase tracking-wide text-sm text-green-400">{confirmLabel}</p>
                      <p className="text-xs text-brand-muted font-barlow mt-1 leading-relaxed">
                        No additional payment is required at this time. Your order has moved into production.
                      </p>
                    </div>
                  </div>
                </div>
              );
            }

            if (!needsDeposit && !needsBalance) return null;
            const isPaid = inv.status === "paid";
            if (isPaid) return null;
            const amount = needsDeposit ? inv.deposit_amount : (inv.total_amount - inv.deposit_amount);
            const label  = needsDeposit ? "First Production Payment Due" : "Final Production Payment Due";
            const sub    = needsDeposit
              ? "50% deposit required to begin supplier production."
              : "Final 50% balance required to release your shipment.";
            return (
              <div className="border border-amber-400/50 bg-amber-400/5 rounded-xl p-5 space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-display font-bold uppercase tracking-wide text-sm text-amber-400">{label}</p>
                    <p className="text-xs text-brand-muted font-barlow mt-1 leading-relaxed">{sub}</p>
                    {amount > 0 && (
                      <p className="text-lg font-display font-bold text-brand-text mt-2">
                        ${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                </div>
                <a
                  href={`/orders/${order_id}/invoice`}
                  className="block w-full text-center py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-amber-400 text-black hover:bg-amber-300 transition-all"
                >
                  Pay Now →
                </a>
              </div>
            );
          })()}

          {/* ── First Piece Review ───────────────────────────────────────────── */}
          {order.media.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">First Piece</p>
                {pendingMedia.length === 0 && reviewedMedia.length > 0 && (
                  <span className="text-[10px] font-display uppercase tracking-wider text-green-400">All reviewed ✓</span>
                )}
              </div>

              {pendingMedia.map((item) => (
                <div key={item.id} className="border border-amber-400/30 rounded-xl overflow-hidden bg-brand-surface">
                  {item.media_type === "video" ? (
                    <video src={item.media_url} controls className="w-full aspect-video bg-black" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.media_url} alt={item.caption ?? "First piece"} className="w-full object-cover max-h-80" />
                  )}
                  <div className="p-4 space-y-3">
                    {item.caption && <p className="text-sm font-barlow text-brand-text">{item.caption}</p>}
                    {reviewingId === item.id ? (
                      <div className="space-y-3">
                        <textarea
                          value={clientNote}
                          onChange={(e) => setClientNote(e.target.value)}
                          rows={2}
                          placeholder="Add a note for the production team (optional)…"
                          className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors resize-none"
                        />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => submitReview(item.id, true)} disabled={submitting}
                            className="flex-1 py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 transition-all">
                            {submitting ? "Submitting…" : "Approve ✓"}
                          </button>
                          <button type="button" onClick={() => submitReview(item.id, false)} disabled={submitting}
                            className="flex-1 py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest border border-[#C41E1E]/40 text-[#C41E1E] hover:bg-[#C41E1E]/10 disabled:opacity-40 transition-all">
                            Request Changes
                          </button>
                          <button type="button" onClick={() => { setReviewingId(null); setClientNote(""); }}
                            className="px-3 py-3 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text font-barlow text-xs transition-all">
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setReviewingId(item.id); setClientNote(""); }}
                        className="w-full py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest border border-amber-400/40 text-amber-400 hover:bg-amber-400/10 transition-all">
                        Review This Item →
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {reviewedMedia.length > 0 && (
                <div className="space-y-3">
                  {pendingMedia.length > 0 && (
                    <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted">Already Reviewed</p>
                  )}
                  {reviewedMedia.map((item) => (
                    <div key={item.id} className="border border-brand-border rounded-xl overflow-hidden bg-brand-surface">
                      <div className="flex gap-3 p-3">
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-brand-bg border border-brand-border">
                          {item.media_type === "video" ? (
                            <video src={item.media_url} className="w-full h-full object-cover" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.media_url} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                          {item.caption && <p className="text-xs font-barlow text-brand-text truncate">{item.caption}</p>}
                          {item.client_approved === true ? (
                            <span className="inline-block text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border border-green-400/30 bg-green-400/10 text-green-400">Approved ✓</span>
                          ) : (
                            <span className="inline-block text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#C41E1E]/30 bg-[#C41E1E]/10 text-[#C41E1E]">Changes Requested</span>
                          )}
                          {item.client_note && <p className="text-[10px] font-barlow text-brand-muted leading-tight">"{item.client_note}"</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Mockup Review ────────────────────────────────────────────────── */}
          {order.mockups && order.mockups.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">2D Mockup</p>
                {mockupReviewDone && (
                  <span className="text-[10px] font-display uppercase tracking-wider text-green-400">Review Submitted ✓</span>
                )}
              </div>

              {/* Mockup image grid */}
              <div className="grid grid-cols-2 gap-3">
                {order.mockups.map((m) => (
                  <div key={m.id} className="rounded-xl overflow-hidden border border-brand-border bg-brand-surface">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.image_url} alt={m.label ?? "Mockup"} className="w-full object-contain max-h-64 bg-white" />
                    {m.label && (
                      <p className="text-center text-[9px] font-display uppercase tracking-[0.28em] text-brand-muted py-2 border-t border-brand-border">
                        {m.label}{m.revision_round > 1 ? ` · Rev ${m.revision_round}` : ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Action buttons — shown when timeline is at Mockup Review step (index 1) and revision is not in progress */}
              {currentIndex === 1 && normalizeStage(order.stage) !== "mockup_revision" && !mockupReviewDone && (
                <div className="border border-amber-400/30 rounded-xl p-4 bg-brand-surface space-y-3">
                  <p className="text-xs font-display uppercase tracking-wider text-amber-400">Your Review Required</p>
                  {mockupAction === null ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMockupAction("approve")}
                        className="flex-1 py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest border border-green-400/40 text-green-400 hover:bg-green-400/10 transition-all"
                      >
                        Approve Mockup ✓
                      </button>
                      {!order.mockup_revision_used && (
                        <button
                          type="button"
                          onClick={() => setMockupAction("request_revision")}
                          className="flex-1 py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest border border-amber-400/40 text-amber-400 hover:bg-amber-400/10 transition-all"
                        >
                          Request Revision
                        </button>
                      )}
                      {order.mockup_revision_used && (
                        <div className="flex-1 py-3 rounded-lg text-center text-[10px] font-display uppercase tracking-wider text-brand-muted border border-brand-border">
                          1 Revision Used
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-barlow text-brand-muted">
                        {mockupAction === "approve"
                          ? "Approve this mockup and move into production?"
                          : "Request a revision — your designer will update the mockup."}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => submitMockupReview(mockupAction)}
                          disabled={mockupSubmitting}
                          className={`flex-1 py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest disabled:opacity-40 transition-all ${
                            mockupAction === "approve"
                              ? "bg-green-600 text-white hover:bg-green-500"
                              : "bg-amber-500/20 text-amber-400 border border-amber-400/40 hover:bg-amber-500/30"
                          }`}
                        >
                          {mockupSubmitting ? "Submitting…" : mockupAction === "approve" ? "Confirm Approval" : "Confirm Revision Request"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMockupAction(null)}
                          className="px-4 py-3 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text font-barlow text-xs transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Review submitted confirmation */}
          {reviewDone && (
            <div className="bg-green-400/10 border border-green-400/30 rounded-xl p-5 flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-green-400/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="font-display font-bold uppercase tracking-wide text-green-400 text-sm">Review Submitted</p>
                <p className="text-xs font-barlow text-brand-muted mt-0.5">
                  {tenant.name} has been notified and will follow up shortly.
                </p>
                <button type="button" onClick={() => router.push("/portal")}
                  className="mt-3 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
                  ← Back to My Orders
                </button>
              </div>
            </div>
          )}

          {/* ── Tracking info ────────────────────────────────────────────────── */}
          {order.tracking_number && (
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
              <p className="text-xs font-display uppercase tracking-wider text-brand-muted">Tracking Number</p>
              <p className="text-sm font-barlow text-brand-text font-mono mt-1">{order.tracking_number}</p>
            </div>
          )}
          {order.estimated_delivery && (
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
              <p className="text-xs font-display uppercase tracking-wider text-brand-muted">Estimated Delivery</p>
              <p className="text-sm font-barlow text-brand-text mt-1">
                {new Date(order.estimated_delivery).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          )}

          {/* ── Files ────────────────────────────────────────────────────────── */}
          {order.files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Your Files</p>
                <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted">
                  {order.files.length} file{order.files.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="bg-brand-surface border border-brand-border rounded-xl overflow-hidden">
                {order.files.map((f, i) => (
                  <div key={f.id} className={`flex items-center gap-4 px-4 py-3.5 ${i < order.files.length - 1 ? "border-b border-brand-border" : ""}`}>
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-brand-bg border border-brand-border flex items-center justify-center">
                      <svg className="w-4 h-4 text-brand-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      {f.label && <p className="text-[9px] font-display uppercase tracking-wider text-brand-primary mb-0.5">{f.label}</p>}
                      <p className="text-sm font-barlow text-brand-text truncate">{f.file_name}</p>
                      {f.file_size && (
                        <p className="text-[10px] font-barlow text-brand-muted">
                          {f.file_size > 1024 * 1024 ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB` : `${(f.file_size / 1024).toFixed(0)} KB`}
                        </p>
                      )}
                    </div>
                    <a href={f.file_url} download={f.file_name} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 flex items-center gap-1.5 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Back to portal ────────────────────────────────────────────────── */}
          <div className="pt-2">
            <a
              href="/portal"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-display font-bold text-sm uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
            >
              ← Back to Portal
            </a>
          </div>

          {/* ── Full timeline ─────────────────────────────────────────────────── */}
          <div>
            <p className="text-xs font-display uppercase tracking-widest text-brand-muted mb-5">Order Timeline</p>
            <div className="space-y-0">
              {steps.map((step, i) => {
                const isDone     = step.status === "done";
                const isCurrent  = step.status === "current";
                const isUpcoming = step.status === "upcoming";
                return (
                  <div key={step.key} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors
                        ${isDone    ? "bg-brand-primary border-brand-primary" : ""}
                        ${isCurrent ? "bg-brand-bg border-brand-primary" : ""}
                        ${isUpcoming ? "bg-brand-surface border-brand-border" : ""}`}>
                        {isDone ? (
                          <svg className="w-3.5 h-3.5 text-brand-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <div className={`w-2 h-2 rounded-full ${isCurrent ? "bg-brand-primary" : "bg-brand-border"}`} />
                        )}
                      </div>
                      {i < steps.length - 1 && (
                        <div className={`w-0.5 flex-1 my-1 min-h-[24px] ${isDone ? "bg-brand-primary" : "bg-brand-border"}`} />
                      )}
                    </div>
                    <div className="pb-6 pt-0.5 min-w-0">
                      <p className={`font-display font-bold uppercase tracking-wide text-sm
                        ${isCurrent ? "text-brand-primary" : isDone ? "text-brand-text" : "text-brand-muted"}`}>
                        {step.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

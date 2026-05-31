"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";
import MobileDropdown from "@/components/MobileDropdown";
import { useTenant } from "@/lib/tenant/context";
import type { OrderStage } from "@/types/database";
import { normalizeStage, stageLabel } from "@/lib/order-stages";

// ─── Pipeline definition ──────────────────────────────────────────────────────
//
// Each step groups the canonical (and legacy) stages that belong to it, so any
// order — AI brief, jersey builder, or uploaded concept — resolves onto a step.
// Stage strings are normalized before matching, so legacy aliases (onboarding,
// design_confirmed) and the new creative lifecycle stages both land correctly.

const PIPELINE: { label: string; stages: OrderStage[] }[] = [
  { label: "Brief Submitted",    stages: ["onboarding", "creative_started", "creative_submitted", "design_confirmed", "payment_pending"] },
  { label: "In Creative Review", stages: ["paid", "creative_in_review", "revision_requested"] },
  { label: "Design Approved",    stages: ["creative_approved", "ready_for_production", "files_sent"] },
  { label: "First Piece",        stages: ["first_piece_in_progress"] },
  { label: "First Piece Review", stages: ["first_piece_review"] },
  { label: "Bulk Production",    stages: ["bulk_production"] },
  { label: "Quality Check",      stages: ["qc_verified"] },
  { label: "Shipped",            stages: ["shipped"] },
  { label: "Delivered",          stages: ["delivered", "complete"] },
];

// Per-stage action card config
interface StageCard {
  title:       string;
  description: string;
  cta?:        string;
  ctaHref?:    (order_id: string) => string;
  urgent?:     boolean;   // amber highlight
  success?:    boolean;   // green highlight
}

const STAGE_CARDS: Partial<Record<OrderStage, StageCard>> = {
  onboarding: {
    title:       "Brief Submitted",
    description: "Your brief has been received. Head to your concept board. Your studio is preparing your designs.",
    cta:         "View Concept Board →",
    ctaHref:     (id) => `/orders/${id}/concepts`,
  },
  design_confirmed: {
    title:       "Concepts In Progress",
    description: "Your design concepts are being built. Open the board to watch the progress live.",
    cta:         "Open Concept Board →",
    ctaHref:     (id) => `/orders/${id}/concepts`,
  },
  paid: {
    title:       "Project Activated",
    description: "Your project is activated and assigned to a Grace Studios designer. We're preparing your design now.",
    success:     true,
  },
  creative_in_review: {
    title:       "In Creative Review",
    description: "A Grace Studios designer is preparing your design. You'll be notified as soon as it's ready for your approval.",
  },
  revision_requested: {
    title:       "Revisions In Progress",
    description: "Your requested changes are being applied. We'll send the updated design for your approval shortly.",
    urgent:      true,
  },
  creative_approved: {
    title:       "Design Approved",
    description: "Your design is approved and moving into production. We'll keep you posted as your order progresses.",
    success:     true,
  },
  ready_for_production: {
    title:       "Ready for Production",
    description: "Your design is locked and your order is moving into production. We'll notify you at each step.",
    success:     true,
  },
  files_sent: {
    title:       "Design Approved",
    description: "Your design has been approved and production files are ready. Your studio is preparing your first sample.",
    success:     true,
  },
  first_piece_in_progress: {
    title:       "First Sample In Production",
    description: "Your studio is crafting your first sample piece. You'll be notified as soon as it's ready to review.",
  },
  first_piece_review: {
    title:       "Action Required: Review Your Sample",
    description: "Your first piece is ready. Review the photos or video below and approve or request changes.",
    urgent:      true,
  },
  bulk_production: {
    title:       "Bulk Production Underway",
    description: "Your full order is now in production.",
  },
  qc_verified: {
    title:       "Quality Check Passed",
    description: "All pieces have passed quality inspection and are ready to ship.",
    success:     true,
  },
  shipped: {
    title:       "Order Shipped",
    description: "Your order is on its way. Track your shipment below.",
    success:     true,
  },
  delivered: {
    title:       "Order Delivered",
    description: "Your order has been delivered.",
    success:     true,
  },
  complete: {
    title:       "Order Complete",
    description: "Your order is complete. Thank you for choosing us!",
    success:     true,
  },
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface MediaItem {
  id: string;
  media_url: string;
  media_type: "photo" | "video";
  caption: string | null;
  client_approved: boolean | null;
  client_note: string | null;
}

interface OrderFile {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  label: string | null;
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
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrackerPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router       = useRouter();
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;
  const tenant       = useTenant();

  const [order, setOrder]             = useState<OrderData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [isAdminView, setIsAdminView] = useState(false);

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [clientNote, setClientNote]   = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [reviewDone, setReviewDone]   = useState(false);

  useEffect(() => {
    async function load() {
      await sessionReady();
      const profile = await getProfile();
      if (!profile) { router.replace("/login"); return; }
      if (profile.role === "supplier") { router.replace("/supplier"); return; }
      if (profile.role === "admin" || profile.role === "super_admin") setIsAdminView(true);

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/portal/order-detail?order_id=${order_id}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) { setLoading(false); return; }

      const { order: o } = await res.json() as { order: OrderData };
      if (!o) { setLoading(false); return; }
      setOrder({ ...o, stage: o.stage as OrderStage });
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

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

  // Match by normalized stage so both legacy aliases (onboarding,
  // design_confirmed) and the new creative lifecycle stages resolve onto a step.
  const normalized    = normalizeStage(order.stage);
  const currentIndex  = Math.max(
    0,
    PIPELINE.findIndex((p) => p.stages.some((s) => normalizeStage(s) === normalized)),
  );
  const pendingMedia  = order.media.filter((m) => m.client_approved === null);
  const reviewedMedia = order.media.filter((m) => m.client_approved !== null);

  // Override card if first piece media is pending
  const card: StageCard = pendingMedia.length > 0
    ? STAGE_CARDS.first_piece_review!
    : (STAGE_CARDS[order.stage] ?? STAGE_CARDS[normalizeStage(order.stage)] ?? { title: PIPELINE[currentIndex]?.label ?? stageLabel(order.stage), description: "" });

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
                  <span className="font-display font-bold text-brand-bg text-sm">{currentIndex + 1}</span>
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

            {/* CTA button — always shown for stages that need client action */}
            {card.cta && card.ctaHref && (
              <a
                href={card.ctaHref(order_id as string)}
                className="block w-full py-3.5 rounded-xl text-center font-display font-bold text-sm uppercase tracking-[0.15em]
                  bg-brand-primary text-white hover:bg-brand-secondary transition-all duration-200
                  shadow-[0_4px_20px_rgba(201,168,76,0.2)]"
              >
                {card.cta}
              </a>
            )}
          </div>

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
            <p className="text-xs font-display uppercase tracking-widest text-brand-muted mb-5">Full Timeline</p>
            <div className="space-y-0">
              {PIPELINE.map((step, i) => {
                const isDone     = i < currentIndex;
                const isCurrent  = i === currentIndex;
                const isUpcoming = i > currentIndex;
                return (
                  <div key={step.label} className="flex gap-4">
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
                      {i < PIPELINE.length - 1 && (
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

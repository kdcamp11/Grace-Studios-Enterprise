"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";
import { useTenant } from "@/lib/tenant/context";
import type { OrderStage } from "@/types/database";

const PIPELINE: { stage: OrderStage; label: string; description: string }[] = [
  { stage: "onboarding",              label: "Brief Submitted",    description: "Your design brief has been received." },
  { stage: "design_confirmed",        label: "Concepts Generating",description: "AI is generating your design concepts." },
  { stage: "files_sent",              label: "Design Approved",    description: "Your concept is approved and files are being prepared." },
  { stage: "first_piece_in_progress", label: "First Piece",        description: "Your first sample piece is in production." },
  { stage: "first_piece_review",      label: "First Piece Review", description: "Your sample is ready — review and approve below." },
  { stage: "bulk_production",         label: "Bulk Production",    description: "Full order is in production." },
  { stage: "qc_verified",             label: "Quality Check",      description: "All items have passed quality inspection." },
  { stage: "shipped",                 label: "Shipped",            description: "Your order is on its way." },
  { stage: "delivered",               label: "Delivered",          description: "Your order has been delivered." },
  { stage: "complete",                label: "Complete",           description: "Your order is complete. Thank you for your business." },
];

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

export default function TrackerPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router       = useRouter();
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;
  const tenant       = useTenant();

  const [order, setOrder]       = useState<OrderData | null>(null);
  const [loading, setLoading]   = useState(true);
  const [isAdminView, setIsAdminView] = useState(false);

  // Per-item review state
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [clientNote, setClientNote]   = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [reviewDone, setReviewDone]   = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const profile = await getProfile();
      if (profile?.role === "supplier") { router.replace("/supplier"); return; }
      if (profile?.role === "admin" || profile?.role === "super_admin") setIsAdminView(true);

      const { data: o } = await supabase
        .from("orders")
        .select("id, order_number, stage, created_at, estimated_delivery, tracking_number")
        .eq("id", order_id)
        .single();

      if (!o) { setLoading(false); return; }

      const [{ data: concepts }, { data: media }, { data: fileRows }] = await Promise.all([
        supabase.from("concepts").select("id").eq("order_id", order_id).limit(1),
        supabase
          .from("first_piece_media")
          .select("id, media_url, media_type, caption, client_approved, client_note")
          .eq("order_id", order_id)
          .eq("client_visible", true)
          .order("created_at", { ascending: true }),
        supabase
          .from("order_files")
          .select("id, file_url, file_name, file_size, file_type, label")
          .eq("order_id", order_id)
          .eq("client_visible", true)
          .order("created_at", { ascending: true }),
      ]);

      setOrder({
        ...o,
        stage: o.stage as OrderStage,
        has_concepts: (concepts?.length ?? 0) > 0,
        media: (media ?? []) as MediaItem[],
        files: (fileRows ?? []) as OrderFile[],
      });
      setLoading(false);
    }
    load();
  }, [supabase, order_id]);

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
      return {
        ...prev,
        media: prev.media.map((m) =>
          m.id === mediaId
            ? { ...m, client_approved: approved, client_note: note }
            : m
        ),
      };
    });

    setReviewingId(null);
    setClientNote("");
    setSubmitting(false);
    setReviewDone(true);
  }

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

  const currentIndex  = PIPELINE.findIndex((p) => p.stage === order.stage);
  const pendingMedia  = order.media.filter((m) => m.client_approved === null);
  const reviewedMedia = order.media.filter((m) => m.client_approved !== null);

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between">
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">Admin View — Client Portal</span>
          <a href={`/admin/orders/${order_id}`} className="text-xs font-display font-bold uppercase tracking-wider text-amber-600 hover:text-amber-800 transition-colors">
            Open in Admin →
          </a>
        </div>
      )}
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <OrgLogo className="h-7" href="/portal" />
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Client Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-xl space-y-8">

          {/* Order header */}
          <div className="space-y-1">
            <p className="text-xs font-display uppercase tracking-widest text-brand-muted">Order Status</p>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">
              {order.order_number || order.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-xs text-brand-muted font-barlow">
              Submitted {new Date(order.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* Concept board quick access */}
          {order.has_concepts && (
            <a
              href={`/orders/${order_id}/concepts`}
              className="flex items-center justify-between rounded-xl border border-brand-primary/30 bg-brand-surface px-5 py-4 hover:border-brand-primary/60 hover:bg-brand-surface transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary">View Concept Board</p>
                  <p className="text-[10px] text-brand-muted font-barlow mt-0.5">Your AI-generated design is ready to review</p>
                </div>
              </div>
              <span className="text-brand-muted group-hover:text-brand-primary transition-colors text-sm">→</span>
            </a>
          )}

          {/* Current stage callout */}
          <div className={`border rounded-xl p-5 flex items-center gap-4
            ${pendingMedia.length > 0
              ? "bg-amber-400/5 border-amber-400/40"
              : "bg-brand-surface border-brand-primary/40"}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0
              ${pendingMedia.length > 0 ? "bg-amber-400" : "bg-brand-primary"}`}>
              <span className="font-display font-bold text-brand-bg text-sm">{currentIndex + 1}</span>
            </div>
            <div>
              <p className={`font-display font-bold uppercase tracking-wide text-sm
                ${pendingMedia.length > 0 ? "text-amber-400" : "text-brand-primary"}`}>
                {pendingMedia.length > 0 ? "Action Required — Review First Piece" : PIPELINE[currentIndex]?.label}
              </p>
              <p className="text-xs text-brand-muted font-barlow mt-0.5">
                {pendingMedia.length > 0
                  ? `${pendingMedia.length} item${pendingMedia.length !== 1 ? "s" : ""} waiting for your approval.`
                  : PIPELINE[currentIndex]?.description}
              </p>
            </div>
          </div>

          {/* ── First Piece Review ─────────────────────────────────────────── */}
          {order.media.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">First Piece</p>
                {pendingMedia.length === 0 && reviewedMedia.length > 0 && (
                  <span className="text-[10px] font-display uppercase tracking-wider text-green-400">
                    All reviewed ✓
                  </span>
                )}
              </div>

              {/* Pending items */}
              {pendingMedia.map((item) => (
                <div key={item.id} className="border border-amber-400/30 rounded-xl overflow-hidden bg-brand-surface">
                  {/* Media */}
                  {item.media_type === "video" ? (
                    <video src={item.media_url} controls className="w-full aspect-video bg-black" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.media_url} alt={item.caption ?? "First piece"} className="w-full object-cover max-h-80" />
                  )}

                  <div className="p-4 space-y-3">
                    {item.caption && (
                      <p className="text-sm font-barlow text-brand-text">{item.caption}</p>
                    )}

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
                          <button
                            type="button"
                            onClick={() => submitReview(item.id, true)}
                            disabled={submitting}
                            className="flex-1 py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 transition-all"
                          >
                            {submitting ? "Submitting…" : "Approve ✓"}
                          </button>
                          <button
                            type="button"
                            onClick={() => submitReview(item.id, false)}
                            disabled={submitting}
                            className="flex-1 py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest border border-[#C41E1E]/40 text-[#C41E1E] hover:bg-[#C41E1E]/10 disabled:opacity-40 transition-all"
                          >
                            Request Changes
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReviewingId(null); setClientNote(""); }}
                            className="px-3 py-3 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text font-barlow text-xs transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setReviewingId(item.id); setClientNote(""); }}
                        className="w-full py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest border border-amber-400/40 text-amber-400 hover:bg-amber-400/10 transition-all"
                      >
                        Review This Item →
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Already reviewed items */}
              {reviewedMedia.length > 0 && (
                <div className="space-y-3">
                  {pendingMedia.length > 0 && (
                    <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted">Already Reviewed</p>
                  )}
                  {reviewedMedia.map((item) => (
                    <div key={item.id} className="border border-brand-border rounded-xl overflow-hidden bg-brand-surface">
                      <div className="flex gap-3 p-3">
                        {/* Thumbnail */}
                        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-brand-bg border border-brand-border">
                          {item.media_type === "video" ? (
                            <video src={item.media_url} className="w-full h-full object-cover" />
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.media_url} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                          {item.caption && (
                            <p className="text-xs font-barlow text-brand-text truncate">{item.caption}</p>
                          )}
                          {item.client_approved === true ? (
                            <span className="inline-block text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border border-green-400/30 bg-green-400/10 text-green-400">
                              Approved ✓
                            </span>
                          ) : (
                            <span className="inline-block text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#C41E1E]/30 bg-[#C41E1E]/10 text-[#C41E1E]">
                              Changes Requested
                            </span>
                          )}
                          {item.client_note && (
                            <p className="text-[10px] font-barlow text-brand-muted leading-tight">"{item.client_note}"</p>
                          )}
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
                  Thanks — {tenant.name} has been notified and will follow up shortly.
                </p>
                <button
                  type="button"
                  onClick={() => router.push("/portal")}
                  className="mt-3 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
                >
                  ← Back to My Orders
                </button>
              </div>
            </div>
          )}

          {/* Concepts CTA */}
          {order.has_concepts && order.stage !== "files_sent" && (
            <a
              href={`/orders/${order.id}/concepts`}
              className="block w-full py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest text-center
                border border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-brand-bg transition-all duration-200"
            >
              View & Select Concepts →
            </a>
          )}

          {/* Tracking info */}
          {order.tracking_number && (
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-display uppercase tracking-wider text-brand-muted">Tracking</p>
                <p className="text-sm font-barlow text-brand-text font-mono mt-0.5">{order.tracking_number}</p>
              </div>
            </div>
          )}

          {order.estimated_delivery && (
            <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
              <p className="text-xs font-display uppercase tracking-wider text-brand-muted">Estimated Delivery</p>
              <p className="text-sm font-barlow text-brand-text mt-0.5">
                {new Date(order.estimated_delivery).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          )}

          {/* ── Final Files ───────────────────────────────────────────────── */}
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
                  <div
                    key={f.id}
                    className={`flex items-center gap-4 px-4 py-3.5 ${i < order.files.length - 1 ? "border-b border-brand-border" : ""}`}
                  >
                    {/* File icon */}
                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-brand-bg border border-brand-border flex items-center justify-center">
                      <svg className="w-4 h-4 text-brand-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      {f.label && (
                        <p className="text-[9px] font-display uppercase tracking-wider text-brand-primary mb-0.5">{f.label}</p>
                      )}
                      <p className="text-sm font-barlow text-brand-text truncate">{f.file_name}</p>
                      {f.file_size && (
                        <p className="text-[10px] font-barlow text-brand-muted">
                          {f.file_size > 1024 * 1024
                            ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB`
                            : `${(f.file_size / 1024).toFixed(0)} KB`}
                        </p>
                      )}
                    </div>
                    <a
                      href={f.file_url}
                      download={f.file_name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
                    >
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

          {/* Full pipeline timeline */}
          <div>
            <p className="text-xs font-display uppercase tracking-widest text-brand-muted mb-5">Full Timeline</p>
            <div className="space-y-0">
              {PIPELINE.map((step, i) => {
                const isDone     = i < currentIndex;
                const isCurrent  = i === currentIndex;
                const isUpcoming = i > currentIndex;

                return (
                  <div key={step.stage} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-colors
                        ${isDone     ? "bg-brand-primary border-brand-primary" : ""}
                        ${isCurrent  ? "bg-brand-bg border-brand-primary" : ""}
                        ${isUpcoming ? "bg-brand-surface border-brand-border" : ""}
                      `}>
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
                      {isCurrent && (
                        <p className="text-xs text-brand-muted font-barlow mt-0.5">{step.description}</p>
                      )}
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

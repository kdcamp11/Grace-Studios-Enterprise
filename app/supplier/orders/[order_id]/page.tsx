"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import MobileDropdown from "@/components/MobileDropdown";
import { useTenant } from "@/lib/tenant/context";
import type { RosterPlayer } from "@/types/database";
import { WORKFLOW_STAGE_MAP } from "@/lib/workflow/stage-map";

interface Brief {
  design_system: string | null;
  jersey_cut: string | null;
  sublimated: boolean | null;
  primary_colors: string | null;
  secondary_colors: string | null;
  accent_color: string | null;
  number_style: string | null;
  player_names: boolean;
  logo_placement: string | null;
  logos_to_include: string | null;
  sponsor_text: string | null;
  negative_references: string | null;
  vision_prompt: string | null;
  reference_image_url: string | null;
  player_roster: RosterPlayer[] | null;
}

interface MediaItem {
  id: string;
  created_at: string;
  media_url: string;
  media_type: "photo" | "video";
  caption: string | null;
  admin_approved: boolean | null;
  admin_note: string | null;
  client_visible: boolean;
  client_approved: boolean | null;
}

interface OrderDetail {
  id: string;
  order_number: string;
  stage: string;
  created_at: string;
  estimated_delivery: string | null;
  tracking_number: string | null;
  production_file_url: string | null;
  deposit_paid: boolean;
  balance_paid: boolean;
  client: { name: string; email: string; sport: string; city: string };
  brief: Brief | null;
  concepts: { id: string; image_url: string; concept_number: number }[];
  media: MediaItem[];
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="py-2 border-b border-brand-border last:border-0">
      <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted mb-0.5">{label}</p>
      <p className="text-sm font-barlow text-brand-text">{value}</p>
    </div>
  );
}

// ── Stage-specific action panel ───────────────────────────────────────────────

function ActionPanel({
  order,
  tenant,
  onAction,
  onUploadComplete,
}: {
  order: OrderDetail;
  tenant: { name: string };
  onAction: (action: string, extra?: Record<string, string>) => Promise<void>;
  onUploadComplete: (items: MediaItem[]) => void;
}) {
  const supabase = useRef(createClient()).current;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState("");
  const [trackingInput, setTrackingInput] = useState(order.tracking_number ?? "");
  const [uploadError, setUploadError] = useState("");
  const [uploadDone, setUploadDone] = useState(false);

  const { stage, deposit_paid, balance_paid } = order;

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setBusy(true);
    setUploadError("");
    setUploadDone(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }

    const inserted: MediaItem[] = [];

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const ext = file.name.split(".").pop();
      const path = `${order.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from("first-piece-media")
        .upload(path, file, { upsert: false });

      if (storageErr) {
        setUploadError(`Upload failed: ${storageErr.message}`);
        setBusy(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("first-piece-media")
        .getPublicUrl(path);

      const { data: row, error: dbErr } = await supabase
        .from("first_piece_media")
        .insert({
          order_id: order.id,
          uploaded_by: user.id,
          media_url: publicUrl,
          media_type: isVideo ? "video" : "photo",
          caption: caption || null,
        })
        .select()
        .single();

      if (dbErr) {
        setUploadError(`Database error: ${dbErr.message}`);
        setBusy(false);
        return;
      }

      inserted.push(row as MediaItem);
    }

    onUploadComplete(inserted);
    setCaption("");
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
    setUploadDone(true);
    setTimeout(() => setUploadDone(false), 5000);
  }

  // ── Awaiting Release ──
  if (stage === "sent_to_supplier" || stage === "files_sent") {
    return (
      <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-4">
        <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Production Status</p>
        <div className="rounded-lg bg-brand-bg border border-brand-border px-4 py-3">
          <p className="text-sm font-barlow text-brand-muted">
            {tenant.name} is preparing the production package. You&apos;ll be able to start once files are released.
          </p>
        </div>
        {!deposit_paid && (
          <div className="rounded-lg bg-amber-400/5 border border-amber-400/30 px-4 py-3">
            <p className="text-xs font-barlow text-amber-400">
              First payment has not yet been confirmed — production will begin once deposit is cleared.
            </p>
          </div>
        )}
        {stage === "files_sent" && deposit_paid && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); await onAction("start_first_piece"); setBusy(false); }}
            className="w-full py-3.5 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {busy ? "Confirming…" : "Confirm Receipt & Start First Piece →"}
          </button>
        )}
      </div>
    );
  }

  // ── First Piece In Progress / Revision ──
  if (stage === "first_piece_in_progress" || stage === "first_piece_revision") {
    const isRevision = stage === "first_piece_revision";
    const hasUploads = order.media.length > 0;
    return (
      <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
        <div>
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary">
            {isRevision ? "Revision Requested" : "First Piece Production"}
          </p>
          {isRevision && (
            <p className="text-sm font-barlow text-amber-400 mt-1">
              {tenant.name} has requested changes. Review the notes below, then upload new media and resubmit.
            </p>
          )}
          {!isRevision && (
            <p className="text-xs font-barlow text-brand-muted mt-1">
              Upload photos or video of the completed first piece. {tenant.name} will review before the client sees them. Upload up to 5 files.
            </p>
          )}
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label className="block text-[10px] font-display uppercase tracking-wider text-brand-muted mb-2">
              Select Files (photos or video, up to 5)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              required
              className="w-full text-sm font-barlow text-brand-muted file:mr-3 file:py-2 file:px-4
                file:rounded-lg file:border file:border-brand-border file:bg-brand-surface
                file:text-xs file:font-display file:uppercase file:tracking-wider file:text-brand-text
                file:cursor-pointer hover:file:border-brand-primary hover:file:text-brand-primary
                file:transition-all cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-[10px] font-display uppercase tracking-wider text-brand-muted mb-2">
              Caption (optional)
            </label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="e.g. Front view, size L sample"
              className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
            />
          </div>
          {uploadError && (
            <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">{uploadError}</p>
          )}
          {uploadDone && (
            <p className="text-green-400 text-sm font-barlow bg-green-400/10 border border-green-400/30 rounded-lg px-4 py-3">
              ✓ Uploaded. Add more or submit for review below.
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest border border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-primary disabled:opacity-40 transition-all"
          >
            {busy ? "Uploading…" : "Upload Files"}
          </button>
        </form>

        {hasUploads && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); await onAction(isRevision ? "resubmit_for_review" : "submit_for_review"); setBusy(false); }}
            className="w-full py-3.5 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_2px_12px_rgba(196,160,30,0.25)]"
          >
            {busy ? "Submitting…" : `Submit ${order.media.length} Upload${order.media.length !== 1 ? "s" : ""} for Review →`}
          </button>
        )}
        {!hasUploads && (
          <p className="text-[10px] font-barlow text-brand-muted text-center">
            Upload at least one photo or video to submit for review.
          </p>
        )}
      </div>
    );
  }

  // ── First Piece Review (awaiting GE/client) ──
  if (stage === "first_piece_review") {
    return (
      <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-3">
        <p className="text-xs font-display uppercase tracking-widest text-brand-primary">First Piece Review</p>
        <div className="rounded-lg bg-brand-bg border border-brand-border px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <p className="text-sm font-barlow text-brand-muted">
            Your uploads are under review by {tenant.name} and the client. You&apos;ll be notified once approved.
          </p>
        </div>
      </div>
    );
  }

  // ── Bulk Production ──
  if (stage === "bulk_production") {
    if (!balance_paid) {
      return (
        <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-3">
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Bulk Production</p>
          <div className="rounded-lg bg-amber-400/5 border border-amber-400/30 px-4 py-3">
            <p className="text-sm font-barlow text-amber-400">
              Final payment has not been confirmed. Bulk production should not proceed until payment is cleared.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-4">
        <div>
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Bulk Production</p>
          <p className="text-xs font-barlow text-brand-muted mt-1">
            Manufacture the full roster order. Mark complete when all pieces have been produced.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => { setBusy(true); await onAction("complete_bulk"); setBusy(false); }}
          className="w-full py-3.5 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_2px_12px_rgba(196,160,30,0.25)]"
        >
          {busy ? "Updating…" : "Mark Bulk Production Complete →"}
        </button>
      </div>
    );
  }

  // ── QC / Tracking ──
  if (stage === "qc_verified") {
    const hasTracking = !!order.tracking_number;
    return (
      <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-5">
        <div>
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Supplier QC & Shipment</p>
          <p className="text-xs font-barlow text-brand-muted mt-1">
            Complete quality inspection and enter the tracking number before marking as shipped.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block text-[10px] font-display uppercase tracking-wider text-brand-muted">
            Tracking Number {!hasTracking && <span className="text-[#C41E1E]">*</span>}
          </label>
          <input
            type="text"
            value={trackingInput}
            onChange={(e) => setTrackingInput(e.target.value)}
            placeholder="e.g. 1Z999AA10123456784"
            className="w-full bg-brand-bg border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
          />
        </div>

        {!hasTracking && (
          <button
            type="button"
            disabled={busy || !trackingInput.trim()}
            onClick={async () => {
              setBusy(true);
              await onAction("update_tracking", { tracking_number: trackingInput });
              setBusy(false);
            }}
            className="w-full py-3 rounded-lg font-display font-bold text-xs uppercase tracking-widest border border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {busy ? "Saving…" : "Save Tracking Number"}
          </button>
        )}

        <button
          type="button"
          disabled={busy || !trackingInput.trim()}
          onClick={async () => {
            setBusy(true);
            await onAction("mark_shipped", { tracking_number: trackingInput });
            setBusy(false);
          }}
          className="w-full py-3.5 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_2px_12px_rgba(196,160,30,0.25)]"
        >
          {busy ? "Updating…" : "Mark as Shipped →"}
        </button>
      </div>
    );
  }

  // ── Shipped / Delivered ──
  if (stage === "shipped" || stage === "delivered" || stage === "complete") {
    return (
      <div className="bg-brand-surface border border-green-400/30 rounded-xl p-6 space-y-3">
        <p className="text-xs font-display uppercase tracking-widest text-green-400">
          {stage === "delivered" || stage === "complete" ? "Delivered" : "Shipped"}
        </p>
        {order.tracking_number && (
          <div className="rounded-lg bg-brand-bg border border-brand-border px-4 py-3">
            <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted mb-0.5">Tracking</p>
            <p className="text-sm font-barlow text-brand-text font-medium">{order.tracking_number}</p>
          </div>
        )}
        <p className="text-xs font-barlow text-brand-muted">
          {stage === "shipped" ? "Order is in transit to the client." : "Order has been delivered. Production complete."}
        </p>
      </div>
    );
  }

  return null;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupplierOrderPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const tenant = useTenant();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState("");
  const [isAdminView, setIsAdminView] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const profile = await getProfile();
      if (profile && profile.role !== "supplier" && profile.role !== "admin") { router.replace("/portal"); return; }
      if (profile?.role === "admin") setIsAdminView(true);

      // Use admin API to bypass RLS — supplier assignment enforced server-side
      const res = await fetch(`/api/supplier/orders/${order_id}`);
      if (!res.ok) { setLoading(false); return; }

      const d = await res.json() as {
        order: OrderDetail;
        brief: OrderDetail["brief"] | null;
        concepts: OrderDetail["concepts"];
        media: MediaItem[];
      };

      if (!d.order) { setLoading(false); return; }
      setOrder({
        ...d.order,
        brief: d.brief ?? null,
        concepts: d.concepts ?? [],
        media: d.media ?? [],
      });
      setLoading(false);
    }
    load();
  }, [supabase, order_id, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleAction(action: string, extra?: Record<string, string>) {
    setActionError("");
    const res = await fetch(`/api/supplier/orders/${order_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setActionError(json.error ?? "Something went wrong. Please try again.");
      return;
    }
    router.push("/supplier?updated=1");
  }

  function handleUploadComplete(items: MediaItem[]) {
    setOrder((prev) => prev ? { ...prev, media: [...items, ...prev.media] } : prev);
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
      <div className="min-h-screen bg-brand-bg flex items-center justify-center flex-col gap-4">
        <p className="text-brand-muted font-barlow">Order not found or not assigned to you.</p>
        <button type="button" onClick={() => router.push("/supplier")} className="text-xs font-display uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors">
          ← Back to Production Workspace
        </button>
      </div>
    );
  }

  const roster = order.brief?.player_roster ?? [];
  const rejectedMedia = order.media.filter((m) => m.admin_approved === false);

  // Use the canonical supplier labels from the shared workflow stage map.
  const stageDisplayLabel = (stage: string): string =>
    WORKFLOW_STAGE_MAP[stage]?.supplierLabel ?? WORKFLOW_STAGE_MAP[stage]?.adminLabel ?? stage;

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">Admin View: Supplier Portal</span>
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="ml-auto text-xs font-display font-bold uppercase tracking-wider text-amber-600 hover:text-amber-800 transition-colors"
          >
            ← Admin Portal
          </button>
        </div>
      )}
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TenantLogo className="h-7" href="/supplier" />
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Production Workspace
          </a>
        </div>
        <div className="hidden lg:flex items-center gap-5">
          <button type="button" onClick={() => router.push("/supplier")} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
        <div className="lg:hidden">
          <MobileDropdown
            groups={[
              [{ label: "← Back to Board", href: "/supplier" }],
              [{ label: "Sign Out", onClick: signOut }],
            ]}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full space-y-8">

        {/* Order header */}
        <div>
          <p className="text-xs font-display uppercase tracking-widest text-brand-muted">Production Order</p>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text mt-1">
            {order.order_number || order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-sm text-brand-muted font-barlow mt-1">
            {order.client.name} · {order.client.sport} · {order.client.city}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="inline-block text-[10px] font-display uppercase tracking-wider px-2.5 py-1 rounded-full border border-brand-primary/30 bg-brand-primary/10 text-brand-primary">
              {stageDisplayLabel(order.stage)}
            </span>
            {!order.deposit_paid && (
              <span className="text-[10px] font-display uppercase tracking-wider px-2.5 py-1 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400">
                Deposit Pending
              </span>
            )}
            {order.deposit_paid && !order.balance_paid && (
              <span className="text-[10px] font-display uppercase tracking-wider px-2.5 py-1 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400">
                Final Payment Pending
              </span>
            )}
            {order.estimated_delivery && (
              <span className="text-[10px] font-barlow text-brand-muted">
                Est. {new Date(order.estimated_delivery).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>
        </div>

        {/* Changes Requested Banner */}
        {rejectedMedia.length > 0 && (
          <div className="border border-[#C41E1E]/40 bg-[#C41E1E]/5 rounded-xl p-5 flex gap-4">
            <div className="w-9 h-9 rounded-full bg-[#C41E1E]/10 border border-[#C41E1E]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-[#C41E1E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="font-display font-bold uppercase tracking-wide text-[#C41E1E] text-sm">
                Changes Requested: {rejectedMedia.length} item{rejectedMedia.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs font-barlow text-brand-muted mt-1 leading-relaxed">
                {tenant.name} has requested changes. Review the notes and re-upload corrected media.
              </p>
              {rejectedMedia.map((m) => m.admin_note && (
                <p key={m.id} className="text-xs font-barlow text-[#C41E1E]/80 mt-1.5 pl-3 border-l border-[#C41E1E]/30">
                  &ldquo;{m.admin_note}&rdquo;
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Action error */}
        {actionError && (
          <div className="border border-[#C41E1E]/40 bg-[#C41E1E]/5 rounded-xl px-4 py-3">
            <p className="text-sm font-barlow text-[#C41E1E]">{actionError}</p>
          </div>
        )}

        {/* Stage-specific action panel */}
        <ActionPanel
          order={order}
          tenant={tenant}
          onAction={handleAction}
          onUploadComplete={handleUploadComplete}
        />

        {/* Production Artwork File */}
        {order.production_file_url && (
          <div className="bg-brand-surface border border-brand-primary/30 rounded-xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary">Production Artwork File</p>
              <p className="text-[10px] text-brand-muted font-barlow mt-0.5">
                Full vector artwork with zone colors, logos, names &amp; numbers.
              </p>
            </div>
            <a
              href={order.production_file_url}
              download={`production-artwork-${order.order_number}.svg`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg font-display font-bold text-xs uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download SVG
            </a>
          </div>
        )}

        {/* Approved Concept */}
        {order.concepts.length > 0 && (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-4">
              Approved Design Concept{order.concepts.length > 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-3">
              {order.concepts.map((c) => (
                <div key={c.id} className="rounded-xl overflow-hidden border border-brand-primary/40 w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.image_url} alt={`Concept ${c.concept_number}`} className="w-full aspect-square object-cover" />
                  <p className="text-[10px] font-barlow text-brand-primary text-center py-1.5 bg-brand-primary/10">
                    Concept {c.concept_number} · Approved
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Design Specifications */}
        {order.brief && (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-6 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Design Specifications</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <Field label="Design System"   value={order.brief.design_system} />
              <Field label="Jersey Cut"       value={order.brief.jersey_cut} />
              <Field label="Construction"     value={
                order.brief.sublimated === true  ? "Sublimated" :
                order.brief.sublimated === false ? "Tackle Twill" : null
              } />
              <Field label="Number Style"     value={order.brief.number_style} />
              <Field label="Logo Placement"   value={order.brief.logo_placement?.replace(/_/g, " ")} />
              <Field label="Player Names"     value={order.brief.player_names ? "Yes" : "No"} />
              <Field label="Logos to Include" value={order.brief.logos_to_include} />
              <Field label="Sponsor Text"     value={order.brief.sponsor_text} />
              <Field label="Avoid"            value={order.brief.negative_references} />
            </div>
            <div>
              <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted mb-3">Colors</p>
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "Primary",   val: order.brief.primary_colors },
                  { label: "Secondary", val: order.brief.secondary_colors },
                  { label: "Accent",    val: order.brief.accent_color },
                ].filter((c) => c.val).map((c) => (
                  <div key={c.label} className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full border border-brand-border shadow-inner flex-shrink-0"
                      style={{ backgroundColor: c.val ?? "transparent" }}
                    />
                    <div>
                      <p className="text-[9px] font-display uppercase tracking-wider text-brand-muted">{c.label}</p>
                      <p className="text-xs font-barlow text-brand-text font-medium">{c.val}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {order.brief.vision_prompt && (
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted mb-1">Design Notes</p>
                <p className="text-sm font-barlow text-brand-text leading-relaxed bg-brand-bg rounded-lg p-3">
                  {order.brief.vision_prompt}
                </p>
              </div>
            )}
            {order.brief.reference_image_url && (
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted mb-2">Reference Image</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.brief.reference_image_url}
                  alt="Reference"
                  className="rounded-lg max-h-48 object-contain border border-brand-border"
                />
              </div>
            )}
          </div>
        )}

        {/* Player Roster */}
        {roster.length > 0 && (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-4">
              Player Roster: {roster.length} Players
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-barlow">
                <thead>
                  <tr className="border-b border-brand-border">
                    {["#", "Name", "Number", "Size", "Cut"].map((h) => (
                      <th key={h} className="text-left text-[10px] font-display uppercase tracking-wider text-brand-muted pb-3 pr-4">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((player, i) => (
                    <tr key={i} className="border-b border-brand-border/50 last:border-0">
                      <td className="py-2.5 pr-4 text-brand-muted text-xs">{i + 1}</td>
                      <td className="py-2.5 pr-4 text-brand-text font-medium">{player.name}</td>
                      <td className="py-2.5 pr-4 text-brand-text">{player.number}</td>
                      <td className="py-2.5 pr-4 text-brand-text">{player.size}</td>
                      <td className="py-2.5 pr-4 text-brand-muted capitalize">{player.cut}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* First Piece Media Gallery */}
        {order.media.length > 0 && (
          <div className="bg-brand-surface border border-brand-border rounded-xl p-6">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-4">
              Submitted Media ({order.media.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {order.media.map((item) => (
                <MediaCard key={item.id} item={item} />
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

function MediaCard({ item }: { item: MediaItem }) {
  const statusColor =
    item.admin_approved === true  ? "text-green-400 border-green-400/30 bg-green-400/10" :
    item.admin_approved === false ? "text-[#C41E1E] border-[#C41E1E]/30 bg-[#C41E1E]/10" :
    "text-amber-400 border-amber-400/30 bg-amber-400/10";

  const statusLabel =
    item.admin_approved === true  ? "Approved" :
    item.admin_approved === false ? "Changes Requested" :
    "Pending Review";

  return (
    <div className="rounded-xl overflow-hidden border border-brand-border bg-brand-surface">
      {item.media_type === "video" ? (
        <video src={item.media_url} controls className="w-full aspect-video object-cover bg-black" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.media_url} alt={item.caption ?? "First piece"} className="w-full aspect-square object-cover" />
      )}
      <div className="p-2.5 space-y-1.5">
        <span className={`inline-block text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
          {statusLabel}
        </span>
        {item.caption && (
          <p className="text-[10px] font-barlow text-brand-muted leading-tight">{item.caption}</p>
        )}
        {item.admin_note && item.admin_approved === false && (
          <p className="text-[10px] font-barlow text-[#C41E1E] leading-tight">Note: {item.admin_note}</p>
        )}
        {item.client_approved === true && (
          <p className="text-[10px] font-barlow text-green-400">Client approved ✓</p>
        )}
      </div>
    </div>
  );
}

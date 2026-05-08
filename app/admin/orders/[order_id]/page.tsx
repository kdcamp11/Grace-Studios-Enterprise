"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/admin";
import { getProfile } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";
import type { RosterPlayer } from "@/types/database";
import type { OrderStage } from "@/types/database";

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
  client_note: string | null;
}

const PIPELINE: OrderStage[] = [
  "onboarding",
  "design_confirmed",
  "files_sent",
  "first_piece_in_progress",
  "first_piece_review",
  "bulk_production",
  "qc_verified",
  "shipped",
  "delivered",
  "complete",
];

const STAGE_LABELS: Record<OrderStage, string> = {
  onboarding: "Brief Submitted",
  design_confirmed: "Concepts Generating",
  files_sent: "Design Approved",
  first_piece_in_progress: "First Piece",
  first_piece_review: "First Piece Review",
  bulk_production: "Bulk Production",
  qc_verified: "QC Verified",
  shipped: "Shipped",
  delivered: "Delivered",
  complete: "Complete",
};

interface Brief {
  design_system: string | null;
  jersey_cut: string | null;
  sublimated: boolean | null;
  gs_logo_placement: string | null;
  vision_prompt: string | null;
  number_style: string | null;
  logos_to_include: string | null;
  sponsor_text: string | null;
  negative_references: string | null;
  reference_image_url: string | null;
  logo_url: string | null;
  ai_prompt: string | null;
  player_names: boolean | null;
  player_roster: RosterPlayer[] | null;
  primary_colors: string | null;
  secondary_colors: string | null;
  accent_color: string | null;
}

interface Concept {
  id: string;
  concept_number: number;
  image_url: string;
  selected: boolean;
}

interface SupplierProfile {
  id: string;
  full_name: string | null;
  company: string | null;
  email: string;
}

interface OrderFile {
  id: string;
  created_at: string;
  file_url: string;
  file_name: string;
  file_size: number | null;
  file_type: string | null;
  label: string | null;
  client_visible: boolean;
}

interface OrderDetail {
  id: string;
  order_number: string;
  stage: OrderStage;
  created_at: string;
  approved_at: string | null;
  estimated_delivery: string | null;
  tracking_number: string | null;
  supplier: string | null;
  supplier_user_id: string | null;
  notes: string | null;
  client: { name: string; email: string; sport: string; city: string };
  brief: Brief | null;
  concepts: Concept[];
  media: MediaItem[];
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-4 py-2 border-b border-gs-border last:border-0">
      <span className="text-xs font-display uppercase tracking-wider text-gs-muted w-40 flex-shrink-0">{label}</span>
      <span className="text-sm font-barlow text-gs-white">{value}</span>
    </div>
  );
}

export default function AdminOrderPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageSaving, setStageSaving] = useState(false);
  const [trackingInput, setTrackingInput] = useState("");
  const [deliveryInput, setDeliveryInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [suppliers, setSuppliers] = useState<SupplierProfile[]>([]);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierSaved, setSupplierSaved] = useState(false);
  const [orderFiles, setOrderFiles] = useState<OrderFile[]>([]);
  const [fileLabel, setFileLabel] = useState("Print-Ready Files");
  const [fileUploading, setFileUploading] = useState(false);
  const [fileSaved, setFileSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const profile = await getProfile();
      if (!user || (!isAdmin(user.email) && profile?.role !== "admin")) { router.replace("/portal"); return; }

      const [{ data: o }, { data: brief }, { data: concepts }, { data: media }, { data: supplierProfiles }, { data: files }] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_number, stage, created_at, approved_at, estimated_delivery, tracking_number, supplier, supplier_user_id, notes, clients(name, email, sport, city)")
          .eq("id", order_id)
          .single(),
        supabase.from("briefs").select("*").eq("order_id", order_id).single(),
        supabase.from("concepts").select("id, concept_number, image_url, selected").eq("order_id", order_id).order("concept_number"),
        supabase.from("first_piece_media").select("*").eq("order_id", order_id).order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, company, email").eq("role", "supplier"),
        supabase.from("order_files").select("id, created_at, file_url, file_name, file_size, file_type, label, client_visible").eq("order_id", order_id).order("created_at"),
      ]);

      if (!o) { setLoading(false); return; }

      const client = Array.isArray(o.clients) ? o.clients[0] : o.clients;
      setOrder({
        id: o.id,
        order_number: o.order_number,
        stage: o.stage as OrderStage,
        created_at: o.created_at,
        approved_at: o.approved_at,
        estimated_delivery: o.estimated_delivery,
        tracking_number: o.tracking_number,
        supplier: o.supplier,
        supplier_user_id: o.supplier_user_id ?? null,
        notes: o.notes,
        client: client as { name: string; email: string; sport: string; city: string },
        brief: brief ?? null,
        concepts: (concepts ?? []) as Concept[],
        media: (media ?? []) as MediaItem[],
      });
      setSuppliers((supplierProfiles ?? []) as SupplierProfile[]);
      setOrderFiles((files ?? []) as OrderFile[]);
      setTrackingInput(o.tracking_number ?? "");
      setDeliveryInput(o.estimated_delivery?.slice(0, 10) ?? "");
      setNotesInput(o.notes ?? "");
      setLoading(false);
    });
  }, [supabase, order_id, router]);

  async function updateStage(newStage: OrderStage) {
    if (!order || newStage === order.stage) return;
    setStageSaving(true);
    await supabase.from("orders").update({ stage: newStage }).eq("id", order_id);
    await supabase.from("stage_log").insert({
      order_id,
      from_stage: order.stage,
      to_stage: newStage,
      changed_by: "admin",
    });
    setOrder((prev) => prev ? { ...prev, stage: newStage } : prev);
    setStageSaving(false);
  }

  async function assignSupplier(supplierUserId: string | null) {
    if (!order) return;
    setSupplierSaving(true);
    await supabase.from("orders")
      .update({ supplier_user_id: supplierUserId })
      .eq("id", order_id);
    setOrder((prev) => prev ? { ...prev, supplier_user_id: supplierUserId } : prev);
    setSupplierSaving(false);
    setSupplierSaved(true);
    setTimeout(() => setSupplierSaved(false), 2500);
  }

  async function reviewMedia(mediaId: string, approved: boolean) {
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const note = reviewNote || null;
    await supabase.from("first_piece_media").update({
      admin_approved:    approved,
      admin_note:        note,
      admin_reviewed_at: now,
      admin_reviewed_by: user?.id ?? null,
      client_visible:    approved,           // auto-publish when approved
    }).eq("id", mediaId);

    setOrder((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        media: prev.media.map((m) =>
          m.id === mediaId
            ? { ...m, admin_approved: approved, admin_note: note, client_visible: approved }
            : m
        ),
      };
    });

    // Fire email notifications
    if (approved) {
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "first_piece_ready", order_id }),
      }).catch(() => {});
    } else {
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "changes_requested", order_id, admin_note: note }),
      }).catch(() => {});
    }

    setReviewingId(null);
    setReviewNote("");
  }

  async function saveDetails() {
    setSaving(true);
    await supabase.from("orders").update({
      tracking_number: trackingInput || null,
      estimated_delivery: deliveryInput || null,
      notes: notesInput || null,
    }).eq("id", order_id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function uploadFile(file: File) {
    setFileUploading(true);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${order_id}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("order-files")
      .upload(path, file);

    if (uploadError) {
      console.error("Upload error:", uploadError.message);
      setFileUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("order-files").getPublicUrl(path);
    const { data: { user } } = await supabase.auth.getUser();

    const { data: row } = await supabase
      .from("order_files")
      .insert({
        order_id,
        uploaded_by: user?.id,
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || null,
        label: fileLabel.trim() || null,
        client_visible: true,
      })
      .select()
      .single();

    if (row) setOrderFiles((prev) => [...prev, row as OrderFile]);
    setFileUploading(false);
    setFileSaved(true);
    setTimeout(() => setFileSaved(false), 2500);
  }

  async function deleteFile(fileId: string, filePath: string) {
    await supabase.from("order_files").delete().eq("id", fileId);
    // Extract storage path from URL
    const storagePath = filePath.split("/order-files/")[1];
    if (storagePath) await supabase.storage.from("order-files").remove([storagePath]);
    setOrderFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gs-dark flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-gs-dark flex items-center justify-center">
        <p className="text-gs-muted font-barlow">Order not found.</p>
      </div>
    );
  }

  const currentStageIndex = PIPELINE.indexOf(order.stage);

  const STAGE_NEXT: Partial<Record<OrderStage, string>> = {
    onboarding:              "Concepts are generating — check back soon or trigger manually.",
    design_confirmed:        "Client is reviewing concepts and will select one.",
    files_sent:              "Assign a production partner and upload production files below.",
    first_piece_in_progress: "Waiting for supplier to submit first piece photos.",
    first_piece_review:      "Scroll down to review supplier uploads before sending to client.",
    bulk_production:         "Bulk production underway — supplier will mark complete when done.",
    qc_verified:             "Add a tracking number below, then advance to Shipped.",
    shipped:                 "Move to Delivered once the client confirms receipt.",
    delivered:               "Mark as Complete to close out this order.",
    complete:                "This order is complete.",
  };
  const nextHint = STAGE_NEXT[order.stage];

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      <header className="border-b border-gs-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <GraceLogo className="h-7" href="/admin" />
          <a href="/admin" className="text-xs font-display font-bold uppercase tracking-widest text-gs-gold hover:text-gs-gold-light transition-colors">
            Admin Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/admin" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-3xl space-y-8">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-gs-muted">Order</p>
              <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-gs-white mt-1">
                {order.order_number || order.id.slice(0, 8).toUpperCase()}
              </h1>
              <p className="text-sm text-gs-muted font-barlow mt-1">
                {order.client.name} · {order.client.sport} · {order.client.city}
              </p>
              <p className="text-xs text-gs-muted font-barlow">{order.client.email}</p>
            </div>
            <a
              href={`/orders/${order.id}/concepts`}
              target="_blank"
              className="flex-shrink-0 px-4 py-2 rounded-lg border border-gs-border text-gs-muted font-display font-bold text-xs uppercase tracking-widest hover:border-gs-gold hover:text-gs-gold transition-all"
            >
              Client View ↗
            </a>
          </div>

          {/* Stage pipeline */}
          <div className="bg-gs-dark-3 border border-gs-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-display uppercase tracking-widest text-gs-gold">Pipeline Stage</p>
              <span className="text-[10px] font-display uppercase tracking-wider text-gs-muted">
                {currentStageIndex + 1} / {PIPELINE.length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {PIPELINE.map((stage, i) => {
                const isDone    = i < currentStageIndex;
                const isCurrent = i === currentStageIndex;
                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={() => updateStage(stage)}
                    disabled={stageSaving}
                    className={`relative text-left p-3 rounded-lg border text-xs font-display uppercase tracking-wide transition-all disabled:cursor-wait
                      ${isCurrent
                        ? "border-gs-gold bg-gs-gold/10 text-gs-gold shadow-[0_0_12px_rgba(196,160,30,0.15)]"
                        : isDone
                          ? "border-green-500/40 bg-green-500/5 text-green-400 hover:border-green-400/60 hover:text-green-300"
                          : "border-gs-border text-gs-border hover:border-gs-muted hover:text-gs-white"
                      }`}
                  >
                    <span className="flex items-center justify-between mb-1">
                      <span style={{ fontSize: "10px" }} className={isDone ? "text-green-500/60" : "text-gs-muted"}>
                        {i + 1}
                      </span>
                      {isDone && (
                        <svg className="w-3 h-3 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-gs-gold animate-pulse" />
                      )}
                    </span>
                    {STAGE_LABELS[stage]}
                  </button>
                );
              })}
            </div>
            {nextHint && (
              <div className="mt-4 pt-4 border-t border-gs-border flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-gs-gold mt-1.5 flex-shrink-0" />
                <p className="text-xs font-barlow text-gs-muted leading-relaxed">
                  <span className="text-gs-white font-medium">Next: </span>{nextHint}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Brief details */}
            {order.brief && (
              <div className="bg-gs-dark-3 border border-gs-border rounded-xl p-5">
                <p className="text-xs font-display uppercase tracking-widest text-gs-gold mb-3">Brief</p>
                <DetailRow label="Design System" value={order.brief.design_system} />
                <DetailRow label="Cut" value={order.brief.jersey_cut} />
                <DetailRow label="Construction" value={order.brief.sublimated === true ? "Sublimated" : order.brief.sublimated === false ? "Tackle Twill" : null} />
                <DetailRow label="GS Logo" value={order.brief.gs_logo_placement?.replace("_", " ")} />
                <DetailRow label="Number Style" value={order.brief.number_style} />
                <DetailRow label="Logos" value={order.brief.logos_to_include} />
                <DetailRow label="Sponsor" value={order.brief.sponsor_text} />
                <DetailRow label="Avoid" value={order.brief.negative_references} />
                <DetailRow label="Vision" value={order.brief.vision_prompt} />
                {order.brief.logo_url && (
                  <div className="pt-3">
                    <p className="text-xs font-display uppercase tracking-wider text-gs-muted mb-2">Team Logo</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={order.brief.logo_url} alt="Team logo" className="h-16 object-contain" />
                  </div>
                )}
                {order.brief.ai_prompt && (
                  <div className="pt-3">
                    <p className="text-xs font-display uppercase tracking-wider text-gs-muted mb-2">AI Design Brief</p>
                    <p className="text-xs font-barlow text-gs-muted leading-relaxed">{order.brief.ai_prompt}</p>
                  </div>
                )}
              </div>
            )}

            {/* Operational fields */}
            <div className="space-y-4">
              <div className="bg-gs-dark-3 border border-gs-border rounded-xl p-5 space-y-4">
                <p className="text-xs font-display uppercase tracking-widest text-gs-gold">Order Details</p>

                {/* Supplier assignment */}
                <div>
                  <label className="block text-xs font-display uppercase tracking-wider text-gs-muted mb-1.5">
                    Production Partner
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={order.supplier_user_id ?? ""}
                      onChange={(e) => assignSupplier(e.target.value || null)}
                      disabled={supplierSaving}
                      className="flex-1 bg-gs-dark border border-gs-border rounded-lg px-3 py-2.5 text-gs-white font-barlow text-sm focus:outline-none focus:border-gs-gold transition-colors disabled:opacity-50"
                    >
                      <option value="">— Unassigned —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.company ?? s.full_name ?? s.email}
                        </option>
                      ))}
                    </select>
                    {supplierSaved && (
                      <span className="flex items-center text-xs font-barlow text-green-400 px-2">
                        Saved ✓
                      </span>
                    )}
                  </div>
                  {suppliers.length === 0 && (
                    <p className="text-[10px] font-barlow text-gs-muted mt-1">
                      No supplier accounts yet — have them sign up at /signup as a Production Partner.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-display uppercase tracking-wider text-gs-muted mb-1.5">Tracking Number</label>
                  <input
                    type="text"
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    placeholder="e.g. 1Z999AA10123456784"
                    className="w-full bg-gs-dark border border-gs-border rounded-lg px-3 py-2.5 text-gs-white font-barlow text-sm placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-display uppercase tracking-wider text-gs-muted mb-1.5">Estimated Delivery</label>
                  <input
                    type="date"
                    value={deliveryInput}
                    onChange={(e) => setDeliveryInput(e.target.value)}
                    className="w-full bg-gs-dark border border-gs-border rounded-lg px-3 py-2.5 text-gs-white font-barlow text-sm focus:outline-none focus:border-gs-gold transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-display uppercase tracking-wider text-gs-muted mb-1.5">Internal Notes</label>
                  <textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    rows={3}
                    placeholder="Any internal notes about this order…"
                    className="w-full bg-gs-dark border border-gs-border rounded-lg px-3 py-2.5 text-gs-white font-barlow text-sm placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveDetails}
                  disabled={saving}
                  className="w-full py-2.5 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-gs-gold text-gs-dark hover:bg-gs-gold-light disabled:opacity-40 transition-all"
                >
                  {saved ? "Saved ✓" : saving ? "Saving…" : "Save Details"}
                </button>
              </div>

              {/* Timestamps */}
              <div className="bg-gs-dark-3 border border-gs-border rounded-xl p-5 space-y-2">
                <p className="text-xs font-display uppercase tracking-widest text-gs-gold mb-3">Timestamps</p>
                <DetailRow label="Submitted" value={new Date(order.created_at).toLocaleString()} />
                {order.approved_at && <DetailRow label="Approved" value={new Date(order.approved_at).toLocaleString()} />}
              </div>
            </div>
          </div>

          {/* Concepts */}
          {order.concepts.length > 0 && (
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-gs-gold mb-4">Concepts</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {order.concepts.map((c) => (
                  <div key={c.id} className={`rounded-xl overflow-hidden border ${c.selected ? "border-gs-gold" : "border-gs-border"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image_url} alt={`Concept ${c.concept_number}`} className="w-full aspect-square object-cover" />
                    <div className={`px-3 py-2 flex items-center gap-1.5 ${c.selected ? "bg-gs-gold/10" : "bg-gs-dark-3"}`}>
                      {c.selected && <span className="w-1.5 h-1.5 rounded-full bg-gs-gold" />}
                      <span className="text-xs font-barlow text-gs-muted">Concept {c.concept_number}</span>
                      {c.selected && <span className="text-xs font-barlow text-gs-gold ml-auto">Selected</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Colors ──────────────────────────────────────────────────────── */}
          {order.brief && (order.brief.primary_colors || order.brief.secondary_colors || order.brief.accent_color) && (
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-gs-gold mb-3">Colors</p>
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "Primary",   value: order.brief.primary_colors },
                  { label: "Secondary", value: order.brief.secondary_colors },
                  { label: "Accent",    value: order.brief.accent_color },
                ].filter((c) => c.value).map((c) =>
                  c.value!.split(",").map((hex) => hex.trim()).filter(Boolean).map((hex) => (
                    <div key={`${c.label}-${hex}`} className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg border border-gs-border flex-shrink-0"
                        style={{ background: hex.startsWith("#") ? hex : `#${hex}` }}
                      />
                      <div>
                        <p className="text-[9px] font-display uppercase tracking-wider text-gs-muted">{c.label}</p>
                        <p className="text-xs font-mono text-gs-white">{hex}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── Roster ───────────────────────────────────────────────────────── */}
          {order.brief?.player_roster && order.brief.player_roster.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-display uppercase tracking-widest text-gs-gold">
                  Player Roster
                </p>
                <span className="text-[10px] font-display uppercase tracking-wider text-gs-muted">
                  {order.brief.player_roster.length} players
                </span>
              </div>
              <div className="border border-gs-border rounded-xl overflow-hidden">
                <table className="w-full text-sm font-barlow">
                  <thead>
                    <tr className="bg-gs-dark-3 border-b border-gs-border">
                      {["#", "Name", "Number", "Size", "Cut"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] font-display uppercase tracking-wider text-gs-muted">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.brief.player_roster.map((player, i) => (
                      <tr key={i} className="border-b border-gs-border/50 last:border-0 hover:bg-gs-dark-3/40">
                        <td className="px-4 py-2.5 text-gs-muted text-xs">{i + 1}</td>
                        <td className="px-4 py-2.5 text-gs-white font-medium">{player.name || "—"}</td>
                        <td className="px-4 py-2.5 text-gs-white">{player.number || "—"}</td>
                        <td className="px-4 py-2.5 text-gs-white">{player.size || "—"}</td>
                        <td className="px-4 py-2.5 text-gs-muted capitalize">{player.cut || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── First Piece Review ──────────────────────────────────────────── */}
          <div className="bg-gs-dark-3 border border-gs-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-display uppercase tracking-widest text-gs-gold">First Piece Review</p>
              {order.media.length > 0 && (
                <span className="text-[10px] font-display uppercase tracking-wider text-gs-muted">
                  {order.media.filter((m) => m.admin_approved === null).length} pending ·{" "}
                  {order.media.filter((m) => m.admin_approved === true).length} approved ·{" "}
                  {order.media.filter((m) => m.client_approved === true).length} client OK
                </span>
              )}
            </div>

            {order.media.length === 0 ? (
              <p className="text-sm font-barlow text-gs-muted">
                No uploads yet. The supplier will post photos and video here once the first piece is ready.
              </p>
            ) : (
              <div className="space-y-4">
                {order.media.map((item) => (
                  <div key={item.id} className="border border-gs-border rounded-xl overflow-hidden">
                    <div className="flex gap-4 p-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden bg-gs-dark border border-gs-border">
                        {item.media_type === "video" ? (
                          <video src={item.media_url} className="w-full h-full object-cover" />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.media_url} alt={item.caption ?? "First piece"} className="w-full h-full object-cover" />
                        )}
                      </div>

                      {/* Details + status */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[9px] font-display uppercase tracking-wider text-gs-muted">
                            {item.media_type} · {new Date(item.created_at).toLocaleDateString()}
                          </span>
                          {/* Admin status badge */}
                          {item.admin_approved === null && (
                            <span className="text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400">
                              Needs Review
                            </span>
                          )}
                          {item.admin_approved === true && (
                            <span className="text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border border-green-400/30 bg-green-400/10 text-green-400">
                              Approved → Client
                            </span>
                          )}
                          {item.admin_approved === false && (
                            <span className="text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border border-[#C41E1E]/30 bg-[#C41E1E]/10 text-[#C41E1E]">
                              Changes Requested
                            </span>
                          )}
                          {/* Client status badge */}
                          {item.client_approved === true && (
                            <span className="text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border border-green-400/30 bg-green-400/10 text-green-400">
                              Client Approved ✓
                            </span>
                          )}
                          {item.client_approved === false && (
                            <span className="text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400">
                              Client Requested Changes
                            </span>
                          )}
                        </div>

                        {item.caption && (
                          <p className="text-xs font-barlow text-gs-white">{item.caption}</p>
                        )}
                        {item.admin_note && (
                          <p className="text-xs font-barlow text-gs-muted">Admin note: {item.admin_note}</p>
                        )}
                        {item.client_note && (
                          <p className="text-xs font-barlow text-amber-400">Client note: {item.client_note}</p>
                        )}

                        {/* Full media link */}
                        <a
                          href={item.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-[10px] font-display uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors"
                        >
                          View full {item.media_type} ↗
                        </a>
                      </div>

                      {/* Review buttons (only for pending) */}
                      {item.admin_approved === null && reviewingId !== item.id && (
                        <div className="flex-shrink-0 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => { setReviewingId(item.id); setReviewNote(""); }}
                            className="px-3 py-1.5 rounded-lg border border-gs-border text-xs font-display uppercase tracking-wider text-gs-muted hover:border-gs-gold hover:text-gs-gold transition-all"
                          >
                            Review
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline review panel */}
                    {reviewingId === item.id && (
                      <div className="border-t border-gs-border bg-gs-dark p-4 space-y-3">
                        <p className="text-[10px] font-display uppercase tracking-wider text-gs-muted">
                          Add a note (optional)
                        </p>
                        <textarea
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          rows={2}
                          placeholder="Feedback for the supplier or internal notes…"
                          className="w-full bg-gs-dark-2 border border-gs-border rounded-lg px-3 py-2.5 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => reviewMedia(item.id, true)}
                            className="flex-1 py-2.5 rounded-lg font-display font-bold text-xs uppercase tracking-widest bg-green-600 text-white hover:bg-green-500 transition-all"
                          >
                            Approve → Send to Client
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewMedia(item.id, false)}
                            className="flex-1 py-2.5 rounded-lg font-display font-bold text-xs uppercase tracking-widest bg-[#C41E1E]/20 text-[#C41E1E] border border-[#C41E1E]/30 hover:bg-[#C41E1E]/30 transition-all"
                          >
                            Request Changes
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReviewingId(null); setReviewNote(""); }}
                            className="px-3 py-2.5 rounded-lg border border-gs-border text-gs-muted hover:text-gs-white font-barlow text-xs transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Final Files ─────────────────────────────────────────────────── */}
          <div className="bg-gs-dark-3 border border-gs-border rounded-xl p-5 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold">Final Production Files</p>
            <p className="text-[11px] font-barlow text-gs-muted">
              Upload print-ready files, vector source, or any deliverables for this order. The client will be able to download these.
            </p>

            {/* Existing files */}
            {orderFiles.length > 0 && (
              <div className="space-y-2">
                {orderFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 bg-gs-dark rounded-lg border border-gs-border">
                    <div className="flex-1 min-w-0">
                      {f.label && (
                        <p className="text-[9px] font-display uppercase tracking-wider text-gs-muted">{f.label}</p>
                      )}
                      <p className="text-sm font-barlow text-gs-white truncate">{f.file_name}</p>
                      {f.file_size && (
                        <p className="text-[10px] font-barlow text-gs-muted">
                          {f.file_size > 1024 * 1024
                            ? `${(f.file_size / 1024 / 1024).toFixed(1)} MB`
                            : `${(f.file_size / 1024).toFixed(0)} KB`}
                        </p>
                      )}
                    </div>
                    <a
                      href={f.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-[10px] font-display uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors"
                    >
                      Open ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => deleteFile(f.id, f.file_url)}
                      className="flex-shrink-0 text-[10px] font-display uppercase tracking-wider text-gs-muted hover:text-[#C41E1E] transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-[10px] font-display uppercase tracking-wider text-gs-muted mb-1.5">
                  File Label
                </label>
                <input
                  type="text"
                  value={fileLabel}
                  onChange={(e) => setFileLabel(e.target.value)}
                  placeholder="e.g. Print-Ready Files, Vector Source"
                  className="w-full bg-gs-dark border border-gs-border rounded-lg px-3 py-2.5 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={fileUploading}
                className="w-full py-2.5 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-gs-dark border border-gs-border text-gs-muted hover:border-gs-gold hover:text-gs-gold disabled:opacity-40 transition-all"
              >
                {fileSaved ? "Uploaded ✓" : fileUploading ? "Uploading…" : "+ Upload File"}
              </button>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

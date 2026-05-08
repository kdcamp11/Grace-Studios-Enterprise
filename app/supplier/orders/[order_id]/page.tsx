"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";
import type { OrderStage, RosterPlayer } from "@/types/database";

interface Brief {
  design_system: string | null;
  jersey_cut: string | null;
  sublimated: boolean | null;
  primary_colors: string | null;
  secondary_colors: string | null;
  accent_color: string | null;
  number_style: string | null;
  player_names: boolean;
  gs_logo_placement: string | null;
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
  stage: OrderStage;
  created_at: string;
  estimated_delivery: string | null;
  tracking_number: string | null;
  supplier: string | null;
  client: { name: string; email: string; sport: string; city: string };
  brief: Brief | null;
  concepts: { id: string; image_url: string; selected: boolean; concept_number: number }[];
  media: MediaItem[];
}

const STAGE_LABELS: Record<OrderStage, string> = {
  onboarding:              "Brief Submitted",
  design_confirmed:        "Design Confirmed",
  files_sent:              "Files Sent — Ready for Production",
  first_piece_in_progress: "First Piece In Progress",
  first_piece_review:      "First Piece Under Review",
  bulk_production:         "Bulk Production",
  qc_verified:             "QC Verified",
  shipped:                 "Shipped",
  delivered:               "Delivered",
  complete:                "Complete",
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="py-2 border-b border-gs-border last:border-0">
      <p className="text-[10px] font-display uppercase tracking-wider text-gs-muted mb-0.5">{label}</p>
      <p className="text-sm font-barlow text-gs-white">{value}</p>
    </div>
  );
}

export default function SupplierOrderPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router       = useRouter();
  const supabaseRef  = useRef(createClient());
  const supabase     = supabaseRef.current;
  const fileRef      = useRef<HTMLInputElement>(null);

  const [order, setOrder]         = useState<OrderDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [caption, setCaption]         = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadDone, setUploadDone]   = useState(false);
  const [stageSaving, setStageSaving] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);

  useEffect(() => {
    async function load() {
      const profile = await getProfile();
      if (!profile)                                                { router.replace("/login"); return; }
      if (profile.role !== "supplier" && profile.role !== "admin") { router.replace("/portal"); return; }
      const adminViewing = profile.role === "admin";
      if (adminViewing) setIsAdminView(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const orderQuery = supabase
        .from("orders")
        .select("id, order_number, stage, created_at, estimated_delivery, tracking_number, supplier, clients(name, email, sport, city)")
        .eq("id", order_id);
      // Suppliers can only see their own orders; admins can see any
      if (!adminViewing) orderQuery.eq("supplier_user_id", user.id);

      const [{ data: o }, { data: brief }, { data: concepts }, { data: media }] =
        await Promise.all([
          orderQuery.single(),
          supabase.from("briefs").select("*").eq("order_id", order_id).single(),
          supabase.from("concepts").select("id, image_url, selected, concept_number").eq("order_id", order_id).eq("selected", true),
          supabase
            .from("first_piece_media")
            .select("id, created_at, media_url, media_type, caption, admin_approved, admin_note, client_visible, client_approved")
            .eq("order_id", order_id)
            .order("created_at", { ascending: false }),
        ]);

      if (!o) { setLoading(false); return; }

      const client = Array.isArray(o.clients) ? o.clients[0] : o.clients;
      setOrder({
        id: o.id,
        order_number: o.order_number,
        stage: o.stage as OrderStage,
        created_at: o.created_at,
        estimated_delivery: o.estimated_delivery,
        tracking_number: o.tracking_number,
        supplier: o.supplier,
        client: client as OrderDetail["client"],
        brief: brief ?? null,
        concepts: (concepts ?? []) as OrderDetail["concepts"],
        media: (media ?? []) as MediaItem[],
      });
      setLoading(false);
    }
    load();
  }, [supabase, order_id, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function advanceStage(next: OrderStage) {
    setStageSaving(true);
    await supabase.from("orders").update({ stage: next }).eq("id", order_id);

    // Notify admin when supplier submits first piece for review
    if (next === "first_piece_review") {
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "first_piece_submitted", order_id }),
      }).catch(() => {});
    }

    setStageSaving(false);
    router.push("/supplier");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError("");
    setUploadDone(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploading(false); return; }

    const inserted: MediaItem[] = [];

    for (const file of Array.from(files)) {
      const isVideo = file.type.startsWith("video/");
      const ext     = file.name.split(".").pop();
      const path    = `${order_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: storageErr } = await supabase.storage
        .from("first-piece-media")
        .upload(path, file, { upsert: false });

      if (storageErr) {
        setUploadError(`Upload failed: ${storageErr.message}`);
        setUploading(false);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("first-piece-media")
        .getPublicUrl(path);

      const { data: row, error: dbErr } = await supabase
        .from("first_piece_media")
        .insert({
          order_id,
          uploaded_by: user.id,
          media_url: publicUrl,
          media_type: isVideo ? "video" : "photo",
          caption: caption || null,
        })
        .select()
        .single();

      if (dbErr) {
        setUploadError(`Database error: ${dbErr.message}`);
        setUploading(false);
        return;
      }

      inserted.push(row as MediaItem);
    }

    // Optimistically add to state
    setOrder((prev) => prev ? { ...prev, media: [...inserted, ...prev.media] } : prev);
    setCaption("");
    if (fileRef.current) fileRef.current.value = "";
    setUploading(false);
    setUploadDone(true);
    setTimeout(() => setUploadDone(false), 4000);
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
        <p className="text-gs-muted font-barlow">Order not found or not assigned to you.</p>
      </div>
    );
  }

  const roster = order.brief?.player_roster ?? [];
  const canUpload = ["files_sent", "first_piece_in_progress"].includes(order.stage);
  const rejectedMedia = order.media.filter((m) => m.admin_approved === false);

  // Stages the supplier can advance to themselves
  const STAGE_ACTIONS: Partial<Record<OrderStage, { next: OrderStage; label: string; note: string }>> = {
    files_sent: {
      next: "first_piece_in_progress",
      label: "Start First Piece Production",
      note: "Confirms you've received the files and are beginning production.",
    },
    first_piece_in_progress: {
      next: "first_piece_review",
      label: "Submit First Piece for Review",
      note: "Grace Studios will review your uploads before the client sees them.",
    },
    bulk_production: {
      next: "qc_verified",
      label: "Mark Bulk Production Complete",
      note: "Confirms all pieces have been produced and passed your quality check.",
    },
    qc_verified: {
      next: "shipped",
      label: "Mark as Shipped",
      note: "Confirms the order has been shipped to the client.",
    },
  };

  const stageAction = STAGE_ACTIONS[order.stage] ?? null;

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">Admin View — Supplier Portal</span>
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="ml-auto text-xs font-display font-bold uppercase tracking-wider text-amber-600 hover:text-amber-800 font-barlow transition-colors"
          >
            ← Admin Portal
          </button>
        </div>
      )}
      <header className="border-b border-gs-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <GraceLogo className="h-7" href="/supplier" />
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-widest text-gs-gold hover:text-gs-gold-light transition-colors">
            Supplier Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full space-y-8">

        {/* Order header */}
        <div>
          <p className="text-xs font-display uppercase tracking-widest text-gs-muted">Order</p>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-gs-white mt-1">
            {order.order_number || order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-sm text-gs-muted font-barlow mt-1">
            {order.client.name} · {order.client.sport} · {order.client.city}
          </p>
          <span className="inline-block mt-2 text-[10px] font-display uppercase tracking-wider px-2.5 py-1 rounded-full border border-gs-gold/30 bg-gs-gold/10 text-gs-gold">
            {STAGE_LABELS[order.stage]}
          </span>
        </div>

        {/* ── Changes Requested Banner ────────────────────────────────────────── */}
        {rejectedMedia.length > 0 && (
          <div className="border border-[#C41E1E]/40 bg-[#C41E1E]/5 rounded-xl p-5 flex gap-4">
            <div className="w-9 h-9 rounded-full bg-[#C41E1E]/10 border border-[#C41E1E]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 text-[#C41E1E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <p className="font-display font-bold uppercase tracking-wide text-[#C41E1E] text-sm">
                Changes Requested — {rejectedMedia.length} item{rejectedMedia.length !== 1 ? "s" : ""}
              </p>
              <p className="text-xs font-barlow text-gs-muted mt-1 leading-relaxed">
                Grace Studios has requested changes on {rejectedMedia.length === 1 ? "an upload" : "some uploads"} below.
                Review the notes and submit new media when ready.
              </p>
              {rejectedMedia.map((m) => m.admin_note && (
                <p key={m.id} className="text-xs font-barlow text-[#C41E1E]/80 mt-1.5 pl-3 border-l border-[#C41E1E]/30">
                  "{m.admin_note}"
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ── Production Progress ──────────────────────────────────────────────── */}
        {stageAction && (
          <div className="bg-gs-dark-2 border border-gs-border rounded-xl p-6 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold">Production Progress</p>
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <p className="text-sm font-barlow text-gs-white font-medium">{stageAction.label}</p>
                <p className="text-xs font-barlow text-gs-muted mt-0.5">{stageAction.note}</p>
              </div>
              <button
                type="button"
                onClick={() => advanceStage(stageAction.next)}
                disabled={
                  stageSaving ||
                  // Require at least one upload before submitting for review
                  (order.stage === "first_piece_in_progress" && order.media.length === 0)
                }
                className="flex-shrink-0 px-5 py-2.5 rounded-lg font-display font-bold text-xs uppercase tracking-widest bg-gs-gold text-white hover:bg-gs-gold-light disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_2px_12px_rgba(196,160,30,0.25)]"
              >
                {stageSaving ? "Updating…" : "Confirm →"}
              </button>
            </div>
            {order.stage === "first_piece_in_progress" && order.media.length === 0 && (
              <p className="text-[10px] font-barlow text-gs-muted">
                Upload at least one photo or video before submitting for review.
              </p>
            )}
          </div>
        )}

        {/* ── Brief Specs ─────────────────────────────────────────────────────── */}
        {order.brief && (
          <div className="bg-gs-dark-2 border border-gs-border rounded-xl p-6 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold">Design Specifications</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <Field label="Design System"    value={order.brief.design_system} />
              <Field label="Jersey Cut"        value={order.brief.jersey_cut} />
              <Field label="Construction"      value={
                order.brief.sublimated === true  ? "Sublimated" :
                order.brief.sublimated === false ? "Tackle Twill" : null
              } />
              <Field label="Number Style"      value={order.brief.number_style} />
              <Field label="GS Logo Placement" value={order.brief.gs_logo_placement?.replace(/_/g, " ")} />
              <Field label="Player Names"      value={order.brief.player_names ? "Yes" : "No"} />
              <Field label="Logos to Include"  value={order.brief.logos_to_include} />
              <Field label="Sponsor Text"      value={order.brief.sponsor_text} />
              <Field label="Avoid"             value={order.brief.negative_references} />
            </div>

            {/* Color swatches */}
            <div>
              <p className="text-[10px] font-display uppercase tracking-wider text-gs-muted mb-3">Colors</p>
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "Primary",   val: order.brief.primary_colors },
                  { label: "Secondary", val: order.brief.secondary_colors },
                  { label: "Accent",    val: order.brief.accent_color },
                ].filter((c) => c.val).map((c) => (
                  <div key={c.label} className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full border border-gs-border shadow-inner flex-shrink-0"
                      style={{ backgroundColor: c.val ?? "transparent" }}
                    />
                    <div>
                      <p className="text-[9px] font-display uppercase tracking-wider text-gs-muted">{c.label}</p>
                      <p className="text-xs font-barlow text-gs-white font-medium">{c.val}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vision / design notes */}
            {order.brief.vision_prompt && (
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-gs-muted mb-1">Design Notes</p>
                <p className="text-sm font-barlow text-gs-white leading-relaxed bg-gs-dark-3 rounded-lg p-3">
                  {order.brief.vision_prompt}
                </p>
              </div>
            )}

            {/* Reference image */}
            {order.brief.reference_image_url && (
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-gs-muted mb-2">Reference Image</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={order.brief.reference_image_url}
                  alt="Reference"
                  className="rounded-lg max-h-48 object-contain border border-gs-border"
                />
              </div>
            )}
          </div>
        )}

        {/* ── Approved concept ────────────────────────────────────────────────── */}
        {order.concepts.length > 0 && (
          <div className="bg-gs-dark-2 border border-gs-border rounded-xl p-6">
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold mb-4">
              Approved Design Concept{order.concepts.length > 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-3">
              {order.concepts.map((c) => (
                <div key={c.id} className="rounded-xl overflow-hidden border border-gs-gold/40 w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.image_url} alt={`Concept ${c.concept_number}`} className="w-full aspect-square object-cover" />
                  <p className="text-[10px] font-barlow text-gs-gold text-center py-1.5 bg-gs-gold/10">
                    Concept {c.concept_number} · Approved
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Player Roster ───────────────────────────────────────────────────── */}
        {roster.length > 0 && (
          <div className="bg-gs-dark-2 border border-gs-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-display uppercase tracking-widest text-gs-gold">
                Player Roster — {roster.length} Players
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-barlow">
                <thead>
                  <tr className="border-b border-gs-border">
                    {["#", "Name", "Number", "Size", "Cut"].map((h) => (
                      <th key={h} className="text-left text-[10px] font-display uppercase tracking-wider text-gs-muted pb-3 pr-4">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {roster.map((player, i) => (
                    <tr key={i} className="border-b border-gs-border/50 last:border-0">
                      <td className="py-2.5 pr-4 text-gs-muted text-xs">{i + 1}</td>
                      <td className="py-2.5 pr-4 text-gs-white font-medium">{player.name}</td>
                      <td className="py-2.5 pr-4 text-gs-white">{player.number}</td>
                      <td className="py-2.5 pr-4 text-gs-white">{player.size}</td>
                      <td className="py-2.5 pr-4 text-gs-muted capitalize">{player.cut}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── First Piece Upload ──────────────────────────────────────────────── */}
        <div className="bg-gs-dark-2 border border-gs-border rounded-xl p-6 space-y-6">
          <div>
            <p className="text-xs font-display uppercase tracking-widest text-gs-gold">First Piece Media</p>
            <p className="text-xs text-gs-muted font-barlow mt-1">
              Upload photos and videos of the first piece. Grace Studios will review before the client sees them.
            </p>
          </div>

          {/* Upload form */}
          {canUpload ? (
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-[10px] font-display uppercase tracking-wider text-gs-muted mb-2">
                  Select Files (photos or video)
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  required
                  className="w-full text-sm font-barlow text-gs-muted file:mr-3 file:py-2 file:px-4
                    file:rounded-lg file:border file:border-gs-border file:bg-gs-dark-3
                    file:text-xs file:font-display file:uppercase file:tracking-wider file:text-gs-white
                    file:cursor-pointer hover:file:border-gs-gold hover:file:text-gs-gold
                    file:transition-all cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[10px] font-display uppercase tracking-wider text-gs-muted mb-2">
                  Caption (optional)
                </label>
                <input
                  type="text"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="e.g. Front view — size L sample"
                  className="w-full bg-gs-dark border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted/60 focus:outline-none focus:border-gs-gold transition-colors"
                />
              </div>
              {uploadError && (
                <p className="text-[#C41E1E] text-sm font-barlow bg-[#C41E1E]/10 border border-[#C41E1E]/30 rounded-lg px-4 py-3">
                  {uploadError}
                </p>
              )}
              {uploadDone && (
                <div className="bg-green-400/10 border border-green-400/30 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                  <p className="text-green-400 text-sm font-barlow">
                    ✓ Uploaded successfully. Grace Studios will review shortly.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push("/supplier")}
                    className="flex-shrink-0 text-[10px] font-display uppercase tracking-wider text-green-400 hover:text-green-300 transition-colors"
                  >
                    Back to Orders →
                  </button>
                </div>
              )}
              <button
                type="submit"
                disabled={uploading}
                className="w-full py-3.5 rounded-lg font-display font-bold text-sm uppercase tracking-widest
                  bg-gs-gold text-white hover:bg-gs-gold-light disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {uploading ? "Uploading…" : "Submit First Piece Media →"}
              </button>
            </form>
          ) : (
            <div className="rounded-lg border border-gs-border bg-gs-dark-3 px-4 py-3">
              <p className="text-xs font-barlow text-gs-muted">
                {order.stage === "first_piece_review"
                  ? "Your uploads are under review by Grace Studios."
                  : "Uploads are enabled once the order reaches the First Piece stage."}
              </p>
            </div>
          )}

          {/* Previously uploaded media */}
          {order.media.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-gs-border">
              <p className="text-[10px] font-display uppercase tracking-wider text-gs-muted">
                Submitted ({order.media.length})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {order.media.map((item) => (
                  <MediaCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>

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
    <div className="rounded-xl overflow-hidden border border-gs-border bg-gs-dark-3">
      {item.media_type === "video" ? (
        <video
          src={item.media_url}
          controls
          className="w-full aspect-video object-cover bg-black"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.media_url} alt={item.caption ?? "First piece"} className="w-full aspect-square object-cover" />
      )}
      <div className="p-2.5 space-y-1.5">
        <span className={`inline-block text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}>
          {statusLabel}
        </span>
        {item.caption && (
          <p className="text-[10px] font-barlow text-gs-muted leading-tight">{item.caption}</p>
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

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import AdminHeader from "@/components/AdminHeader";
import type { RosterPlayer } from "@/types/database";
import type { OrderStage } from "@/types/database";
import type { SupplierWithPortfolio } from "@/app/api/admin/suppliers/route";
import { formatCurrency, getPaymentThresholdInfo } from "@/lib/payments/thresholds";

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
  logo_placement: string | null;
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

interface InvoicePayment {
  id: string;
  method: "stripe" | "ach" | "wire";
  amount: number;
  status: "pending" | "pending_verification" | "paid" | "failed" | "canceled";
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  verified_by: string | null;
  verified_at: string | null;
  admin_note: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  deposit_amount: number;
  balance_due: number;
  currency: string;
  status: string;
  recommended_payment_method: string;
  payment_threshold_band: string;
  card_enabled: boolean;
  bank_name: string | null;
  bank_routing: string | null;
  bank_account: string | null;
  bank_swift: string | null;
  bank_beneficiary: string | null;
  admin_notes: string | null;
  created_at: string;
  payments: InvoicePayment[];
}

interface DesignerProfile {
  id: string;
  full_name: string | null;
  email: string;
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
  assigned_designer_id: string | null;
  notes: string | null;
  production_file_url: string | null;
  client: { name: string; email: string; sport: string; city: string };
  brief: Brief | null;
  concepts: Concept[];
  media: MediaItem[];
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-4 py-2 border-b border-brand-border last:border-0">
      <span className="text-xs font-display uppercase tracking-wider text-brand-muted w-40 flex-shrink-0">{label}</span>
      <span className="text-sm font-barlow text-brand-text">{value}</span>
    </div>
  );
}

/** Parses the AI design brief JSON and renders it as clean structured prose. */
function AiDesignBrief({ raw }: { raw: string }) {
  // If it's not JSON, just render as plain text
  let parsed: Record<string, unknown> | null = null;
  try {
    const v = JSON.parse(raw);
    if (typeof v === "object" && v !== null && !Array.isArray(v)) parsed = v as Record<string, unknown>;
  } catch {
    // not JSON
  }

  if (!parsed) {
    return <p className="text-xs font-barlow text-brand-muted leading-relaxed">{raw}</p>;
  }

  // Extract readable fields
  const description  = typeof parsed.description  === "string" ? parsed.description  : null;
  const garmentType  = typeof parsed.garmentType  === "string" ? parsed.garmentType  : null;
  const features     = Array.isArray(parsed.features)     ? (parsed.features as string[])     : [];
  const materials    = Array.isArray(parsed.materials)     ? (parsed.materials as string[])    : [];
  const logoPlace    = typeof parsed.logoPlacement === "string" ? parsed.logoPlacement : null;

  return (
    <div className="space-y-3">
      {garmentType && (
        <p className="text-xs font-display uppercase tracking-wider text-brand-primary">{garmentType}</p>
      )}
      {description && (
        <p className="text-xs font-barlow text-brand-muted leading-relaxed">{description}</p>
      )}
      {features.length > 0 && (
        <div>
          <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Key Features</p>
          <ul className="space-y-1">
            {features.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <div className="w-[3px] h-3 bg-brand-primary flex-shrink-0 mt-0.5" />
                <span className="text-xs font-barlow text-brand-muted leading-snug">{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {materials.length > 0 && (
        <div>
          <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1.5">Materials</p>
          <p className="text-xs font-barlow text-brand-muted leading-relaxed">{materials.join(" · ")}</p>
        </div>
      )}
      {logoPlace && (
        <div>
          <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1">Logo Placement</p>
          <p className="text-xs font-barlow text-brand-muted">{logoPlace}</p>
        </div>
      )}
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
  const [designers, setDesigners] = useState<DesignerProfile[]>([]);
  const [designerSaving, setDesignerSaving] = useState(false);
  const [designerSaved, setDesignerSaved]   = useState(false);

  // Activity feed
  interface ActivityItem {
    id: string;
    event_type: string;
    event_message: string;
    actor_name: string;
    actor_role: string | null;
    created_at: string;
  }
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierSaved, setSupplierSaved] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [orderFiles, setOrderFiles] = useState<OrderFile[]>([]);
  const [fileLabel, setFileLabel] = useState("Print-Ready Files");
  const [fileUploading, setFileUploading] = useState(false);
  const [fileSaved, setFileSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invoice state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [invTotal, setInvTotal]     = useState("");
  const [invDeposit, setInvDeposit] = useState("");
  const [invNotes, setInvNotes]     = useState("");
  const [invBankName, setInvBankName]       = useState("");
  const [invBankRouting, setInvBankRouting] = useState("");
  const [invBankAccount, setInvBankAccount] = useState("");
  const [invBankSwift, setInvBankSwift]     = useState("");
  const [invBeneficiary, setInvBeneficiary] = useState("");
  const [invSaving, setInvSaving]   = useState(false);
  const [invSaved, setInvSaved]     = useState(false);
  const [invError, setInvError]     = useState("");
  const [verifyingPayment, setVerifyingPayment] = useState<string | null>(null);
  const [verifyNote, setVerifyNote] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const profile = await getProfile();
      if (!user || (profile?.role !== "admin" && profile?.role !== "super_admin")) { router.replace("/portal"); return; }

      // Use service-role API to bypass orders_select_own RLS
      const res = await fetch(`/api/admin/orders/${order_id}`);
      if (!res.ok) { setLoading(false); return; }
      const d = await res.json() as {
        order: OrderDetail & { client: { name: string; email: string; sport: string; city: string } };
        brief: Brief | null;
        concepts: Concept[];
        media: MediaItem[];
        suppliers: SupplierProfile[];
        designers: DesignerProfile[];
        files: OrderFile[];
        invoices: Invoice[];
      };

      if (!d.order) { setLoading(false); return; }
      setOrder({ ...d.order, brief: d.brief ?? null, concepts: d.concepts, media: d.media });
      setSuppliers(d.suppliers);
      setDesigners(d.designers ?? []);
      setOrderFiles(d.files);
      setInvoices(d.invoices ?? []);
      setTrackingInput(d.order.tracking_number ?? "");
      setDeliveryInput(d.order.estimated_delivery?.slice(0, 10) ?? "");
      setNotesInput(d.order.notes ?? "");
      setLoading(false);

      // Load activity feed
      setActivityLoading(true);
      fetch(`/api/admin/orders/${order_id}/activity`)
        .then((r) => r.ok ? r.json() : null)
        .then((a) => { if (a?.activity) setActivity(a.activity); })
        .finally(() => setActivityLoading(false));
    });
  }, [supabase, order_id, router]);

  async function updateStage(newStage: OrderStage) {
    if (!order || newStage === order.stage) return;
    setStageSaving(true);
    await fetch(`/api/admin/orders/${order_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stage", stage: newStage, from_stage: order.stage }),
    });
    setOrder((prev) => prev ? { ...prev, stage: newStage } : prev);
    setStageSaving(false);
  }

  async function assignSupplier(supplierUserId: string | null) {
    if (!order) return;
    setSupplierSaving(true);
    await fetch(`/api/admin/orders/${order_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "supplier", supplier_user_id: supplierUserId }),
    });
    setOrder((prev) => prev ? { ...prev, supplier_user_id: supplierUserId } : prev);
    setSupplierSaving(false);
    setSupplierSaved(true);
    setTimeout(() => setSupplierSaved(false), 2500);
  }

  async function assignDesigner(designerId: string | null) {
    if (!order) return;
    setDesignerSaving(true);
    await fetch(`/api/admin/orders/${order_id}/assign`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designer_id: designerId }),
    });
    setOrder((prev) => prev ? { ...prev, assigned_designer_id: designerId } : prev);
    setDesignerSaving(false);
    setDesignerSaved(true);
    setTimeout(() => setDesignerSaved(false), 2500);
  }

  async function reviewMedia(mediaId: string, approved: boolean) {
    const note = reviewNote || null;
    await fetch(`/api/admin/orders/${order_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "media", media_id: mediaId, approved, admin_note: note }),
    });

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
    await fetch(`/api/admin/orders/${order_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "details",
        tracking_number: trackingInput || null,
        estimated_delivery: deliveryInput || null,
        notes: notesInput || null,
      }),
    });
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

    const res = await fetch(`/api/admin/orders/${order_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "file_insert",
        uploaded_by: user?.id,
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type || null,
        label: fileLabel.trim() || null,
        client_visible: true,
      }),
    });
    const { row } = await res.json() as { row?: OrderFile };
    if (row) setOrderFiles((prev) => [...prev, row]);
    setFileUploading(false);
    setFileSaved(true);
    setTimeout(() => setFileSaved(false), 2500);
  }

  async function deleteFile(fileId: string, filePath: string) {
    await fetch(`/api/admin/orders/${order_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "file_delete", file_id: fileId }),
    });
    const storagePath = filePath.split("/order-files/")[1];
    if (storagePath) await supabase.storage.from("order-files").remove([storagePath]);
    setOrderFiles((prev) => prev.filter((f) => f.id !== fileId));
  }

  async function createInvoice() {
    if (!invTotal || isNaN(Number(invTotal))) return;
    setInvSaving(true);
    setInvError("");
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_id:       order_id,
        total_amount:   Number(invTotal),
        deposit_amount: Number(invDeposit) || 0,
        admin_notes:    invNotes || null,
        bank_name:      invBankName || null,
        bank_routing:   invBankRouting || null,
        bank_account:   invBankAccount || null,
        bank_swift:     invBankSwift || null,
        bank_beneficiary: invBeneficiary || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setInvError(data.error ?? "Failed to create invoice");
    } else {
      setInvoices((prev) => [{ ...data.invoice, payments: [] }, ...prev]);
      setShowCreateInvoice(false);
      setInvSaved(true);
      setTimeout(() => setInvSaved(false), 2500);
    }
    setInvSaving(false);
  }

  async function setInvoiceStatus(invoiceId: string, status: string) {
    const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_status", status }),
    });
    if (res.ok) {
      setInvoices((prev) => prev.map((inv) => inv.id === invoiceId ? { ...inv, status } : inv));
    }
  }

  async function verifyPayment(invoiceId: string, paymentId: string) {
    const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify_payment", payment_id: paymentId, admin_note: verifyNote || null }),
    });
    const data = await res.json();
    if (res.ok) {
      setInvoices((prev) => prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        return {
          ...inv,
          status: data.invoice_status,
          payments: inv.payments.map((p) => p.id === paymentId ? { ...p, status: "paid" as const } : p),
        };
      }));
      setVerifyingPayment(null);
      setVerifyNote("");
    }
  }

  async function rejectPayment(invoiceId: string, paymentId: string) {
    const res = await fetch(`/api/admin/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject_payment", payment_id: paymentId }),
    });
    if (res.ok) {
      setInvoices((prev) => prev.map((inv) => {
        if (inv.id !== invoiceId) return inv;
        return {
          ...inv,
          payments: inv.payments.map((p) => p.id === paymentId ? { ...p, status: "failed" as const } : p),
        };
      }));
    }
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

  const currentStageIndex = PIPELINE.indexOf(order.stage);

  const STAGE_NEXT: Partial<Record<OrderStage, string>> = {
    onboarding:              "Concepts are generating. Check back soon or trigger manually.",
    design_confirmed:        "Client is reviewing concepts and will select one.",
    files_sent:              "Assign a production partner and upload production files below.",
    first_piece_in_progress: "Waiting for supplier to submit first piece photos.",
    first_piece_review:      "Scroll down to review supplier uploads before sending to client.",
    bulk_production:         "Bulk production underway. Supplier will mark complete when done.",
    qc_verified:             "Add a tracking number below, then advance to Shipped.",
    shipped:                 "Move to Delivered once the client confirms receipt.",
    delivered:               "Mark as Complete to close out this order.",
    complete:                "This order is complete.",
  };
  const nextHint = STAGE_NEXT[order.stage];

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <AdminHeader onSignOut={signOut} />

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-3xl space-y-8">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-brand-muted">Order</p>
              <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text mt-1">
                {order.order_number || order.id.slice(0, 8).toUpperCase()}
              </h1>
              <p className="text-sm text-brand-muted font-barlow mt-1">
                {order.client.name} · {order.client.sport} · {order.client.city}
              </p>
              <p className="text-xs text-brand-muted font-barlow">{order.client.email}</p>
            </div>
            <a
              href={`/orders/${order.id}/concepts`}
              target="_blank"
              className="flex-shrink-0 px-4 py-2 rounded-lg border border-brand-border text-brand-muted font-display font-bold text-xs uppercase tracking-widest hover:border-brand-primary hover:text-brand-primary transition-all"
            >
              Client View ↗
            </a>
          </div>

          {/* Stage pipeline */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Pipeline Stage</p>
              <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted">
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
                        ? "border-brand-primary bg-brand-primary/10 text-brand-primary shadow-[0_0_12px_rgba(196,160,30,0.15)]"
                        : isDone
                          ? "border-green-500/40 bg-green-500/5 text-green-400 hover:border-green-400/60 hover:text-green-300"
                          : "border-brand-border text-brand-border hover:border-brand-muted hover:text-brand-text"
                      }`}
                  >
                    <span className="flex items-center justify-between mb-1">
                      <span style={{ fontSize: "10px" }} className={isDone ? "text-green-500/60" : "text-brand-muted"}>
                        {i + 1}
                      </span>
                      {isDone && (
                        <svg className="w-3 h-3 text-green-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                      )}
                    </span>
                    {STAGE_LABELS[stage]}
                  </button>
                );
              })}
            </div>
            {nextHint && (
              <div className="mt-4 pt-4 border-t border-brand-border flex items-start gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary mt-1.5 flex-shrink-0" />
                <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                  <span className="text-brand-text font-medium">Next: </span>{nextHint}
                </p>
              </div>
            )}
          </div>

          {/* ── Invoice / Payment Panel ──────────────────────────────────── */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Invoice & Payment</p>
              {invoices.length === 0 && !showCreateInvoice && (
                <button
                  type="button"
                  onClick={() => setShowCreateInvoice(true)}
                  className="text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
                >
                  + Create Invoice
                </button>
              )}
              {invSaved && <span className="text-[10px] font-barlow text-green-400">Invoice created ✓</span>}
            </div>

            {/* Create form */}
            {showCreateInvoice && (
              <div className="bg-brand-bg border border-brand-border rounded-xl p-5 space-y-4">
                <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted">New Invoice</p>

                {invTotal && !isNaN(Number(invTotal)) && Number(invTotal) > 0 && (
                  <div className="text-xs font-barlow text-brand-muted bg-brand-surface rounded-lg px-3 py-2">
                    {(() => {
                      const t = getPaymentThresholdInfo(Number(invTotal));
                      const labels: Record<string, string> = { small: "Card recommended", hybrid: "Card or bank transfer", large: "Bank transfer recommended", enterprise: "Bank transfer (card on request)" };
                      return `Payment method: ${labels[t.band] ?? t.band}`;
                    })()}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-display uppercase tracking-wider text-brand-muted mb-1.5">Total Amount ($)</label>
                    <input type="number" min="0" step="0.01" value={invTotal} onChange={(e) => setInvTotal(e.target.value)}
                      placeholder="e.g. 2500.00"
                      className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-display uppercase tracking-wider text-brand-muted mb-1.5">Deposit Amount ($) <span className="normal-case opacity-60">optional</span></label>
                    <input type="number" min="0" step="0.01" value={invDeposit} onChange={(e) => setInvDeposit(e.target.value)}
                      placeholder="e.g. 750.00"
                      className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors" />
                  </div>
                </div>

                <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted pt-1">Bank Transfer Details <span className="normal-case opacity-60">(optional, shown to client for ACH/wire)</span></p>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Business Name", invBeneficiary, setInvBeneficiary, "e.g. Your Studio Name LLC"],
                    ["Bank Name",     invBankName,    setInvBankName,    "e.g. Chase"],
                    ["Routing #",     invBankRouting, setInvBankRouting, "9-digit ABA"],
                    ["Account #",     invBankAccount, setInvBankAccount, "Checking account"],
                    ["SWIFT / BIC",   invBankSwift,   setInvBankSwift,   "For wires (optional)"],
                  ].map(([label, value, setter, placeholder]) => (
                    <div key={label as string}>
                      <label className="block text-[10px] font-display uppercase tracking-wider text-brand-muted mb-1.5">{label as string}</label>
                      <input type="text" value={value as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                        placeholder={placeholder as string}
                        className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[10px] font-display uppercase tracking-wider text-brand-muted mb-1.5">Internal Notes</label>
                    <input type="text" value={invNotes} onChange={(e) => setInvNotes(e.target.value)}
                      placeholder="Admin-only notes"
                      className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors" />
                  </div>
                </div>

                {invError && <p className="text-xs font-barlow text-red-400">{invError}</p>}

                <div className="flex gap-2">
                  <button type="button" onClick={createInvoice} disabled={invSaving || !invTotal}
                    className="flex-1 py-2.5 rounded-lg font-display font-bold text-xs uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 transition-all">
                    {invSaving ? "Creating…" : "Create Invoice"}
                  </button>
                  <button type="button" onClick={() => setShowCreateInvoice(false)}
                    className="px-4 py-2.5 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text font-barlow text-xs transition-all">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Existing invoices */}
            {invoices.length === 0 && !showCreateInvoice && (
              <p className="text-sm font-barlow text-brand-muted">No invoice yet. Create one to enable payment.</p>
            )}

            {invoices.map((inv) => {
              const ISTATUS: Record<string, { label: string; color: string }> = {
                draft:                { label: "Draft",               color: "text-brand-muted border-brand-border" },
                sent:                 { label: "Awaiting Payment",    color: "text-amber-400 border-amber-400/30" },
                pending_payment:      { label: "Awaiting Payment",    color: "text-amber-400 border-amber-400/30" },
                pending_verification: { label: "Pending Verification", color: "text-blue-400 border-blue-400/30" },
                partially_paid:       { label: "Deposit Paid",        color: "text-brand-primary border-brand-primary/30" },
                paid:                 { label: "Paid in Full",        color: "text-green-400 border-green-400/30" },
                failed:               { label: "Failed",              color: "text-red-400 border-red-400/30" },
                canceled:             { label: "Canceled",            color: "text-brand-muted border-brand-border" },
              };
              const si = ISTATUS[inv.status] ?? ISTATUS.sent;

              return (
                <div key={inv.id} className="bg-brand-bg border border-brand-border rounded-xl overflow-hidden">
                  {/* Invoice header */}
                  <div className="px-4 py-3 flex items-center justify-between gap-4 border-b border-brand-border">
                    <div>
                      <p className="text-xs font-barlow text-brand-muted">{inv.invoice_number}</p>
                      <p className="font-display font-bold text-brand-text text-base">
                        {formatCurrency(inv.total_amount, inv.currency)}
                      </p>
                      {inv.deposit_amount > 0 && (
                        <p className="text-[10px] font-barlow text-brand-muted">
                          Deposit: {formatCurrency(inv.deposit_amount, inv.currency)} · Balance: {formatCurrency(inv.balance_due ?? (inv.total_amount - inv.deposit_amount), inv.currency)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className={`text-[10px] font-display uppercase tracking-wider px-2.5 py-1 rounded-full border ${si.color}`}>
                        {si.label}
                      </span>
                      <a
                        href={`/orders/${order_id}/invoice`}
                        target="_blank"
                        className="text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
                      >
                        Client View ↗
                      </a>
                    </div>
                  </div>

                  {/* Admin status controls */}
                  <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-brand-border">
                    <p className="w-full text-[9px] font-display uppercase tracking-wider text-brand-muted mb-1">Mark Status</p>
                    {(["paid", "partially_paid", "pending_verification", "failed", "canceled"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setInvoiceStatus(inv.id, s)}
                        disabled={inv.status === s}
                        className={`px-2.5 py-1 rounded-full text-[9px] font-display uppercase tracking-wider border transition-all
                          ${inv.status === s
                            ? "bg-brand-primary text-white border-brand-primary"
                            : "border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-primary"
                          } disabled:opacity-60`}
                      >
                        {s.replace(/_/g, " ")}
                      </button>
                    ))}
                  </div>

                  {/* Payments */}
                  {inv.payments.length > 0 && (
                    <div className="px-4 py-3 space-y-3">
                      <p className="text-[9px] font-display uppercase tracking-wider text-brand-muted">Payments</p>
                      {inv.payments.map((p) => (
                        <div key={p.id} className="border border-brand-border rounded-lg p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-xs font-barlow text-brand-text font-medium">
                                {formatCurrency(p.amount, inv.currency)} via {p.method === "stripe" ? "Card (Stripe)" : p.method.toUpperCase()}
                              </p>
                              <p className="text-[10px] font-barlow text-brand-muted">
                                {new Date(p.created_at).toLocaleDateString()} ·{" "}
                                <span className={
                                  p.status === "paid" ? "text-green-400" :
                                  p.status === "pending_verification" ? "text-blue-400" :
                                  p.status === "failed" ? "text-red-400" : "text-brand-muted"
                                }>
                                  {p.status.replace(/_/g, " ")}
                                </span>
                              </p>
                              {p.stripe_payment_intent_id && (
                                <p className="text-[9px] font-mono text-brand-muted opacity-60 mt-0.5">PI: {p.stripe_payment_intent_id}</p>
                              )}
                              {p.verified_at && (
                                <p className="text-[9px] font-barlow text-green-400 mt-0.5">Verified {new Date(p.verified_at).toLocaleDateString()}</p>
                              )}
                              {p.admin_note && (
                                <p className="text-[9px] font-barlow text-brand-muted mt-0.5">Note: {p.admin_note}</p>
                              )}
                            </div>

                            {/* Actions for pending payments */}
                            {p.status === "pending_verification" && verifyingPayment !== p.id && (
                              <div className="flex gap-2 flex-shrink-0">
                                <button type="button" onClick={() => { setVerifyingPayment(p.id); setVerifyNote(""); }}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-display uppercase tracking-wider bg-green-600/10 text-green-400 border border-green-400/30 hover:bg-green-600/20 transition-all">
                                  Verify
                                </button>
                                <button type="button" onClick={() => rejectPayment(inv.id, p.id)}
                                  className="px-2.5 py-1 rounded-lg text-[10px] font-display uppercase tracking-wider bg-red-600/10 text-red-400 border border-red-400/30 hover:bg-red-600/20 transition-all">
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Inline verify panel */}
                          {verifyingPayment === p.id && (
                            <div className="space-y-2 pt-1">
                              <input type="text" value={verifyNote} onChange={(e) => setVerifyNote(e.target.value)}
                                placeholder="Optional verification note…"
                                className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-brand-text font-barlow text-xs placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors" />
                              <div className="flex gap-2">
                                <button type="button" onClick={() => verifyPayment(inv.id, p.id)}
                                  className="flex-1 py-2 rounded-lg font-display font-bold text-xs uppercase tracking-widest bg-green-600 text-white hover:bg-green-500 transition-all">
                                  Confirm Verified
                                </button>
                                <button type="button" onClick={() => { setVerifyingPayment(null); setVerifyNote(""); }}
                                  className="px-3 py-2 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text font-barlow text-xs transition-all">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {inv.admin_notes && (
                    <div className="px-4 pb-3">
                      <p className="text-[9px] font-display uppercase tracking-wider text-brand-muted mb-0.5">Notes</p>
                      <p className="text-xs font-barlow text-brand-muted">{inv.admin_notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Brief details */}
            {order.brief && (
              <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Brief</p>
                <DetailRow label="Design System" value={order.brief.design_system} />
                <DetailRow label="Cut" value={order.brief.jersey_cut} />
                <DetailRow label="Construction" value={order.brief.sublimated === true ? "Sublimated" : order.brief.sublimated === false ? "Tackle Twill" : null} />
                <DetailRow label="Logo Placement" value={order.brief.logo_placement?.replace("_", " ")} />
                <DetailRow label="Number Style" value={order.brief.number_style} />
                <DetailRow label="Logos" value={order.brief.logos_to_include} />
                <DetailRow label="Sponsor" value={order.brief.sponsor_text} />
                <DetailRow label="Avoid" value={order.brief.negative_references} />
                <DetailRow label="Vision" value={order.brief.vision_prompt} />
                {order.brief.logo_url && (
                  <div className="pt-3">
                    <p className="text-xs font-display uppercase tracking-wider text-brand-muted mb-2">Team Logo</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={order.brief.logo_url} alt="Team logo" className="h-16 object-contain" />
                  </div>
                )}
                {order.brief.ai_prompt && (
                  <div className="pt-3 border-t border-brand-border">
                    <p className="text-xs font-display uppercase tracking-wider text-brand-muted mb-3">AI Design Brief</p>
                    <AiDesignBrief raw={order.brief.ai_prompt} />
                  </div>
                )}
              </div>
            )}

            {/* Operational fields */}
            <div className="space-y-4">
              <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Order Details</p>

                {/* Supplier assignment */}
                <div>
                  <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-1.5">
                    Production Partner
                  </label>
                  {order.supplier_user_id ? (
                    <div className="flex items-center justify-between gap-3 bg-brand-bg border border-brand-border rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0 text-[11px] font-display font-bold text-brand-primary uppercase">
                          {(suppliers.find((s) => s.id === order.supplier_user_id)?.company ?? suppliers.find((s) => s.id === order.supplier_user_id)?.full_name ?? "?")[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-barlow text-brand-text truncate">
                            {suppliers.find((s) => s.id === order.supplier_user_id)?.company ?? suppliers.find((s) => s.id === order.supplier_user_id)?.full_name ?? "Assigned"}
                          </p>
                          {supplierSaved && <p className="text-[10px] font-barlow text-green-400">Saved ✓</p>}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSupplierModal(true)}
                        className="text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors flex-shrink-0"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowSupplierModal(true)}
                      className="w-full py-3 rounded-lg border border-dashed border-brand-border text-sm font-display uppercase tracking-wider text-brand-muted hover:border-brand-primary hover:text-brand-primary transition-all"
                    >
                      + Assign Production Partner
                    </button>
                  )}
                </div>

                {/* Designer assignment */}
                <div>
                  <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-1.5">
                    Assigned Designer
                  </label>
                  {designers.length === 0 ? (
                    <p className="text-xs font-barlow text-brand-muted italic">
                      No designers on this tenant yet.{" "}
                      <a href="/admin/team" className="underline hover:text-brand-primary">Invite one →</a>
                    </p>
                  ) : order?.assigned_designer_id ? (
                    <div className="flex items-center justify-between gap-3 bg-brand-bg border border-brand-border rounded-lg px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-violet-400/10 border border-violet-400/30 flex items-center justify-center flex-shrink-0 text-[11px] font-display font-bold text-violet-400 uppercase">
                          {(designers.find((d) => d.id === order.assigned_designer_id)?.full_name ?? designers.find((d) => d.id === order.assigned_designer_id)?.email ?? "?")[0]}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-barlow text-brand-text truncate">
                            {designers.find((d) => d.id === order.assigned_designer_id)?.full_name ?? designers.find((d) => d.id === order.assigned_designer_id)?.email ?? "Assigned"}
                          </p>
                          {designerSaved && <p className="text-[10px] font-barlow text-green-400">Saved ✓</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <select
                          value={order.assigned_designer_id}
                          onChange={(e) => assignDesigner(e.target.value || null)}
                          disabled={designerSaving}
                          className="text-xs font-barlow bg-brand-bg border border-brand-border rounded-lg px-2 py-1.5 text-brand-muted focus:outline-none focus:border-brand-primary disabled:opacity-40"
                        >
                          {designers.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.full_name ?? d.email}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => assignDesigner(null)}
                          disabled={designerSaving}
                          className="text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-[#C41E1E] transition-colors disabled:opacity-40"
                        >
                          Unassign
                        </button>
                      </div>
                    </div>
                  ) : (
                    <select
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) assignDesigner(e.target.value); }}
                      disabled={designerSaving}
                      className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm focus:outline-none focus:border-brand-primary disabled:opacity-40 transition-colors"
                    >
                      <option value="" disabled>Select a designer…</option>
                      {designers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.full_name ?? d.email}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-1.5">Tracking Number</label>
                  <input
                    type="text"
                    value={trackingInput}
                    onChange={(e) => setTrackingInput(e.target.value)}
                    placeholder="e.g. 1Z999AA10123456784"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-1.5">Estimated Delivery</label>
                  <input
                    type="date"
                    value={deliveryInput}
                    onChange={(e) => setDeliveryInput(e.target.value)}
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm focus:outline-none focus:border-brand-primary transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-1.5">Internal Notes</label>
                  <textarea
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    rows={3}
                    placeholder="Any internal notes about this order…"
                    className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors resize-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveDetails}
                  disabled={saving}
                  className="w-full py-2.5 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-primary text-brand-bg hover:bg-brand-secondary disabled:opacity-40 transition-all"
                >
                  {saved ? "Saved ✓" : saving ? "Saving…" : "Save Details"}
                </button>
              </div>

              {/* Timestamps */}
              <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-2">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Timestamps</p>
                <DetailRow label="Submitted" value={new Date(order.created_at).toLocaleString()} />
                {order.approved_at && <DetailRow label="Approved" value={new Date(order.approved_at).toLocaleString()} />}
              </div>

              {/* Production File */}
              {order.production_file_url && (
                <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
                  <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Production File</p>
                  <p className="text-xs font-barlow text-brand-muted mb-3 leading-relaxed">
                    Auto-generated on client approval. Contains flat jersey + shorts template with all 7 color zones and CMYK specifications.
                  </p>
                  <a
                    href={order.production_file_url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-primary text-brand-bg text-xs font-display font-bold uppercase tracking-widest hover:bg-brand-secondary transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download SVG Template
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Concepts */}
          {order.concepts.length > 0 && (
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-4">Concepts</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {order.concepts.map((c) => (
                  <div key={c.id} className={`rounded-xl overflow-hidden border ${c.selected ? "border-brand-primary" : "border-brand-border"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image_url} alt={`Concept ${c.concept_number}`} className="w-full aspect-square object-cover" />
                    <div className={`px-3 py-2 flex items-center gap-1.5 ${c.selected ? "bg-brand-primary/10" : "bg-brand-surface"}`}>
                      {c.selected && <span className="w-1.5 h-1.5 rounded-full bg-brand-primary" />}
                      <span className="text-xs font-barlow text-brand-muted">Concept {c.concept_number}</span>
                      {c.selected && <span className="text-xs font-barlow text-brand-primary ml-auto">Selected</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Colors ──────────────────────────────────────────────────────── */}
          {order.brief && (order.brief.primary_colors || order.brief.secondary_colors || order.brief.accent_color) && (
            <div>
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Colors</p>
              <div className="flex flex-wrap gap-3">
                {[
                  { label: "Primary",   value: order.brief.primary_colors },
                  { label: "Secondary", value: order.brief.secondary_colors },
                  { label: "Accent",    value: order.brief.accent_color },
                ].filter((c) => c.value).map((c) =>
                  c.value!.split(",").map((hex) => hex.trim()).filter(Boolean).map((hex) => (
                    <div key={`${c.label}-${hex}`} className="flex items-center gap-2">
                      <div
                        className="w-7 h-7 rounded-lg border border-brand-border flex-shrink-0"
                        style={{ background: hex.startsWith("#") ? hex : `#${hex}` }}
                      />
                      <div>
                        <p className="text-[9px] font-display uppercase tracking-wider text-brand-muted">{c.label}</p>
                        <p className="text-xs font-mono text-brand-text">{hex}</p>
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
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary">
                  Player Roster
                </p>
                <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted">
                  {order.brief.player_roster.length} players
                </span>
              </div>
              <div className="border border-brand-border rounded-xl overflow-hidden">
                <table className="w-full text-sm font-barlow">
                  <thead>
                    <tr className="bg-brand-surface border-b border-brand-border">
                      {["#", "Name", "Number", "Size", "Cut"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] font-display uppercase tracking-wider text-brand-muted">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.brief.player_roster.map((player, i) => (
                      <tr key={i} className="border-b border-brand-border/50 last:border-0 hover:bg-brand-surface/40">
                        <td className="px-4 py-2.5 text-brand-muted text-xs">{i + 1}</td>
                        <td className="px-4 py-2.5 text-brand-text font-medium">{player.name || "—"}</td>
                        <td className="px-4 py-2.5 text-brand-text">{player.number || "—"}</td>
                        <td className="px-4 py-2.5 text-brand-text">{player.size || "—"}</td>
                        <td className="px-4 py-2.5 text-brand-muted capitalize">{player.cut || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── First Piece Review ──────────────────────────────────────────── */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary">First Piece Review</p>
              {order.media.length > 0 && (
                <span className="text-[10px] font-display uppercase tracking-wider text-brand-muted">
                  {order.media.filter((m) => m.admin_approved === null).length} pending ·{" "}
                  {order.media.filter((m) => m.admin_approved === true).length} approved ·{" "}
                  {order.media.filter((m) => m.client_approved === true).length} client OK
                </span>
              )}
            </div>

            {order.media.length === 0 ? (
              <p className="text-sm font-barlow text-brand-muted">
                No uploads yet. The supplier will post photos and video here once the first piece is ready.
              </p>
            ) : (
              <div className="space-y-4">
                {order.media.map((item) => (
                  <div key={item.id} className="border border-brand-border rounded-xl overflow-hidden">
                    <div className="flex gap-4 p-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 w-28 h-28 rounded-lg overflow-hidden bg-brand-bg border border-brand-border">
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
                          <span className="text-[9px] font-display uppercase tracking-wider text-brand-muted">
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
                          <p className="text-xs font-barlow text-brand-text">{item.caption}</p>
                        )}
                        {item.admin_note && (
                          <p className="text-xs font-barlow text-brand-muted">Admin note: {item.admin_note}</p>
                        )}
                        {item.client_note && (
                          <p className="text-xs font-barlow text-amber-400">Client note: {item.client_note}</p>
                        )}

                        {/* Full media link */}
                        <a
                          href={item.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
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
                            className="px-3 py-1.5 rounded-lg border border-brand-border text-xs font-display uppercase tracking-wider text-brand-muted hover:border-brand-primary hover:text-brand-primary transition-all"
                          >
                            Review
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline review panel */}
                    {reviewingId === item.id && (
                      <div className="border-t border-brand-border bg-brand-bg p-4 space-y-3">
                        <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted">
                          Add a note (optional)
                        </p>
                        <textarea
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          rows={2}
                          placeholder="Feedback for the supplier or internal notes…"
                          className="w-full bg-brand-surface border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors resize-none"
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
                            className="px-3 py-2.5 rounded-lg border border-brand-border text-brand-muted hover:text-brand-text font-barlow text-xs transition-all"
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
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-4">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Final Production Files</p>
            <p className="text-[11px] font-barlow text-brand-muted">
              Upload print-ready files, vector source, or any deliverables for this order. The client will be able to download these.
            </p>

            {/* Existing files */}
            {orderFiles.length > 0 && (
              <div className="space-y-2">
                {orderFiles.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 bg-brand-bg rounded-lg border border-brand-border">
                    <div className="flex-1 min-w-0">
                      {f.label && (
                        <p className="text-[9px] font-display uppercase tracking-wider text-brand-muted">{f.label}</p>
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
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
                    >
                      Open ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => deleteFile(f.id, f.file_url)}
                      className="flex-shrink-0 text-[10px] font-display uppercase tracking-wider text-brand-muted hover:text-[#C41E1E] transition-colors"
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
                <label className="block text-[10px] font-display uppercase tracking-wider text-brand-muted mb-1.5">
                  File Label
                </label>
                <input
                  type="text"
                  value={fileLabel}
                  onChange={(e) => setFileLabel(e.target.value)}
                  placeholder="e.g. Print-Ready Files, Vector Source"
                  className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted/60 focus:outline-none focus:border-brand-primary transition-colors"
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
                className="w-full py-2.5 rounded-lg font-display font-bold text-sm uppercase tracking-widest bg-brand-bg border border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-primary disabled:opacity-40 transition-all"
              >
                {fileSaved ? "Uploaded ✓" : fileUploading ? "Uploading…" : "+ Upload File"}
              </button>
            </div>
          </div>

        </div>

          {/* ── Activity Feed ──────────────────────────────────────────── */}
          <div className="bg-brand-surface border border-brand-border rounded-xl p-5 space-y-3">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary">Activity</p>
            {activityLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : activity.length === 0 ? (
              <p className="text-sm font-barlow text-brand-muted py-2">No activity recorded yet.</p>
            ) : (
              <div className="space-y-0">
                {activity.map((item, i) => (
                  <div key={item.id} className="flex gap-3 relative">
                    {/* Timeline line */}
                    {i < activity.length - 1 && (
                      <div className="absolute left-[7px] top-5 bottom-0 w-px bg-brand-border" />
                    )}
                    {/* Dot */}
                    <div className="w-3.5 h-3.5 rounded-full bg-brand-surface border-2 border-brand-primary flex-shrink-0 mt-1 relative z-10" />
                    <div className="pb-4 flex-1 min-w-0">
                      <p className="text-sm font-barlow text-brand-text leading-snug">{item.event_message}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] font-barlow text-brand-muted">{item.actor_name}</p>
                        {item.actor_role && (
                          <span className="text-[9px] font-display uppercase tracking-wider text-brand-muted">
                            · {item.actor_role}
                          </span>
                        )}
                        <span className="text-[9px] font-barlow text-brand-muted">
                          · {new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

      </main>

      {showSupplierModal && (
        <SupplierPickerModal
          currentId={order.supplier_user_id ?? null}
          onSelect={async (id) => {
            setShowSupplierModal(false);
            await assignSupplier(id);
          }}
          onUnassign={async () => {
            setShowSupplierModal(false);
            await assignSupplier(null);
          }}
          onClose={() => setShowSupplierModal(false)}
        />
      )}
    </div>
  );
}

// ─── Supplier picker modal ────────────────────────────────────────────────────

function SupplierPickerModal({
  currentId,
  onSelect,
  onUnassign,
  onClose,
}: {
  currentId: string | null;
  onSelect: (id: string) => void;
  onUnassign: () => void;
  onClose: () => void;
}) {
  const [suppliers, setSuppliers] = useState<SupplierWithPortfolio[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    fetch("/api/admin/suppliers")
      .then((r) => r.json())
      .then(({ suppliers: data }) => { setSuppliers(data ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-brand-bg border border-brand-border rounded-2xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-brand-border flex items-center justify-between flex-shrink-0">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.25em] text-brand-muted">Assign</p>
            <h2 className="font-display font-bold text-lg uppercase tracking-wide text-brand-text">Production Partner</h2>
          </div>
          <button onClick={onClose} className="text-brand-muted hover:text-brand-text text-xl leading-none transition-colors">×</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-3">
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : suppliers.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-brand-muted font-barlow text-sm">No suppliers registered yet.</p>
              <p className="text-xs text-brand-muted font-barlow mt-1 opacity-60">
                Have production partners sign up at /signup as a Production Partner.
              </p>
            </div>
          ) : (
            suppliers.map((s) => {
              const isAssigned = s.id === currentId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-all group ${
                    isAssigned
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-brand-border hover:border-brand-primary bg-brand-surface"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center flex-shrink-0 text-sm font-display font-bold text-brand-primary uppercase">
                      {(s.company ?? s.full_name ?? "?")[0]}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm">
                          {s.company ?? s.full_name ?? s.email}
                        </p>
                        {isAssigned && (
                          <span className="text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/30">
                            Current
                          </span>
                        )}
                        {s.active_count > 0 && (
                          <span className="text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-500 border border-amber-400/30">
                            {s.active_count} active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-brand-muted font-barlow mt-0.5">{s.email}</p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px] font-barlow text-brand-muted">
                          {s.order_count} order{s.order_count !== 1 ? "s" : ""} total
                        </span>
                        {/* Sport tags from portfolio */}
                        {Array.from(new Set(s.portfolio.map((p) => p.sport).filter(Boolean))).slice(0, 3).map((sport) => (
                          <span key={sport} className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded bg-brand-surface border border-brand-border text-brand-muted">
                            {sport}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Portfolio thumbnails */}
                    {s.portfolio.length > 0 && (
                      <div className="flex gap-1 flex-shrink-0">
                        {s.portfolio.slice(0, 3).map((item) => (
                          <div key={item.id} className="w-12 h-12 rounded-lg overflow-hidden border border-brand-border flex-shrink-0">
                            <img src={item.image_url} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                        {s.portfolio.length > 3 && (
                          <div className="w-12 h-12 rounded-lg border border-brand-border flex items-center justify-center bg-brand-surface flex-shrink-0">
                            <span className="text-[10px] font-display text-brand-muted">+{s.portfolio.length - 3}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        {currentId && (
          <div className="px-6 py-4 border-t border-brand-border flex-shrink-0">
            <button
              type="button"
              onClick={onUnassign}
              className="text-xs font-display uppercase tracking-wider text-brand-muted hover:text-red-400 transition-colors"
            >
              Remove Assignment
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

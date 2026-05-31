"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import AdminHeader from "@/components/AdminHeader";
import type { WorkflowOrder } from "@/app/api/admin/workflow/route";
import { PRODUCTION_PRICING_TIERS, formatCents } from "@/lib/payments/supplier-pricing";

// ─── Column definitions ───────────────────────────────────────────────────────
//
// Each column groups the DB stage(s) that belong to it. The page does the
// bucketing; the API returns a flat list of production orders.

const COLUMNS = [
  {
    key:    "mockup_in_progress" as const,
    label:  "Mockup In Progress",
    role:   "Creates & Uploads",
    stages: ["mockup_in_progress"],
    accent: "text-violet-400",
    dot:    "bg-violet-400",
  },
  {
    key:    "mockup_review" as const,
    label:  "Mockup Review",
    role:   "Monitors Client",
    stages: ["mockup_review", "mockup_revision"],
    accent: "text-amber-400",
    dot:    "bg-amber-400",
  },
  {
    key:    "production_files" as const,
    label:  "Production Files",
    role:   "Uploads + Payment Gate",
    stages: ["production_files_prep", "sent_to_supplier", "files_sent"],
    accent: "text-brand-primary",
    dot:    "bg-brand-primary",
  },
  {
    key:    "first_piece_in_production" as const,
    label:  "First Piece In Production",
    role:   "Monitors Supplier",
    stages: ["first_piece_in_progress", "first_piece_revision"],
    accent: "text-blue-400",
    dot:    "bg-blue-400",
  },
  {
    key:    "first_piece_review" as const,
    label:  "First Piece Review",
    role:   "Reviews & Facilitates",
    stages: ["first_piece_review"],
    accent: "text-amber-400",
    dot:    "bg-amber-400",
  },
  {
    key:    "bulk_production" as const,
    label:  "Bulk Production",
    role:   "Monitors Production",
    stages: ["bulk_production"],
    accent: "text-blue-400",
    dot:    "bg-blue-400",
  },
  {
    key:    "quality_check" as const,
    label:  "Quality Check",
    role:   "QC + Final Payment",
    stages: ["qc_verified"],
    accent: "text-violet-400",
    dot:    "bg-violet-400",
  },
  {
    key:    "shipped" as const,
    label:  "Shipped",
    role:   "Verifies Shipment",
    stages: ["shipped"],
    accent: "text-green-400",
    dot:    "bg-green-400",
  },
  {
    key:    "delivered" as const,
    label:  "Delivered",
    role:   "Confirms & Archives",
    stages: ["delivered", "complete"],
    accent: "text-green-400",
    dot:    "bg-green-400",
  },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

// ─── Action badge logic ────────────────────────────────────────────────────────

type BadgeVariant = "urgent" | "warning" | "info" | "success" | "muted";

interface ActionBadge {
  label:   string;
  variant: BadgeVariant;
}

function getActionBadge(order: WorkflowOrder, colKey: ColumnKey): ActionBadge {
  if (order.on_hold) return { label: "On Hold", variant: "warning" };

  switch (colKey) {
    case "mockup_in_progress":
      if (order.mockup_count === 0) return { label: "Upload Mockup", variant: "urgent" };
      return { label: "Send to Client", variant: "warning" };

    case "mockup_review":
      if (order.stage === "mockup_revision") return { label: "Revision In Progress", variant: "info" };
      return { label: "Awaiting Client", variant: "muted" };

    case "production_files":
      if (order.production_files_count === 0) return { label: "Upload Production Files", variant: "urgent" };
      if (!order.deposit_paid) return { label: "Awaiting First Payment", variant: "warning" };
      if (!order.supplier_profile) return { label: "Release to Supplier →", variant: "success" };
      return { label: "Production Released", variant: "success" };

    case "first_piece_in_production":
      if (!order.supplier_profile) return { label: "Assign Supplier", variant: "urgent" };
      if (order.stage === "first_piece_revision") return { label: "Supplier Revision", variant: "info" };
      return { label: "Supplier In Production", variant: "muted" };

    case "bulk_production":
      if (!order.supplier_profile) return { label: "Assign Supplier", variant: "urgent" };
      if (!order.balance_paid) return { label: "Awaiting Final Payment", variant: "warning" };
      return { label: "Supplier In Production", variant: "muted" };

    case "first_piece_review":
      if (order.first_piece_media.total === 0) return { label: "Awaiting Supplier Upload", variant: "muted" };
      if (order.first_piece_media.pending_admin > 0) return { label: "Review Uploads Internally", variant: "warning" };
      return { label: "Awaiting Client Approval", variant: "muted" };

    case "quality_check":
      if (!order.deposit_paid) return { label: "First Payment Missing", variant: "urgent" };
      if (!order.balance_paid) return { label: "Awaiting Final Payment", variant: "warning" };
      return { label: "Ready to Ship", variant: "success" };

    case "shipped":
      if (!order.tracking_number) return { label: "Add Tracking Number", variant: "warning" };
      return { label: "In Transit", variant: "success" };

    case "delivered":
      return { label: "Confirm & Archive", variant: "info" };

    default:
      return { label: "Review Order", variant: "muted" };
  }
}

const BADGE_STYLES: Record<BadgeVariant, string> = {
  urgent:  "bg-red-500/10 text-red-400 border-red-400/30",
  warning: "bg-amber-400/10 text-amber-400 border-amber-400/30",
  info:    "bg-blue-400/10 text-blue-400 border-blue-400/30",
  success: "bg-green-400/10 text-green-400 border-green-400/30",
  muted:   "bg-brand-surface text-brand-muted border-brand-border",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isOverdue(order: WorkflowOrder): boolean {
  if (!order.estimated_delivery) return false;
  return new Date(order.estimated_delivery) < new Date();
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function OrderCard({ order, colKey }: { order: WorkflowOrder; colKey: ColumnKey }) {
  const router  = useRouter();
  const badge   = getActionBadge(order, colKey);
  const overdue = isOverdue(order);

  return (
    <div
      onClick={() => router.push(`/admin/orders/${order.id}`)}
      className="bg-brand-bg border border-brand-border rounded-lg p-3 cursor-pointer hover:border-brand-primary/50 transition-colors space-y-2.5 group"
    >
      {/* Client + order # */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-barlow font-medium text-brand-text leading-tight truncate group-hover:text-brand-primary transition-colors">
          {order.client.name}
        </p>
        <span className="text-[9px] font-mono text-brand-muted flex-shrink-0 mt-0.5">
          #{order.order_number ?? order.id.slice(0, 6)}
        </span>
      </div>

      {/* Tags row: sport, overdue, on-hold */}
      {(order.client.sport || overdue || order.on_hold) && (
        <div className="flex items-center gap-1 flex-wrap">
          {order.client.sport && (
            <span className="text-[9px] font-barlow capitalize text-brand-muted bg-brand-surface border border-brand-border px-1.5 py-0.5 rounded">
              {order.client.sport}
            </span>
          )}
          {overdue && (
            <span className="text-[9px] font-display uppercase tracking-wider text-red-400 bg-red-500/10 border border-red-400/30 px-1.5 py-0.5 rounded">
              Overdue {fmtDate(order.estimated_delivery)}
            </span>
          )}
          {order.on_hold && (
            <span className="text-[9px] font-display uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 rounded">
              On Hold
            </span>
          )}
        </div>
      )}

      {/* Primary action badge */}
      <div className={`px-2 py-1.5 rounded border text-[10px] font-display font-bold uppercase tracking-[0.14em] ${BADGE_STYLES[badge.variant]}`}>
        {badge.label}
      </div>

      {/* Column-specific status pills */}
      <StatusPills order={order} colKey={colKey} />

      {/* People: designer + supplier */}
      {(order.assigned_designer || order.supplier_profile) && (
        <div className="space-y-0.5 pt-0.5">
          {order.assigned_designer && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-shrink-0" />
              <p className="text-[10px] font-barlow text-brand-muted truncate">
                {order.assigned_designer.full_name ?? order.assigned_designer.email}
              </p>
            </div>
          )}
          {order.supplier_profile && (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
              <p className="text-[10px] font-barlow text-brand-muted truncate">
                {order.supplier_profile.company ?? order.supplier_profile.full_name ?? "Supplier"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Status pills that vary by column
function StatusPills({ order, colKey }: { order: WorkflowOrder; colKey: ColumnKey }) {
  const pills: { label: string; style: string }[] = [];

  // Payment pills — shown for columns with payment gates
  if (["production_files", "quality_check", "first_piece_in_production", "bulk_production", "shipped"].includes(colKey)) {
    if (order.balance_paid) {
      pills.push({ label: "Paid In Full", style: "bg-green-400/10 text-green-400 border-green-400/30" });
    } else if (order.deposit_paid) {
      pills.push({ label: "1st Payment ✓", style: "bg-green-400/10 text-green-400 border-green-400/30" });
    } else if (["production_files", "quality_check"].includes(colKey)) {
      pills.push({ label: "Awaiting First Payment", style: "bg-red-500/10 text-red-400 border-red-400/30" });
    }
  }

  // Supplier + pricing pills — shown in production_files and first_piece_in_production
  if (["production_files", "first_piece_in_production", "bulk_production"].includes(colKey)) {
    if (order.supplier_profile) {
      const supplierName = order.supplier_profile.company ?? order.supplier_profile.full_name ?? "Supplier";
      const isPreferred  = order.preferred_supplier_assigned;
      pills.push({
        label: isPreferred ? `Preferred · ${supplierName}` : supplierName,
        style: isPreferred
          ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30"
          : "bg-brand-surface text-brand-muted border-brand-border",
      });
    }

    if (order.production_pricing_tier) {
      const tierLabel = PRODUCTION_PRICING_TIERS[order.production_pricing_tier]?.label ?? order.production_pricing_tier;
      pills.push({ label: `${tierLabel} Pricing`, style: "bg-brand-surface text-brand-muted border-brand-border" });
    }

    if (order.production_total_cents) {
      pills.push({
        label: `${formatCents(order.production_total_cents)} total${order.quantity ? ` · ${order.quantity} sets` : ""}`,
        style: "bg-brand-surface text-brand-muted border-brand-border",
      });
    }

    if (order.production_deposit_cents && !order.deposit_paid) {
      pills.push({
        label: `Deposit: ${formatCents(order.production_deposit_cents)}`,
        style: "bg-amber-400/10 text-amber-400 border-amber-400/30",
      });
    }
    if (order.production_balance_cents && order.deposit_paid && !order.balance_paid) {
      pills.push({
        label: `Balance: ${formatCents(order.production_balance_cents)}`,
        style: "bg-amber-400/10 text-amber-400 border-amber-400/30",
      });
    }
  }

  // Mockup count — Mockup In Progress
  if (colKey === "mockup_in_progress" && order.mockup_count > 0) {
    pills.push({ label: `${order.mockup_count} Mockup${order.mockup_count !== 1 ? "s" : ""} Uploaded`, style: "bg-violet-400/10 text-violet-400 border-violet-400/30" });
  }

  // Revision state pills
  if (colKey === "mockup_review" && order.mockup_revision_used) {
    pills.push({ label: "1 Revision Used", style: "bg-brand-surface text-brand-muted border-brand-border" });
  }
  if (colKey === "first_piece_review" && order.first_piece_revision_used) {
    pills.push({ label: "1 Revision Used", style: "bg-brand-surface text-brand-muted border-brand-border" });
  }

  // First piece media pills
  if (["first_piece_review", "first_piece_in_production"].includes(colKey)) {
    if (order.first_piece_media.total > 0) {
      pills.push({ label: `${order.first_piece_media.total} Upload${order.first_piece_media.total !== 1 ? "s" : ""}`, style: "bg-brand-surface text-brand-muted border-brand-border" });
    }
    if (order.first_piece_media.client_approved > 0) {
      pills.push({ label: "Client Approved", style: "bg-green-400/10 text-green-400 border-green-400/30" });
    }
  }

  // Production files pill
  if (colKey === "production_files" && order.production_files_count > 0) {
    pills.push({ label: `${order.production_files_count} File${order.production_files_count !== 1 ? "s" : ""} Uploaded`, style: "bg-brand-surface text-brand-muted border-brand-border" });
  }

  // Tracking
  if (colKey === "shipped" && order.tracking_number) {
    pills.push({ label: "Tracking ✓", style: "bg-green-400/10 text-green-400 border-green-400/30" });
  }

  // Invoice status (non-paid states)
  if (order.invoice_status && !["paid", "partially_paid"].includes(order.invoice_status)) {
    pills.push({ label: order.invoice_status.replace(/_/g, " "), style: "bg-brand-surface text-brand-muted border-brand-border" });
  }

  if (!pills.length) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {pills.map((p) => (
        <span key={p.label} className={`text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded border ${p.style}`}>
          {p.label}
        </span>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkflowPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [orders, setOrders] = useState<WorkflowOrder[]>([]);
  const [loading, setLoading] = useState(true);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const load = useCallback(async () => {
    const profile = await getProfile();
    if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
      router.replace("/portal");
      return;
    }
    const res = await fetch("/api/admin/workflow");
    if (res.ok) {
      const d = await res.json() as { orders: WorkflowOrder[] };
      setOrders(d.orders ?? []);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Bucket orders by their DERIVED lifecycle phase (single source of truth),
  // not the raw stage column. This keeps the board in lockstep with the client
  // status page and portal production tab.
  const columnOrders = (colKey: ColumnKey): WorkflowOrder[] =>
    orders.filter((o) => o.phase === colKey);

  const urgentCount = orders.filter((o) => {
    const col = COLUMNS.find((c) => c.key === o.phase);
    if (!col) return false;
    return getActionBadge(o, col.key).variant === "urgent";
  }).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <AdminHeader onSignOut={signOut} activePath="/admin/workflow" />

      <main className="flex-1 px-4 py-6 overflow-x-auto">
        <div className="min-w-max">

          {/* Title row */}
          <div className="flex items-center gap-3 mb-6 px-1">
            <div>
              <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mb-0.5">Grace Studios</p>
              <h1 className="font-display text-xl font-bold uppercase tracking-wide text-brand-text">
                Production Workflow
              </h1>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <span className="px-2.5 py-1 rounded-full bg-brand-surface border border-brand-border text-xs font-display uppercase tracking-wider text-brand-muted">
                {orders.length} active
              </span>
              {urgentCount > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-500/10 border border-red-400/30 text-xs font-display uppercase tracking-wider text-red-400">
                  {urgentCount} urgent
                </span>
              )}
            </div>
          </div>

          {orders.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-brand-surface border border-brand-border flex items-center justify-center mx-auto mb-4">
                  <svg className="w-5 h-5 text-brand-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
                  </svg>
                </div>
                <p className="font-display font-bold uppercase tracking-widest text-sm text-brand-text mb-2">No Production Orders</p>
                <p className="text-sm font-barlow text-brand-muted">Orders will appear here once clients proceed to production.</p>
              </div>
            </div>
          ) : (
            /* Kanban board */
            <div className="flex gap-3 pb-6 items-start">
              {COLUMNS.map((col) => {
                const cards = columnOrders(col.key);
                const urgentInCol = cards.filter((o) => getActionBadge(o, col.key).variant === "urgent").length;
                return (
                  <div key={col.key} className="w-52 flex-shrink-0">

                    {/* Column header */}
                    <div className="mb-3 px-0.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <p className={`text-[10px] font-display font-bold uppercase tracking-widest ${col.accent}`}>
                          {col.label}
                        </p>
                        <div className="flex items-center gap-1">
                          {urgentInCol > 0 && (
                            <span className="text-[9px] font-display font-bold text-red-400 bg-red-500/10 border border-red-400/30 rounded-full w-4 h-4 flex items-center justify-center">
                              {urgentInCol}
                            </span>
                          )}
                          {cards.length > 0 && (
                            <span className="text-[9px] font-display font-bold text-brand-muted bg-brand-surface border border-brand-border rounded-full w-4 h-4 flex items-center justify-center">
                              {cards.length}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-[8px] font-barlow text-brand-muted/60 uppercase tracking-wider">
                        {col.role}
                      </p>
                      {/* Column accent line */}
                      <div className={`mt-2 h-0.5 rounded-full opacity-40 ${col.dot}`} />
                    </div>

                    {/* Cards */}
                    <div className="space-y-2 min-h-12">
                      {cards.length === 0 ? (
                        <div className="border border-dashed border-brand-border/50 rounded-lg px-3 py-5 text-center">
                          <p className="text-[9px] font-barlow text-brand-muted/40">Empty</p>
                        </div>
                      ) : (
                        cards.map((order) => (
                          <OrderCard key={order.id} order={order} colKey={col.key} />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

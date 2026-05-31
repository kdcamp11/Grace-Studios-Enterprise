"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import MobileDropdown from "@/components/MobileDropdown";
import { useTenant } from "@/lib/tenant/context";
import type { SupplierOrder, SupplierPhase } from "@/app/api/supplier/orders/route";

// ── Column definitions ────────────────────────────────────────────────────────

const COLUMNS: {
  phase: SupplierPhase;
  label: string;
  description: string;
  accent: string;
  dot: string;
}[] = [
  {
    phase: "awaiting_release",
    label: "Awaiting Release",
    description: "GE is preparing production files",
    accent: "text-slate-400",
    dot: "bg-slate-400",
  },
  {
    phase: "first_piece_production",
    label: "First Piece In Production",
    description: "Manufacture first piece sample",
    accent: "text-amber-400",
    dot: "bg-amber-400",
  },
  {
    phase: "first_piece_upload",
    label: "First Piece Upload",
    description: "Upload sample photos for review",
    accent: "text-brand-primary",
    dot: "bg-brand-primary",
  },
  {
    phase: "bulk_production",
    label: "Bulk Production",
    description: "Manufacture full roster order",
    accent: "text-blue-400",
    dot: "bg-blue-400",
  },
  {
    phase: "supplier_qc",
    label: "Supplier QC",
    description: "Quality check & add tracking",
    accent: "text-purple-400",
    dot: "bg-purple-400",
  },
  {
    phase: "shipment_upload",
    label: "Shipment Upload",
    description: "Confirm tracking & mark shipped",
    accent: "text-green-400",
    dot: "bg-green-400",
  },
];

// ── Action badge logic ────────────────────────────────────────────────────────

function getActionBadge(order: SupplierOrder): { label: string; variant: "urgent" | "warning" | "info" | "muted" } {
  const { supplier_phase, stage, deposit_paid, balance_paid, fp_media } = order;

  if (supplier_phase === "awaiting_release") {
    return { label: "Awaiting Files", variant: "muted" };
  }

  if (supplier_phase === "first_piece_production") {
    if (!deposit_paid) return { label: "Awaiting Payment", variant: "warning" };
    return { label: "Start First Piece →", variant: "info" };
  }

  if (supplier_phase === "first_piece_upload") {
    if (stage === "first_piece_review") return { label: "Awaiting GE Review", variant: "muted" };
    if (stage === "first_piece_revision") return { label: "Revision Requested", variant: "urgent" };
    if (fp_media.changes_requested > 0) return { label: "Changes Requested", variant: "urgent" };
    return { label: "Submit for Review →", variant: "info" };
  }

  if (supplier_phase === "bulk_production") {
    if (!balance_paid) return { label: "Awaiting Final Payment", variant: "warning" };
    return { label: "In Production", variant: "info" };
  }

  if (supplier_phase === "supplier_qc") {
    return { label: "Add Tracking →", variant: "info" };
  }

  if (supplier_phase === "shipment_upload") {
    if (stage === "qc_verified") return { label: "Mark Shipped →", variant: "info" };
    return { label: stage === "delivered" ? "Delivered" : "Shipped", variant: "muted" };
  }

  return { label: "—", variant: "muted" };
}

const BADGE_STYLES: Record<string, string> = {
  urgent:  "text-[#C41E1E] bg-[#C41E1E]/10 border-[#C41E1E]/30",
  warning: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  info:    "text-brand-primary bg-brand-primary/10 border-brand-primary/30",
  muted:   "text-brand-muted bg-brand-surface border-brand-border",
};

// ── Subcomponents ─────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onClick,
}: {
  order: SupplierOrder;
  onClick: () => void;
}) {
  const badge = getActionBadge(order);
  const isUrgent = badge.variant === "urgent";
  const overdue = order.estimated_delivery
    ? new Date(order.estimated_delivery) < new Date()
    : false;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-brand-surface border rounded-xl p-4 transition-all duration-150 group ${
        isUrgent ? "border-[#C41E1E]/40 hover:border-[#C41E1E]" : "border-brand-border hover:border-brand-primary"
      }`}
    >
      {/* Client + order# */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="font-display font-bold uppercase tracking-wider text-brand-text text-[11px] group-hover:text-brand-primary transition-colors truncate">
            {order.client.name}
          </p>
          <p className="text-[10px] font-barlow text-brand-muted truncate">
            {order.order_number ? `#${order.order_number}` : order.id.slice(0, 8).toUpperCase()}
            {order.client.sport ? ` · ${order.client.sport}` : ""}
          </p>
        </div>
        <span className={`flex-shrink-0 inline-block text-[9px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full border ${BADGE_STYLES[badge.variant]}`}>
          {badge.label}
        </span>
      </div>

      {/* Tags */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {overdue && (
          <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#C41E1E]/10 border border-[#C41E1E]/30 text-[#C41E1E]">
            Overdue
          </span>
        )}
        {!order.deposit_paid && (
          <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-400">
            Deposit Pending
          </span>
        )}
        {order.fp_media.total > 0 && (
          <span className="text-[9px] font-barlow text-brand-muted">
            {order.fp_media.total} upload{order.fp_media.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Est. delivery */}
      {order.estimated_delivery && (
        <p className="text-[9px] font-barlow text-brand-muted">
          Est. {new Date(order.estimated_delivery).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      )}
    </button>
  );
}

function Column({
  col,
  orders,
  onCardClick,
}: {
  col: typeof COLUMNS[number];
  orders: SupplierOrder[];
  onCardClick: (id: string) => void;
}) {
  const urgentCount = orders.filter((o) => getActionBadge(o).variant === "urgent").length;
  return (
    <div className="flex-shrink-0 w-64 flex flex-col">
      {/* Column header */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`w-1.5 h-1.5 rounded-full ${col.dot}`} />
          <p className={`text-[10px] font-display uppercase tracking-[0.2em] ${col.accent}`}>
            {col.label}
          </p>
          {orders.length > 0 && (
            <span className="ml-auto text-[10px] font-display font-bold text-brand-muted bg-brand-surface border border-brand-border rounded-full px-1.5 py-0.5 leading-none">
              {orders.length}
            </span>
          )}
        </div>
        <p className="text-[9px] font-barlow text-brand-muted/60 pl-3.5">{col.description}</p>
        {urgentCount > 0 && (
          <div className="mt-1.5 pl-3.5">
            <span className="text-[9px] font-display uppercase tracking-wider text-[#C41E1E]">
              {urgentCount} urgent
            </span>
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 min-h-[60px]">
        {orders.length === 0 ? (
          <div className="border border-dashed border-brand-border rounded-xl p-4 text-center">
            <p className="text-[10px] font-barlow text-brand-muted/50">No orders</p>
          </div>
        ) : (
          orders.map((o) => (
            <OrderCard key={o.id} order={o} onClick={() => onCardClick(o.id)} />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main page component ───────────────────────────────────────────────────────

function SupplierPortalContent() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const tenant = useTenant();
  const searchParams = useSearchParams();
  const justUpdated = searchParams.get("updated");

  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [isAdminView, setIsAdminView] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const profile = await getProfile();
      if (profile && profile.role !== "supplier" && profile.role !== "admin") {
        router.replace("/portal");
        return;
      }
      if (profile?.role === "admin") setIsAdminView(true);
      setName(profile?.full_name ?? profile?.company ?? (profile?.role === "admin" ? "Admin" : "Supplier"));

      const res = await fetch("/api/supplier/orders");
      if (res.ok) {
        const json = await res.json();
        setOrders(json.orders ?? []);
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Bucket by supplier phase
  const byPhase = new Map<SupplierPhase, SupplierOrder[]>();
  for (const col of COLUMNS) byPhase.set(col.phase, []);
  for (const o of orders) {
    byPhase.get(o.supplier_phase)?.push(o);
  }

  const totalActive = orders.filter((o) => o.supplier_phase !== "shipment_upload" || o.stage === "qc_verified").length;
  const totalUrgent = orders.filter((o) => getActionBadge(o).variant === "urgent").length;

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">Admin View: Supplier Portal</span>
          <div className="ml-auto flex items-center gap-4">
            <a href="/admin/suppliers" className="text-xs font-display font-bold uppercase tracking-wider text-amber-600 hover:text-amber-800 transition-colors">
              Manage Suppliers →
            </a>
            <button type="button" onClick={() => router.push("/admin")} className="text-xs font-display font-bold uppercase tracking-wider text-amber-600 hover:text-amber-800 transition-colors">
              ← Admin Portal
            </button>
          </div>
        </div>
      )}

      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <TenantLogo href="/supplier" />
        <div className="hidden lg:flex items-center gap-5">
          <span className="text-xs text-brand-muted font-barlow">{name}</span>
          <a href="/supplier/billing" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Billing</a>
          <a href="/supplier/settings" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Settings</a>
          {isAdminView && (
            <a href="/admin" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Admin</a>
          )}
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
        <div className="lg:hidden">
          <MobileDropdown
            groups={[
              [
                { label: "Billing", href: "/supplier/billing" },
                { label: "Settings", href: "/supplier/settings" },
                ...(isAdminView ? [{ label: "Admin", href: "/admin" }] : []),
              ],
              [{ label: "Sign Out", onClick: signOut }],
            ]}
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 px-6 py-6">
        {/* Page header */}
        <div className="mb-6 flex items-end justify-between">
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.22em] text-brand-muted mb-1">
              {tenant.name} · Supplier Portal
            </p>
            <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">
              Production Workspace
            </h1>
            <p className="text-sm text-brand-muted font-barlow mt-1">
              {orders.length === 0
                ? "No orders assigned yet."
                : `${totalActive} active · ${orders.length} total`}
              {totalUrgent > 0 && (
                <span className="ml-2 text-[#C41E1E] font-medium">{totalUrgent} need attention</span>
              )}
            </p>
          </div>
          {justUpdated && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-400/10 border border-green-400/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs font-barlow text-green-400">Updated</span>
            </div>
          )}
        </div>

        {orders.length === 0 ? (
          <div className="border border-dashed border-brand-border rounded-xl p-12 text-center">
            <p className="text-brand-muted font-barlow text-sm">No orders have been assigned to you yet.</p>
            <p className="text-xs text-brand-muted font-barlow mt-1 opacity-60">
              The {tenant.name} team will assign production orders as they are released.
            </p>
          </div>
        ) : (
          /* 6-column board — horizontal scroll */
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
            {COLUMNS.map((col) => (
              <Column
                key={col.phase}
                col={col}
                orders={byPhase.get(col.phase) ?? []}
                onCardClick={(id) => router.push(`/supplier/orders/${id}`)}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function SupplierPortalPage() {
  return (
    <Suspense>
      <SupplierPortalContent />
    </Suspense>
  );
}

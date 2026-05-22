"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import { useTenant } from "@/lib/tenant/context";
import type { OrderStage } from "@/types/database";

const STAGE_LABELS: Record<OrderStage, string> = {
  onboarding:              "Brief Submitted",
  design_confirmed:        "Design Confirmed",
  files_sent:              "Files Sent",
  first_piece_in_progress: "First Piece — In Progress",
  first_piece_review:      "First Piece — Under Review",
  bulk_production:         "Bulk Production",
  qc_verified:             "QC Verified",
  shipped:                 "Shipped",
  delivered:               "Delivered",
  complete:                "Complete",
};

const ACTIVE_STAGES: OrderStage[] = [
  "files_sent",
  "first_piece_in_progress",
  "first_piece_review",
  "bulk_production",
  "qc_verified",
];

interface AssignedOrder {
  id: string;
  order_number: string;
  stage: OrderStage;
  created_at: string;
  estimated_delivery: string | null;
  client: { name: string; sport: string; city: string };
  media_count: number;
  pending_review: boolean;      // awaiting admin review
  changes_requested: boolean;   // admin rejected at least one upload
}

function stageColor(stage: OrderStage) {
  if (stage === "first_piece_review") return "text-amber-400 bg-amber-400/10 border-amber-400/30";
  if (ACTIVE_STAGES.includes(stage))  return "text-brand-primary  bg-brand-primary/10  border-brand-primary/30";
  if (stage === "complete")           return "text-green-400 bg-green-400/10 border-green-400/30";
  return "text-brand-muted bg-brand-surface border-brand-border";
}

function SupplierPortalContent() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const tenant = useTenant();

  const [orders, setOrders]     = useState<AssignedOrder[]>([]);
  const [loading, setLoading]   = useState(true);
  const [name, setName]         = useState("");
  const [isAdminView, setIsAdminView] = useState(false);
  const searchParams = useSearchParams();
  const justUpdated  = searchParams.get("updated");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      const profile = await getProfile();
      if (profile && profile.role !== "supplier" && profile.role !== "admin") { router.replace("/portal"); return; }
      if (profile?.role === "admin") setIsAdminView(true);

      setName(profile?.full_name ?? profile?.company ?? (profile?.role === "admin" ? "Admin" : "Supplier"));

      // Fetch orders assigned to this supplier
      const { data: rawOrders } = await supabase
        .from("orders")
        .select("id, order_number, stage, created_at, estimated_delivery, clients(name, sport, city)")
        .eq("supplier_user_id", user.id)
        .order("created_at", { ascending: false });

      if (!rawOrders) { setLoading(false); return; }

      // Fetch media counts + pending admin reviews per order
      const orderIds = rawOrders.map((o) => o.id);
      const { data: mediaRows } = orderIds.length
        ? await supabase
            .from("first_piece_media")
            .select("order_id, admin_approved")
            .in("order_id", orderIds)
        : { data: [] };

      const mediaCounts: Record<string, number> = {};
      const pendingMap: Record<string, boolean> = {};
      const changesMap: Record<string, boolean> = {};
      for (const m of mediaRows ?? []) {
        mediaCounts[m.order_id] = (mediaCounts[m.order_id] ?? 0) + 1;
        if (m.admin_approved === null)   pendingMap[m.order_id]  = true;
        if (m.admin_approved === false)  changesMap[m.order_id]  = true;
      }

      setOrders(
        rawOrders.map((o) => {
          const client = Array.isArray(o.clients) ? o.clients[0] : o.clients;
          return {
            id: o.id,
            order_number: o.order_number,
            stage: o.stage as OrderStage,
            created_at: o.created_at,
            estimated_delivery: o.estimated_delivery,
            client: client as { name: string; sport: string; city: string },
            media_count: mediaCounts[o.id] ?? 0,
            pending_review: !!pendingMap[o.id],
            changes_requested: !!changesMap[o.id],
          };
        })
      );

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

  const active    = orders.filter((o) => ACTIVE_STAGES.includes(o.stage));
  const completed = orders.filter((o) => !ACTIVE_STAGES.includes(o.stage));

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">Admin View — Supplier Portal</span>
          <div className="ml-auto flex items-center gap-4">
            <a
              href="/admin/suppliers"
              className="text-xs font-display font-bold uppercase tracking-wider text-amber-600 hover:text-amber-800 transition-colors"
            >
              Manage Suppliers →
            </a>
            <button
              type="button"
              onClick={() => router.push("/admin")}
              className="text-xs font-display font-bold uppercase tracking-wider text-amber-600 hover:text-amber-800 font-barlow transition-colors"
            >
              ← Admin Portal
            </button>
          </div>
        </div>
      )}
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TenantLogo href="/supplier" />
          <a href="/supplier" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Supplier Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <span className="text-xs text-brand-muted font-barlow hidden sm:block">{name}</span>
          <a href="/supplier/portfolio" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Portfolio</a>
          {!isAdminView && (
            <a href="/settings" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Settings</a>
          )}
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 px-4 py-10 max-w-4xl mx-auto w-full">

        {/* Welcome */}
        <div className="mb-10">
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text">
            Your Orders
          </h1>
          <p className="text-sm text-brand-muted font-barlow mt-1">
            {orders.length === 0
              ? "No orders assigned yet — check back soon."
              : `${active.length} active · ${completed.length} completed`}
          </p>
          {justUpdated && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-400/10 border border-green-400/30">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs font-barlow text-green-400">Stage updated successfully</span>
            </div>
          )}
        </div>

        {orders.length === 0 && (
          <div className="border border-brand-border rounded-xl p-12 text-center">
            <p className="text-brand-muted font-barlow text-sm">No orders have been assigned to you yet.</p>
            <p className="text-xs text-brand-muted font-barlow mt-1 opacity-60">
              The {tenant.name} team will assign orders as they come in.
            </p>
          </div>
        )}

        {/* Active orders */}
        {active.length > 0 && (
          <section className="space-y-3 mb-10">
            <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-primary">Active</p>
            {active.map((order) => (
              <OrderCard key={order.id} order={order} onClick={() => router.push(`/supplier/orders/${order.id}`)} />
            ))}
          </section>
        )}

        {/* Completed orders */}
        {completed.length > 0 && (
          <section className="space-y-3">
            <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted">Completed</p>
            {completed.map((order) => (
              <OrderCard key={order.id} order={order} onClick={() => router.push(`/supplier/orders/${order.id}`)} />
            ))}
          </section>
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

function OrderCard({ order, onClick }: { order: AssignedOrder; onClick: () => void }) {
  const borderClass = order.changes_requested
    ? "border-red-300 hover:border-red-400"
    : "border-brand-border hover:border-brand-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-brand-surface border rounded-xl p-5 transition-all duration-150 group ${borderClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-display font-bold uppercase tracking-wider text-brand-text text-sm group-hover:text-brand-primary transition-colors">
              {order.order_number || order.id.slice(0, 8).toUpperCase()}
            </p>
            {order.changes_requested && (
              <span className="text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#C41E1E]/10 text-[#C41E1E] border border-[#C41E1E]/30">
                Changes Requested
              </span>
            )}
            {!order.changes_requested && order.pending_review && (
              <span className="text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30">
                Awaiting Review
              </span>
            )}
          </div>
          <p className="text-sm font-barlow text-brand-muted truncate">
            {order.client.name} · {order.client.sport} · {order.client.city}
          </p>
          {order.media_count > 0 && (
            <p className="text-xs font-barlow text-brand-muted mt-1 opacity-60">
              {order.media_count} upload{order.media_count !== 1 ? "s" : ""} submitted
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right space-y-1.5">
          <span className={`inline-block text-[10px] font-display uppercase tracking-wider px-2.5 py-1 rounded-full border ${stageColor(order.stage)}`}>
            {STAGE_LABELS[order.stage]}
          </span>
          {order.estimated_delivery && (
            <p className="text-[10px] font-barlow text-brand-muted block">
              Est. {new Date(order.estimated_delivery).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          )}
          <span className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted group-hover:text-brand-primary transition-colors">
            View →
          </span>
        </div>
      </div>
    </button>
  );
}

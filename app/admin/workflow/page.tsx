"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import AdminHeader from "@/components/AdminHeader";
import type { OrderStage } from "@/lib/supabase/types";
import type { WorkflowOrder } from "@/app/api/admin/workflow/route";

const STAGES: { key: OrderStage; label: string; color: string }[] = [
  { key: "onboarding",              label: "Brief",       color: "text-brand-muted" },
  { key: "design_confirmed",        label: "Design",      color: "text-brand-primary" },
  { key: "files_sent",              label: "Approved",    color: "text-brand-muted" },
  { key: "first_piece_in_progress", label: "First Piece", color: "text-brand-muted" },
  { key: "first_piece_review",      label: "FP Review",   color: "text-brand-primary" },
  { key: "bulk_production",         label: "Bulk",        color: "text-brand-muted" },
  { key: "qc_verified",             label: "QC",          color: "text-brand-muted" },
  { key: "shipped",                 label: "Shipped",     color: "text-brand-muted" },
  { key: "delivered",               label: "Delivered",   color: "text-emerald-600" },
];

function paymentRisk(order: WorkflowOrder): "ok" | "warn" | "block" {
  const productionStages: OrderStage[] = [
    "first_piece_in_progress", "first_piece_review",
    "bulk_production", "qc_verified", "shipped", "delivered",
  ];
  if (productionStages.includes(order.stage)) {
    if (!order.deposit_paid && !order.balance_paid) return "block";
    if (!order.deposit_paid) return "warn";
  }
  return "ok";
}

function isOverdue(order: WorkflowOrder): boolean {
  if (!order.estimated_delivery) return false;
  return new Date(order.estimated_delivery) < new Date();
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function OrderCard({ order }: { order: WorkflowOrder }) {
  const router = useRouter();
  const risk   = paymentRisk(order);
  const overdue = isOverdue(order);

  return (
    <div
      onClick={() => router.push(`/admin/orders/${order.id}`)}
      className="bg-brand-bg border border-brand-border rounded-lg p-3 cursor-pointer hover:border-brand-primary transition-colors space-y-2 group"
    >
      {/* Client + order number */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-barlow font-medium text-brand-text leading-tight truncate group-hover:text-brand-primary transition-colors">
          {order.client.name}
        </p>
        <span className="text-[9px] font-mono text-brand-muted flex-shrink-0">
          #{order.order_number ?? order.id.slice(0, 6)}
        </span>
      </div>

      {/* Sport */}
      {order.client.sport && (
        <p className="text-[10px] font-barlow text-brand-muted capitalize">{order.client.sport}</p>
      )}

      {/* Assigned */}
      <div className="space-y-0.5">
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
            <span className="w-1.5 h-1.5 rounded-full bg-brand-primary flex-shrink-0" />
            <p className="text-[10px] font-barlow text-brand-muted truncate">
              {order.supplier_profile.company ?? order.supplier_profile.full_name ?? "Supplier"}
            </p>
          </div>
        )}
      </div>

      {/* Tags row */}
      <div className="flex flex-wrap gap-1">
        {/* Due date */}
        {order.estimated_delivery && (
          <span className={`text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded border ${
            overdue
              ? "bg-red-500/10 text-red-400 border-red-400/30"
              : "bg-brand-surface text-brand-muted border-brand-border"
          }`}>
            {overdue ? "Overdue " : ""}{fmtDate(order.estimated_delivery)}
          </span>
        )}

        {/* Payment risk */}
        {risk === "block" && (
          <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded border bg-red-500/10 text-red-400 border-red-400/30">
            No Payment
          </span>
        )}
        {risk === "warn" && (
          <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-400/10 text-amber-400 border-amber-400/30">
            Deposit Only
          </span>
        )}
        {risk === "ok" && (order.deposit_paid || order.balance_paid) && (
          <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded border bg-green-400/10 text-green-400 border-green-400/30">
            {order.balance_paid ? "Paid" : "Deposit ✓"}
          </span>
        )}

        {/* Invoice status */}
        {order.invoice_status && order.invoice_status !== "paid" && (
          <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded border bg-brand-surface text-brand-muted border-brand-border">
            {order.invoice_status.replace(/_/g, " ")}
          </span>
        )}

        {/* No designer in design stages */}
        {(order.stage === "onboarding" || order.stage === "design_confirmed") && !order.assigned_designer && (
          <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded border bg-amber-400/10 text-amber-400 border-amber-400/30">
            No Designer
          </span>
        )}
      </div>
    </div>
  );
}

export default function WorkflowPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [stageData, setStageData] = useState<Record<string, WorkflowOrder[]>>({});
  const [counts, setCounts]       = useState<Record<string, number>>({});
  const [loading, setLoading]     = useState(true);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  useEffect(() => {
    async function load() {
      const profile = await getProfile();
      if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
        router.replace("/portal");
        return;
      }

      const res = await fetch("/api/admin/workflow");
      if (res.ok) {
        const d = await res.json() as { stages: Record<string, WorkflowOrder[]>; counts: Record<string, number> };
        setStageData(d.stages ?? {});
        setCounts(d.counts ?? {});
      }
      setLoading(false);
    }
    load();
  }, [router, supabase]);

  const totalActive = Object.values(counts).reduce((s, n) => s + n, 0);

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
          <div className="flex items-center gap-4 mb-5 px-1">
            <h1 className="font-display text-xl font-bold uppercase tracking-wide text-brand-text">
              Production Workflow
            </h1>
            <span className="px-2.5 py-1 rounded-full bg-brand-surface border border-brand-border text-xs font-display uppercase tracking-wider text-brand-muted">
              {totalActive} active
            </span>
          </div>

          {totalActive === 0 ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-brand-surface border border-brand-border flex items-center justify-center mx-auto mb-4">
                  <svg className="w-5 h-5 text-brand-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="font-display font-bold uppercase tracking-widest text-sm text-brand-text mb-2">No Active Orders</p>
                <p className="text-sm font-barlow text-brand-muted mb-4">Orders will appear here as clients submit briefs.</p>
                <a href="/portal" className="text-xs font-display uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
                  Go to Client Portal →
                </a>
              </div>
            </div>
          ) : (
            /* Kanban board */
            <div className="flex gap-3 pb-4">
              {STAGES.map(({ key, label, color }) => {
                const cards = stageData[key] ?? [];
                return (
                  <div key={key} className="w-56 flex-shrink-0">
                    {/* Column header */}
                    <div className="flex items-center justify-between mb-2 px-1">
                      <p className={`text-[10px] font-display font-bold uppercase tracking-widest ${color}`}>
                        {label}
                      </p>
                      {counts[key] > 0 && (
                        <span className="text-[10px] font-display font-bold text-brand-muted bg-brand-surface border border-brand-border rounded-full w-5 h-5 flex items-center justify-center">
                          {counts[key]}
                        </span>
                      )}
                    </div>

                    {/* Cards */}
                    <div className="space-y-2 min-h-16">
                      {cards.length === 0 ? (
                        <div className="border border-dashed border-brand-border rounded-lg px-3 py-6 text-center">
                          <p className="text-[10px] font-barlow text-brand-muted">Empty</p>
                        </div>
                      ) : (
                        cards.map((order) => <OrderCard key={order.id} order={order} />)
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

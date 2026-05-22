"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";
import type { OrderStage } from "@/lib/supabase/types";

// ── Types ─────────────────────────────────────────────────────

interface SalesClient {
  id: string;
  name: string;
  contact_name: string | null;
  email: string;
  sport: string | null;
  city: string | null;
  retainer_plan: string | null;
  retainer_status: string | null;
  created_at: string;
  total_orders: number;
  active_orders: number;
  last_order: string | null;
}

interface PipelineOrder {
  id: string;
  order_number: string | null;
  stage: OrderStage;
  created_at: string;
  estimated_delivery: string | null;
  deposit_paid: boolean;
  balance_paid: boolean;
  clients: { name: string; sport: string | null; city: string | null } | null;
}

type Pipeline = Partial<Record<OrderStage, PipelineOrder[]>>;

// ── Constants ─────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  onboarding:              "Brief",
  design_confirmed:        "Design Confirmed",
  files_sent:              "Files Sent",
  first_piece_in_progress: "First Piece",
  first_piece_review:      "FP Review",
  bulk_production:         "Production",
  qc_verified:             "QC",
  shipped:                 "Shipped",
  delivered:               "Delivered",
};

const ACTIVE_PIPELINE_STAGES: OrderStage[] = [
  "onboarding",
  "design_confirmed",
  "files_sent",
  "first_piece_in_progress",
  "first_piece_review",
  "bulk_production",
  "qc_verified",
  "shipped",
  "delivered",
];

const RETAINER_COLORS: Record<string, string> = {
  elite:   "bg-purple-50 text-purple-700 border-purple-200",
  pro:     "bg-blue-50 text-blue-700 border-blue-200",
  starter: "bg-gray-100 text-gray-600 border-gray-200",
  none:    "",
};

function timeAgo(iso: string | null) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────

export default function SalesPortalPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [clients, setClients]   = useState<SalesClient[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline>({});
  const [pipeTotal, setPipeTotal] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState<"clients" | "pipeline">("clients");
  const [search, setSearch]     = useState("");
  const [name, setName]         = useState("");

  useEffect(() => {
    getProfile().then((profile) => {
      if (!profile || (profile.role !== "sales_rep" && profile.role !== "admin" && profile.role !== "super_admin")) {
        router.replace("/portal");
        return;
      }
      void supabase;
      setName(profile.full_name ?? profile.email ?? "");

      Promise.all([
        fetch("/api/sales/clients").then((r) => r.json()),
        fetch("/api/sales/pipeline").then((r) => r.json()),
      ]).then(([clientsData, pipelineData]) => {
        setClients(clientsData.clients ?? []);
        setPipeline(pipelineData.pipeline ?? {});
        setPipeTotal(pipelineData.total ?? 0);
        setLoading(false);
      });
    });
  }, [router, supabase]);

  const filteredClients = clients.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q)
      || (c.sport ?? "").toLowerCase().includes(q)
      || (c.city ?? "").toLowerCase().includes(q)
      || c.email.toLowerCase().includes(q);
  });

  const totalActiveOrders = clients.reduce((n, c) => n + c.active_orders, 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <TenantLogo className="h-7" href="/sales" />
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.25em] text-brand-muted">Sales</p>
            <h1 className="font-display text-base font-bold uppercase tracking-wide text-brand-text">
              {view === "clients" ? "Client List" : "Order Pipeline"}
            </h1>
          </div>
        </div>
        {name && (
          <p className="text-xs font-barlow text-brand-muted hidden sm:block">{name}</p>
        )}
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col items-center">
        <div className="w-full max-w-5xl space-y-5">

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Clients",       value: clients.length },
              { label: "Active Orders", value: totalActiveOrders, highlight: totalActiveOrders > 0 },
              { label: "Pipeline",      value: pipeTotal },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="rounded-xl border border-brand-border bg-brand-surface px-4 py-3 text-center">
                <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1">{label}</p>
                <p className={`font-display font-bold text-xl ${highlight ? "text-brand-primary" : "text-brand-text"}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-brand-surface border border-brand-border rounded-xl p-1">
              {(["clients", "pipeline"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider transition-colors ${
                    view === v ? "bg-brand-primary text-white" : "text-brand-muted hover:text-brand-text"
                  }`}
                >
                  {v === "clients" ? "Clients" : "Pipeline"}
                </button>
              ))}
            </div>

            {view === "clients" && (
              <input
                type="text"
                placeholder="Search clients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 max-w-xs bg-brand-surface border border-brand-border rounded-lg px-3 py-2 text-sm font-barlow text-brand-text placeholder:text-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
              />
            )}
          </div>

          {/* ── Clients view ────────────────────────────────── */}
          {view === "clients" && (
            <div className="rounded-xl border border-brand-border overflow-hidden">
              <table className="w-full text-sm font-barlow">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-surface">
                    {["Client", "Sport / City", "Retainer", "Orders", "Last Activity", ""].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-[10px] font-display uppercase tracking-wider text-brand-muted first:pl-5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-brand-border last:border-b-0 hover:bg-brand-surface/50 transition-colors"
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-brand-text">{c.name}</p>
                        {c.contact_name && (
                          <p className="text-xs text-brand-muted mt-0.5">{c.contact_name}</p>
                        )}
                        <p className="text-xs text-brand-muted">{c.email}</p>
                      </td>
                      <td className="px-5 py-4">
                        {c.sport && <p className="capitalize text-brand-text">{c.sport}</p>}
                        {c.city  && <p className="text-xs text-brand-muted">{c.city}</p>}
                      </td>
                      <td className="px-5 py-4">
                        {c.retainer_plan && c.retainer_plan !== "none" ? (
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider border ${RETAINER_COLORS[c.retainer_plan] ?? ""}`}>
                            {c.retainer_plan}
                          </span>
                        ) : (
                          <span className="text-brand-muted">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-display font-bold text-brand-text">{c.total_orders}</p>
                        {c.active_orders > 0 && (
                          <p className="text-xs text-brand-primary">{c.active_orders} active</p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-brand-muted">
                        {timeAgo(c.last_order)}
                      </td>
                      <td className="px-5 py-4">
                        <a
                          href={`/admin/orders?client=${c.id}`}
                          className="text-xs font-display font-bold uppercase tracking-wider text-brand-primary hover:opacity-70 transition-opacity"
                        >
                          View Orders →
                        </a>
                      </td>
                    </tr>
                  ))}
                  {filteredClients.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-14 text-center text-sm text-brand-muted">
                        {search ? "No clients match your search." : "No clients yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pipeline view ───────────────────────────────── */}
          {view === "pipeline" && (
            <div className="overflow-x-auto -mx-4 px-4">
              <div className="flex gap-3 min-w-max pb-4">
                {ACTIVE_PIPELINE_STAGES.map((stage) => {
                  const stageOrders = pipeline[stage] ?? [];
                  return (
                    <div
                      key={stage}
                      className="w-56 flex-shrink-0 rounded-xl border border-brand-border bg-brand-surface overflow-hidden"
                    >
                      <div className="px-3 py-3 border-b border-brand-border flex items-center justify-between">
                        <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted leading-tight">
                          {STAGE_LABELS[stage] ?? stage}
                        </p>
                        <span className={`text-[10px] font-display font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center ${
                          stageOrders.length > 0
                            ? "bg-brand-primary/10 text-brand-primary"
                            : "bg-brand-border text-brand-muted"
                        }`}>
                          {stageOrders.length}
                        </span>
                      </div>
                      <div className="p-2 space-y-2 min-h-[3rem]">
                        {stageOrders.map((o) => (
                          <div
                            key={o.id}
                            className="rounded-lg border border-brand-border bg-brand-bg px-3 py-2.5 hover:border-brand-primary transition-colors cursor-pointer"
                            onClick={() => router.push(`/admin/orders/${o.id}`)}
                          >
                            <p className="text-xs font-display font-bold uppercase tracking-wide text-brand-text truncate">
                              {o.clients?.name ?? "—"}
                            </p>
                            <div className="flex items-center justify-between mt-0.5">
                              {o.clients?.sport && (
                                <p className="text-[10px] font-barlow text-brand-muted capitalize truncate">{o.clients.sport}</p>
                              )}
                              {o.order_number && (
                                <p className="text-[10px] font-mono text-brand-muted flex-shrink-0">#{o.order_number}</p>
                              )}
                            </div>
                            {o.estimated_delivery && (
                              <p className="text-[10px] font-barlow text-brand-muted mt-1">
                                Est. {fmtDate(o.estimated_delivery)}
                              </p>
                            )}
                            <div className="flex gap-1 mt-1.5">
                              {o.deposit_paid && (
                                <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                  Dep
                                </span>
                              )}
                              {o.balance_paid && (
                                <span className="text-[9px] font-display uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                  Paid
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

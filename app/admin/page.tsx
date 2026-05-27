"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import AdminHeader from "@/components/AdminHeader";
import type { OrderStage } from "@/types/database";

// ── Types ─────────────────────────────────────────────────────

interface KPIs {
  totalOrders: number;
  activeOrders: number;
  totalRevenue: number;
  totalClients: number;
  approvalRate: number | null;
}

interface MonthRevenue { label: string; amount: number }

interface TopClient { id: string; name: string; sport: string | null; orders: number }

interface RecentOrder {
  id: string;
  stage: OrderStage;
  created_at: string;
  client_name: string;
  sport: string | null;
}

interface AdminOrder {
  id: string;
  order_number: string;
  stage: OrderStage;
  created_at: string;
  client_name: string;
  client_email: string;
  sport: string;
}

// ── Constants ─────────────────────────────────────────────────

const STAGE_LABELS: Record<string, string> = {
  onboarding:              "Brief Submitted",
  design_confirmed:        "Concepts Generating",
  files_sent:              "Design Approved",
  first_piece_in_progress: "First Piece",
  first_piece_review:      "First Piece Review",
  bulk_production:         "Bulk Production",
  qc_verified:             "QC Verified",
  shipped:                 "Shipped",
  delivered:               "Delivered",
  complete:                "Complete",
};

const STAGE_COLOR: Record<string, string> = {
  onboarding:              "bg-gray-100 text-gray-600 border border-gray-200",
  design_confirmed:        "bg-amber-50 text-amber-700 border border-amber-200",
  files_sent:              "bg-blue-50 text-blue-700 border border-blue-200",
  first_piece_in_progress: "bg-purple-50 text-purple-700 border border-purple-200",
  first_piece_review:      "bg-purple-50 text-purple-800 border border-purple-300",
  bulk_production:         "bg-indigo-50 text-indigo-700 border border-indigo-200",
  qc_verified:             "bg-teal-50 text-teal-700 border border-teal-200",
  shipped:                 "bg-cyan-50 text-cyan-700 border border-cyan-200",
  delivered:               "bg-green-50 text-green-700 border border-green-200",
  complete:                "bg-green-100 text-green-800 border border-green-300",
};

const PIPELINE_STAGE_ORDER: OrderStage[] = [
  "onboarding", "design_confirmed", "files_sent",
  "first_piece_in_progress", "first_piece_review",
  "bulk_production", "qc_verified", "shipped", "delivered",
];

// ── Helpers ───────────────────────────────────────────────────

function fmt$(cents: number) {
  if (cents >= 100000) return "$" + (cents / 100000).toFixed(1) + "k";
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Revenue bar chart (pure SVG, no library) ──────────────────

function RevenueChart({ months }: { months: MonthRevenue[] }) {
  const max = Math.max(...months.map((m) => m.amount), 1);
  const H = 80;

  return (
    <svg viewBox={`0 0 ${months.length * 48} ${H + 24}`} className="w-full" style={{ overflow: "visible" }}>
      {months.map((m, i) => {
        const barH = Math.max(2, Math.round((m.amount / max) * H));
        const x    = i * 48 + 8;
        const y    = H - barH;
        return (
          <g key={m.label}>
            <rect
              x={x} y={y} width={32} height={barH}
              rx={4}
              className="fill-brand-primary opacity-80"
              style={{ fill: "var(--brand-primary)" }}
            />
            {m.amount > 0 && (
              <text
                x={x + 16} y={y - 5}
                textAnchor="middle"
                className="text-[8px] font-barlow fill-brand-muted"
                style={{ fontSize: 8, fill: "var(--brand-muted)" }}
              >
                {fmt$(m.amount)}
              </text>
            )}
            <text
              x={x + 16} y={H + 16}
              textAnchor="middle"
              style={{ fontSize: 9, fill: "var(--brand-muted)" }}
            >
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────

export default function AdminPage() {
  const router      = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [kpis, setKpis]                   = useState<KPIs | null>(null);
  const [stageCounts, setStageCounts]     = useState<Record<string, number>>({});
  const [revenueByMonth, setRevenueByMonth] = useState<MonthRevenue[]>([]);
  const [topClients, setTopClients]       = useState<TopClient[]>([]);
  const [recentOrders, setRecentOrders]   = useState<RecentOrder[]>([]);

  const [orders, setOrders]   = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<OrderStage | "all">("all");
  const [search, setSearch]   = useState("");

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      const profile = await getProfile();
      if (!user || (profile?.role !== "admin" && profile?.role !== "super_admin")) {
        router.replace("/portal");
        return;
      }

      const [dashRes, ordersRes] = await Promise.all([
        fetch("/api/admin/dashboard"),
        fetch("/api/admin/orders"),
      ]);

      if (dashRes.ok) {
        const d = await dashRes.json();
        setKpis(d.kpis);
        setStageCounts(d.stageCounts ?? {});
        setRevenueByMonth(d.revenueByMonth ?? []);
        setTopClients(d.topClients ?? []);
        setRecentOrders(d.recentOrders ?? []);
      }
      if (ordersRes.ok) {
        const { orders } = await ordersRes.json() as { orders: AdminOrder[] };
        setOrders(orders.map((o) => ({ ...o, stage: o.stage as OrderStage })));
      }
      setLoading(false);
    });
  }, [supabase, router]);

  const filtered = orders.filter((o) => {
    const matchesStage  = filter === "all" || o.stage === filter;
    const q             = search.toLowerCase();
    const matchesSearch = !q
      || o.client_name.toLowerCase().includes(q)
      || o.client_email.toLowerCase().includes(q)
      || o.order_number?.toLowerCase().includes(q)
      || o.id.toLowerCase().includes(q);
    return matchesStage && matchesSearch;
  });

  const pipelineMax = Math.max(...PIPELINE_STAGE_ORDER.map((s) => stageCounts[s] ?? 0), 1);

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      <AdminHeader onSignOut={signOut} activePath="/admin" />

      <main className="flex-1 px-4 py-8 flex flex-col items-center">
        <div className="w-full max-w-5xl space-y-6">

          <h1 className="font-display text-2xl font-bold uppercase tracking-wide text-brand-text">Dashboard</h1>

          {/* ── KPI tiles ── */}
          {kpis && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Active Orders",    value: kpis.activeOrders.toString(),                highlight: kpis.activeOrders > 0 },
                { label: "Total Orders",     value: kpis.totalOrders.toString() },
                { label: "Revenue",          value: fmt$(kpis.totalRevenue),                     highlight: kpis.totalRevenue > 0 },
                { label: "Clients",          value: kpis.totalClients.toString() },
                { label: "Approval Rate",    value: kpis.approvalRate != null ? kpis.approvalRate + "%" : "—" },
              ].map(({ label, value, highlight }) => (
                <div key={label} className="rounded-xl border border-brand-border bg-brand-surface px-4 py-3 text-center">
                  <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted mb-1">{label}</p>
                  <p className={`font-display font-bold text-xl ${highlight ? "text-brand-primary" : "text-brand-text"}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* ── Pipeline + Top Clients ── */}
          <div className="grid md:grid-cols-3 gap-4">

            {/* Pipeline funnel */}
            <div className="md:col-span-2 rounded-xl border border-brand-border bg-brand-surface p-5 space-y-3">
              <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted">Active Pipeline</p>
              {PIPELINE_STAGE_ORDER.every((s) => !stageCounts[s]) ? (
                <p className="text-sm font-barlow text-brand-muted py-4 text-center">No active orders</p>
              ) : (
                <div className="space-y-2">
                  {PIPELINE_STAGE_ORDER.map((stage) => {
                    const count = stageCounts[stage] ?? 0;
                    if (!count) return null;
                    const pct = Math.max(4, Math.round((count / pipelineMax) * 100));
                    return (
                      <div key={stage} className="flex items-center gap-3">
                        <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted w-36 flex-shrink-0 truncate">
                          {STAGE_LABELS[stage] ?? stage}
                        </p>
                        <div className="flex-1 bg-brand-bg rounded-full h-5 overflow-hidden border border-brand-border">
                          <div
                            className="h-full rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                            style={{ width: `${pct}%`, background: "var(--brand-primary)", opacity: 0.85 }}
                          />
                        </div>
                        <p className="text-xs font-display font-bold text-brand-text w-5 text-right flex-shrink-0">{count}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top clients */}
            <div className="rounded-xl border border-brand-border bg-brand-surface p-5 space-y-3">
              <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted">Top Clients</p>
              {topClients.length === 0 ? (
                <p className="text-sm font-barlow text-brand-muted py-4 text-center">No data yet</p>
              ) : (
                <div className="space-y-3">
                  {topClients.map((c, i) => (
                    <div key={c.id} className="flex items-center gap-3">
                      <span className="text-[10px] font-display font-bold text-brand-muted w-4 flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-barlow font-medium text-brand-text truncate">{c.name}</p>
                        {c.sport && <p className="text-[10px] text-brand-muted capitalize">{c.sport}</p>}
                      </div>
                      <span className="text-xs font-display font-bold text-brand-primary flex-shrink-0">
                        {c.orders}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Revenue chart ── */}
          {revenueByMonth.length > 0 && revenueByMonth.some((m) => m.amount > 0) && (
            <div className="rounded-xl border border-brand-border bg-brand-surface p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted">Revenue, Last 6 Months</p>
                {kpis && (
                  <p className="text-xs font-barlow text-brand-muted">
                    Total collected: <span className="font-bold text-brand-text">{fmt$(kpis.totalRevenue)}</span>
                  </p>
                )}
              </div>
              <RevenueChart months={revenueByMonth} />
            </div>
          )}

          {/* ── Recent orders ── */}
          {recentOrders.length > 0 && (
            <div className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
                <p className="text-[10px] font-display uppercase tracking-widest text-brand-muted">Recent Orders</p>
                <button
                  onClick={() => document.getElementById("all-orders")?.scrollIntoView({ behavior: "smooth" })}
                  className="text-[10px] font-display uppercase tracking-wider text-brand-primary hover:opacity-70 transition-opacity"
                >
                  View All ↓
                </button>
              </div>
              <div className="divide-y divide-brand-border">
                {recentOrders.map((o) => (
                  <div
                    key={o.id}
                    onClick={() => router.push(`/admin/orders/${o.id}`)}
                    className="px-5 py-3 flex items-center gap-4 hover:bg-brand-bg cursor-pointer transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-barlow font-medium text-brand-text truncate">{o.client_name}</p>
                      {o.sport && <p className="text-[10px] text-brand-muted capitalize">{o.sport}</p>}
                    </div>
                    <span className={`flex-shrink-0 inline-block px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider ${STAGE_COLOR[o.stage] ?? ""}`}>
                      {STAGE_LABELS[o.stage] ?? o.stage}
                    </span>
                    <p className="flex-shrink-0 text-xs text-brand-muted hidden sm:block">{fmtDate(o.created_at)}</p>
                    <span className="text-brand-muted text-xs">→</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── All orders ── */}
          <div id="all-orders" className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <p className="font-display font-bold uppercase tracking-widest text-xs text-brand-muted">
                All Orders · {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search client, email, or order ID…"
                className="flex-1 bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
              />
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value as OrderStage | "all")}
                className="bg-brand-surface border border-brand-border rounded-lg px-4 py-2.5 text-brand-text font-barlow text-sm focus:outline-none focus:border-brand-primary transition-colors cursor-pointer"
              >
                <option value="all">All Stages</option>
                {Object.entries(STAGE_LABELS).map(([stage, label]) => (
                  <option key={stage} value={stage}>{label}</option>
                ))}
              </select>
            </div>

            {filtered.length === 0 ? (
              <p className="text-center text-brand-muted font-barlow py-16">No orders match your filters.</p>
            ) : (
              <div className="rounded-xl border border-brand-border overflow-hidden">
                <table className="w-full text-sm font-barlow">
                  <thead>
                    <tr className="bg-brand-surface border-b border-brand-border">
                      <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-brand-muted">Order</th>
                      <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-brand-muted">Client</th>
                      <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-brand-muted hidden sm:table-cell">Sport</th>
                      <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-brand-muted">Stage</th>
                      <th className="text-left px-5 py-3 text-xs font-display uppercase tracking-wider text-brand-muted hidden md:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => router.push(`/admin/orders/${order.id}`)}
                        className="border-b border-brand-border last:border-b-0 hover:bg-brand-surface cursor-pointer transition-colors group"
                      >
                        <td className="px-5 py-4">
                          <span className="font-mono text-brand-text text-xs">
                            {order.order_number || order.id.slice(0, 8).toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-brand-text font-medium group-hover:text-brand-primary transition-colors">{order.client_name}</p>
                          <p className="text-brand-muted text-xs">{order.client_email}</p>
                        </td>
                        <td className="px-5 py-4 text-brand-muted hidden sm:table-cell capitalize">{order.sport}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-display uppercase tracking-wider ${STAGE_COLOR[order.stage] ?? "bg-gray-800 text-gray-400"}`}>
                            {STAGE_LABELS[order.stage] ?? order.stage}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-brand-muted text-xs hidden md:table-cell">
                          {fmtDate(order.created_at)}
                        </td>
                        <td className="px-5 py-4 text-brand-muted group-hover:text-brand-primary transition-colors text-xs font-display font-bold">→</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import type { OrderStage } from "@/lib/supabase/types";

const TERMINAL_STAGES: OrderStage[] = ["complete", "delivered"];

export async function GET() {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const { tenant } = ctx;
  const admin = createAdminClient();
  const tenantId = tenant.id;

  const [ordersRes, clientsRes, invoicesRes, conceptsRes] = await Promise.all([
    admin
      .from("orders")
      .select("id, stage, created_at, client_id, deposit_paid, balance_paid")
      .eq("tenant_id", tenantId),
    admin
      .from("clients")
      .select("id, name, sport, created_at")
      .eq("tenant_id", tenantId),
    admin
      .from("invoices")
      .select("amount_cents, status, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "paid"),
    admin
      .from("concepts")
      .select("id, order_id, selected")
      .eq("tenant_id", tenantId),
  ]);

  const orders   = ordersRes.data   ?? [];
  const clients  = clientsRes.data  ?? [];
  const invoices = invoicesRes.data ?? [];
  const concepts = conceptsRes.data ?? [];

  // ── KPIs ──────────────────────────────────────────────────
  const totalOrders  = orders.length;
  const activeOrders = orders.filter((o) => !TERMINAL_STAGES.includes(o.stage as OrderStage)).length;
  const totalRevenue = invoices.reduce((n, i) => n + (i.amount_cents ?? 0), 0);
  const totalClients = clients.length;

  const ordersWithConcepts = new Set(concepts.map((c) => c.order_id)).size;
  const selectedConcepts   = concepts.filter((c) => c.selected).length;
  const approvalRate = ordersWithConcepts > 0
    ? Math.round((selectedConcepts / ordersWithConcepts) * 100)
    : null;

  // ── Pipeline funnel (active only) ────────────────────────
  const stageCounts = new Map<string, number>();
  for (const o of orders) {
    if (!TERMINAL_STAGES.includes(o.stage as OrderStage)) {
      stageCounts.set(o.stage, (stageCounts.get(o.stage) ?? 0) + 1);
    }
  }

  // ── Revenue by month (last 6 months) ────────────────────
  const now    = new Date();
  const months: { label: string; amount: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const amount = invoices
      .filter((inv) => {
        const t = new Date(inv.created_at);
        return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth();
      })
      .reduce((n, inv) => n + (inv.amount_cents ?? 0), 0);
    months.push({ label, amount });
  }

  // ── Top clients by order count ────────────────────────────
  const clientOrderCounts = new Map<string, number>();
  for (const o of orders) {
    clientOrderCounts.set(o.client_id, (clientOrderCounts.get(o.client_id) ?? 0) + 1);
  }

  const topClients = clients
    .map((c) => ({ id: c.id, name: c.name, sport: c.sport, orders: clientOrderCounts.get(c.id) ?? 0 }))
    .filter((c) => c.orders > 0)
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 5);

  // ── Recent orders ─────────────────────────────────────────
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)
    .map((o) => ({
      id:          o.id,
      stage:       o.stage,
      created_at:  o.created_at,
      client_name: clientMap.get(o.client_id)?.name ?? "—",
      sport:       clientMap.get(o.client_id)?.sport ?? null,
    }));

  return NextResponse.json({
    kpis: { totalOrders, activeOrders, totalRevenue, totalClients, approvalRate },
    stageCounts: Object.fromEntries(stageCounts),
    revenueByMonth: months,
    topClients,
    recentOrders,
  });
}

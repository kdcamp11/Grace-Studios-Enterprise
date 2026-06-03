import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import { resolveTimeline, stepForIndex, TIMELINE_STEPS } from "@/lib/order-milestones";
import { normalizeStage, stageLabel } from "@/lib/order-stages";
import type { OrderStage } from "@/lib/supabase/types";

const TERMINAL_STAGES: OrderStage[] = ["complete", "delivered"];

/** Human label for each production phase key (from TIMELINE_STEPS — canonical source). */
const PRODUCTION_PHASE_LABEL: Record<string, string> = Object.fromEntries(
  TIMELINE_STEPS.map((s) => [s.key, s.label])
);

export async function GET() {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const { tenant } = ctx;
  const admin = createAdminClient();
  const tenantId = tenant.id;

  const [ordersRes, clientsRes, invoicesRes, conceptsRes] = await Promise.all([
    admin
      .from("orders")
      .select("id, stage, created_at, client_id, deposit_paid, balance_paid, production_choice, tracking_number, supplier_user_id, production_file_url")
      .eq("tenant_id", tenantId),
    admin
      .from("clients")
      .select("id, name, sport, created_at")
      .eq("tenant_id", tenantId),
    // total_amount is stored in dollars; multiply ×100 for cent-based display helpers
    admin
      .from("invoices")
      .select("total_amount, status, created_at")
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

  const orderIds = orders.map((o) => o.id);

  // ── Milestone signals: same data the workflow board resolves ──
  // Fetched in parallel; each query uses .catch() so a missing
  // table (migration not yet applied) degrades to empty maps.
  const mockupCountMap    = new Map<string, number>();
  const prodFilesCountMap = new Map<string, number>();
  const fpStatsMap        = new Map<string, { total: number; client_approved: number }>();

  if (orderIds.length > 0) {
    await Promise.all([
      admin
        .from("order_mockups")
        .select("order_id")
        .in("order_id", orderIds)
        .then(({ data }) => {
          for (const m of data ?? []) {
            mockupCountMap.set(m.order_id, (mockupCountMap.get(m.order_id) ?? 0) + 1);
          }
        })
        .catch(() => { /* migration 025 not yet applied */ }),

      admin
        .from("order_files")
        .select("order_id, label")
        .in("order_id", orderIds)
        .then(({ data }) => {
          for (const f of data ?? []) {
            if ((f.label ?? "").toLowerCase().includes("production")) {
              prodFilesCountMap.set(f.order_id, (prodFilesCountMap.get(f.order_id) ?? 0) + 1);
            }
          }
        })
        .catch(() => {}),

      admin
        .from("first_piece_media")
        .select("order_id, client_visible, client_approved")
        .in("order_id", orderIds)
        .then(({ data }) => {
          for (const m of data ?? []) {
            const s = fpStatsMap.get(m.order_id) ?? { total: 0, client_approved: 0 };
            if (m.client_visible) s.total++;
            if (m.client_approved === true) s.client_approved++;
            fpStatsMap.set(m.order_id, s);
          }
        })
        .catch(() => {}),
    ]);
  }

  /**
   * Canonical phase for an order — mirrors resolveTimeline() in the workflow board
   * so the dashboard and board always agree on lifecycle position.
   *
   * Production orders: resolveTimeline() with full milestone signals.
   * Creative orders:   normalized DB stage (resolveTimeline returns inProduction=false).
   */
  function computePhase(o: typeof orders[0]): string {
    const productionChoice  = (o as Record<string, unknown>).production_choice as string | null ?? null;
    const supplierUserId    = (o as Record<string, unknown>).supplier_user_id  as string | null ?? null;
    const productionFileUrl = (o as Record<string, unknown>).production_file_url as string | null ?? null;
    const trackingNumber    = (o as Record<string, unknown>).tracking_number   as string | null ?? null;

    const derived = resolveTimeline({
      stage:                   o.stage,
      production_choice:       productionChoice,
      deposit_paid:            o.deposit_paid,
      balance_paid:            o.balance_paid,
      tracking_number:         trackingNumber,
      mockupUploaded:          (mockupCountMap.get(o.id) ?? 0) > 0,
      productionFilesUploaded: (prodFilesCountMap.get(o.id) ?? 0) > 0 || !!productionFileUrl,
      supplierAssigned:        !!supplierUserId,
      firstPieceUploaded:      (fpStatsMap.get(o.id)?.total ?? 0) > 0,
      firstPieceApproved:      (fpStatsMap.get(o.id)?.client_approved ?? 0) > 0,
    });

    if (!derived.inProduction) return normalizeStage(o.stage);
    return stepForIndex(derived.currentIndex)?.key ?? "mockup_in_progress";
  }

  // ── KPIs ──────────────────────────────────────────────────
  const totalOrders  = orders.length;
  const activeOrders = orders.filter((o) => !TERMINAL_STAGES.includes(o.stage as OrderStage)).length;
  const totalRevenue = invoices.reduce((n, i) => n + Math.round((i.total_amount ?? 0) * 100), 0);
  const totalClients = clients.length;

  const ordersWithConcepts = new Set(concepts.map((c) => c.order_id)).size;
  const selectedConcepts   = concepts.filter((c) => c.selected).length;
  const approvalRate = ordersWithConcepts > 0
    ? Math.round((selectedConcepts / ordersWithConcepts) * 100)
    : null;

  // ── Pipeline counts: keyed by canonical phase ─────────────
  const phaseCounts = new Map<string, number>();
  for (const o of orders) {
    if (!TERMINAL_STAGES.includes(o.stage as OrderStage)) {
      const phase = computePhase(o);
      phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1);
    }
  }

  // ── Revenue by month (last 6 months) ─────────────────────
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
      .reduce((n, inv) => n + Math.round((inv.total_amount ?? 0) * 100), 0);
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

  // ── Recent orders: enrich with canonical phase + label ────
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8)
    .map((o) => {
      const phase       = computePhase(o);
      // Production phase label from TIMELINE_STEPS; creative label from canonical stageLabel()
      const phase_label = PRODUCTION_PHASE_LABEL[phase] ?? stageLabel(phase);
      return {
        id:          o.id,
        stage:       o.stage,
        phase,
        phase_label,
        created_at:  o.created_at,
        client_name: clientMap.get(o.client_id)?.name ?? "—",
        sport:       clientMap.get(o.client_id)?.sport ?? null,
      };
    });

  return NextResponse.json({
    kpis:           { totalOrders, activeOrders, totalRevenue, totalClients, approvalRate },
    phaseCounts:    Object.fromEntries(phaseCounts),
    revenueByMonth: months,
    topClients,
    recentOrders,
  });
}

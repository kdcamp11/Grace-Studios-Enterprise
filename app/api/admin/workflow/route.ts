import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import type { OrderStage } from "@/lib/supabase/types";

const WORKFLOW_STAGES: OrderStage[] = [
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

export interface WorkflowOrder {
  id: string;
  order_number: string | null;
  stage: OrderStage;
  created_at: string;
  estimated_delivery: string | null;
  deposit_paid: boolean;
  balance_paid: boolean;
  client: { name: string; sport: string | null };
  assigned_designer: { id: string; full_name: string | null; email: string } | null;
  supplier_profile:  { id: string; full_name: string | null; company: string | null } | null;
  concept_count: number;
  invoice_status: string | null;
}

export async function GET() {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  const { data: orders, error } = await admin
    .from("orders")
    .select(`
      id, order_number, stage, created_at, estimated_delivery,
      deposit_paid, balance_paid, design_fee_paid,
      client_id, assigned_designer_id, supplier_user_id
    `)
    .eq("tenant_id", ctx.tenant.id)
    .in("stage", WORKFLOW_STAGES)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ stages: {}, counts: {} });

  // Parallel lookups
  const clientIds   = Array.from(new Set(orders.map((o) => o.client_id)));
  const designerIds = Array.from(new Set(orders.map((o) => o.assigned_designer_id).filter(Boolean))) as string[];
  const supplierIds = Array.from(new Set(orders.map((o) => o.supplier_user_id).filter(Boolean))) as string[];
  const orderIds    = orders.map((o) => o.id);

  const [
    { data: clients },
    { data: designers },
    { data: suppliers },
    { data: concepts },
    { data: invoices },
  ] = await Promise.all([
    admin.from("clients").select("id, name, sport").in("id", clientIds),
    designerIds.length ? admin.from("profiles").select("id, full_name, email").in("id", designerIds) : Promise.resolve({ data: [] }),
    supplierIds.length ? admin.from("profiles").select("id, full_name, company").in("id", supplierIds) : Promise.resolve({ data: [] }),
    admin.from("concepts").select("order_id").in("order_id", orderIds),
    admin.from("invoices").select("order_id, status").in("order_id", orderIds).order("created_at", { ascending: false }),
  ]);

  const clientMap   = new Map((clients ?? []).map((c) => [c.id, c]));
  const designerMap = new Map((designers ?? []).map((d) => [d.id, d]));
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s]));

  const conceptCounts = new Map<string, number>();
  for (const c of concepts ?? []) {
    conceptCounts.set(c.order_id, (conceptCounts.get(c.order_id) ?? 0) + 1);
  }

  // Latest invoice per order
  const latestInvoice = new Map<string, string>();
  for (const inv of invoices ?? []) {
    if (!latestInvoice.has(inv.order_id)) latestInvoice.set(inv.order_id, inv.status);
  }

  const enriched: WorkflowOrder[] = (orders ?? []).map((o) => ({
    id:               o.id,
    order_number:     o.order_number,
    stage:            o.stage as OrderStage,
    created_at:       o.created_at,
    estimated_delivery: o.estimated_delivery,
    deposit_paid:     o.deposit_paid,
    balance_paid:     o.balance_paid,
    client:           clientMap.get(o.client_id) ?? { name: "—", sport: null },
    assigned_designer: o.assigned_designer_id ? (designerMap.get(o.assigned_designer_id) ?? null) : null,
    supplier_profile:  o.supplier_user_id ? (supplierMap.get(o.supplier_user_id) ?? null) : null,
    concept_count:    conceptCounts.get(o.id) ?? 0,
    invoice_status:   latestInvoice.get(o.id) ?? null,
  }));

  // Group by stage
  const stages = Object.fromEntries(
    WORKFLOW_STAGES.map((s) => [s, enriched.filter((o) => o.stage === s)])
  ) as Record<OrderStage, WorkflowOrder[]>;

  const counts = Object.fromEntries(
    WORKFLOW_STAGES.map((s) => [s, stages[s].length])
  );

  return NextResponse.json({ stages, counts });
}

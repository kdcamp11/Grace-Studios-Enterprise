import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRoleTenant, isErrorResponse } from "@/lib/api/assert-role-tenant";
import type { OrderStage } from "@/lib/supabase/types";

const PIPELINE_STAGES: OrderStage[] = [
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

export async function GET() {
  const ctx = await assertRoleTenant(["sales_rep", "admin", "super_admin"]);
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  const { data: orders, error } = await admin
    .from("orders")
    .select(`
      id,
      order_number,
      stage,
      created_at,
      estimated_delivery,
      deposit_paid,
      balance_paid,
      client_id,
      clients ( name, sport, city )
    `)
    .eq("tenant_id", ctx.tenant.id)
    .not("stage", "in", '("complete","delivered")')
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by stage
  const grouped = Object.fromEntries(
    PIPELINE_STAGES.map((s) => [s, [] as NonNullable<typeof orders>])
  ) as Record<OrderStage, NonNullable<typeof orders>>;

  for (const o of orders ?? []) {
    if (grouped[o.stage as OrderStage]) {
      grouped[o.stage as OrderStage]!.push(o);
    }
  }

  return NextResponse.json({ pipeline: grouped, total: (orders ?? []).length });
}

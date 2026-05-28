import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRoleTenant, isErrorResponse } from "@/lib/api/assert-role-tenant";

// Designer sees orders needing concept work or in review.
// Include both legacy stage strings and their canonical creative equivalents
// (see lib/order-stages.ts) so old and new rows are both picked up.
// creative_in_review is included so orders stay visible after the client pays
// the activation deposit (the Stripe webhook advances paid creative orders there).
const DESIGNER_STAGES = [
  "onboarding",
  "design_confirmed",
  "creative_started",
  "creative_submitted",
  "creative_in_review",
] as const;

export async function GET() {
  const ctx = await assertRoleTenant(["designer", "admin", "super_admin"]);
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  let query = admin
    .from("orders")
    .select(`
      id,
      order_number,
      stage,
      created_at,
      deposit_paid,
      design_fee_paid,
      client_id,
      assigned_designer_id,
      clients ( name, sport, city ),
      briefs (
        id,
        design_system,
        primary_colors,
        secondary_colors,
        accent_color,
        logo_placement,
        vision_prompt,
        ai_prompt,
        reference_image_url
      )
    `)
    .eq("tenant_id", ctx.tenant.id)
    .in("stage", DESIGNER_STAGES)
    .order("created_at", { ascending: true });

  // Designers only see their assigned orders; admins/super_admins see all
  if (ctx.role === "designer") {
    query = query.eq("assigned_designer_id", ctx.userId);
  }

  const { data: orders, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Count existing concepts per order
  const orderIds = (orders ?? []).map((o) => o.id);
  const { data: concepts } = orderIds.length
    ? await admin
        .from("concepts")
        .select("order_id")
        .in("order_id", orderIds)
    : { data: [] };

  const conceptCounts = new Map<string, number>();
  for (const c of concepts ?? []) {
    conceptCounts.set(c.order_id, (conceptCounts.get(c.order_id) ?? 0) + 1);
  }

  const result = (orders ?? []).map((o) => ({
    ...o,
    concept_count: conceptCounts.get(o.id) ?? 0,
    needs_concepts: (conceptCounts.get(o.id) ?? 0) === 0,
  }));

  return NextResponse.json({ orders: result });
}

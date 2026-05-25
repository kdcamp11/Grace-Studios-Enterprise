/**
 * GET /api/orders/[order_id]/approve-summary
 *
 * Returns all data needed to render the approve page.
 * Uses service-role key (bypasses RLS) but validates ownership via
 * assertClientOrder — the caller must be authenticated and their email
 * must match the order's client email.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";

export async function GET(
  _req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;

  // Verify ownership
  const ctx = await assertClientOrder(order_id);
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  const [{ data: order }, { data: client }, { data: brief }, { data: concept }] =
    await Promise.all([
      admin
        .from("orders")
        .select("order_number, stage, package_tier, account_lead, notes, deposit_paid, balance_paid")
        .eq("id", order_id)
        .single(),
      admin
        .from("clients")
        .select("name, contact_name, email, sport, city")
        .eq("id", ctx.clientId)
        .single(),
      admin
        .from("briefs")
        .select(`
          design_system,
          primary_colors, secondary_colors, accent_color, colors_to_avoid,
          hex_confirmed, brand_match,
          jersey_cut, sublimated,
          home_colorway, away_colorway,
          number_style, player_names,
          logo_placement, logos_to_include, sponsor_text,
          reference_image_url, vision_prompt, negative_references,
          player_roster
        `)
        .eq("order_id", order_id)
        .single(),
      admin
        .from("concepts")
        .select("image_url, concept_number")
        .eq("order_id", order_id)
        .eq("selected", true)
        .single(),
    ]);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({
    order: {
      orderNumber:  order.order_number,
      stage:        order.stage,
      packageTier:  order.package_tier,
      accountLead:  order.account_lead,
      notes:        order.notes,
      depositPaid:  order.deposit_paid  ?? false,
      balancePaid:  order.balance_paid  ?? false,
    },
    client: {
      teamName:    client?.name         ?? "",
      contactName: client?.contact_name ?? "",
      email:       client?.email        ?? "",
      sport:       client?.sport        ?? "",
      city:        client?.city         ?? "",
    },
    brief: brief ?? null,
    concept: concept ?? null,
  });
}

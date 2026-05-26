/**
 * GET /api/orders/[order_id]/approve-summary
 *
 * Returns all data needed to render the approve page.
 * Uses service-role key (bypasses RLS). Access is granted to:
 *   - Admins / super_admins (any order)
 *   - Clients who own the order (email or user_id match via assertClientOrder)
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";

export async function GET(
  _req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;

  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Check if caller is an admin — admins can view any order's approve page
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  let clientId: string;

  if (isAdmin) {
    // Admins bypass ownership check — just verify the order exists
    const { data: orderCheck } = await admin
      .from("orders")
      .select("client_id")
      .eq("id", order_id)
      .single();
    if (!orderCheck) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    clientId = orderCheck.client_id;
  } else {
    // Clients must own the order
    const ctx = await assertClientOrder(order_id);
    if (isErrorResponse(ctx)) return ctx;
    clientId = ctx.clientId;
  }

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
        .eq("id", clientId)
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

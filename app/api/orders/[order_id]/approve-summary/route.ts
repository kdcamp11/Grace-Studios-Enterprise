/**
 * GET /api/orders/[order_id]/approve-summary
 *
 * Returns all data needed to render the approve page.
 * Uses service-role key (bypasses RLS). Auth is validated via the
 * Authorization: Bearer <token> header (not cookies) so this works
 * even when the server-side cookie session is unavailable (which can
 * happen silently on Vercel edge / Next.js App Router).
 *
 * Access rules:
 *   - Admins / super_admins: any order
 *   - Clients: order's client must match by email OR user_id
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;

  // --- Auth: verify via Bearer token (browser client always has this in memory) ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Verify the token and get the user — admin.auth.getUser() validates server-side
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) {
    console.error("[approve-summary] token verification failed:", authError?.message);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // --- Role check: admins bypass ownership ---
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  let clientId: string;

  if (isAdmin) {
    // Admins can view any order
    const { data: orderCheck } = await admin
      .from("orders")
      .select("client_id")
      .eq("id", order_id)
      .single();
    if (!orderCheck) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    clientId = orderCheck.client_id;
  } else {
    // Clients: must own the order (email match OR user_id match)
    const { data: order } = await admin
      .from("orders")
      .select("id, client_id, clients(email, user_id)")
      .eq("id", order_id)
      .single();

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const clientRaw = Array.isArray(order.clients)
      ? order.clients[0]
      : (order.clients as { email: string; user_id: string | null } | null);

    const clientEmail  = (clientRaw?.email  ?? "").toLowerCase();
    const clientUserId = clientRaw?.user_id ?? null;
    const userEmail    = (user.email ?? "").toLowerCase();

    const emailMatch  = clientEmail  !== "" && clientEmail  === userEmail;
    const userIdMatch = clientUserId !== null && clientUserId === user.id;

    if (!emailMatch && !userIdMatch) {
      console.error("[approve-summary] ownership check failed — user:", user.email, "clientEmail:", clientEmail, "clientUserId:", clientUserId, "userId:", user.id);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    clientId = order.client_id;
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

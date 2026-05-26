/**
 * GET /api/orders/[order_id]/approve-summary
 *
 * Returns all data needed to render the approve page.
 * Uses service-role key (bypasses RLS).
 *
 * Auth — dual-method so this works regardless of which client JS version is running:
 *   1. Authorization: Bearer <token>  (new client sends this explicitly)
 *   2. Cookie-based session           (fallback for older client JS or direct navigation)
 *
 * Access rules:
 *   - Admins / super_admins: any order
 *   - Clients: order's client must match by email OR user_id
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;

  const admin = createAdminClient();

  // --- Auth: try Bearer token first, fall back to cookie session ---
  let user: { id: string; email?: string } | null = null;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (token) {
    // New client sends JWT in Authorization header — verify with service-role key
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) {
      user = data.user;
    } else {
      console.error("[approve-summary] Bearer token verification failed:", error?.message);
    }
  }

  if (!user) {
    // Fall back to cookie-based session (works when client sends cookies normally)
    const serverClient = createServerClient();
    const { data: { user: cookieUser } } = await serverClient.auth.getUser();
    user = cookieUser ?? null;
  }

  if (!user) {
    console.error("[approve-summary] No valid auth — order_id:", order_id);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[approve-summary] Authenticated user:", user.email, "order_id:", order_id);

  // --- Role check: admins bypass ownership ---
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  let clientId: string;

  console.log("[approve-summary] user role:", profile?.role ?? "none", "isAdmin:", isAdmin);

  if (isAdmin) {
    // Admins can view any order
    const { data: orderCheck } = await admin
      .from("orders")
      .select("client_id")
      .eq("id", order_id)
      .single();
    if (!orderCheck) {
      console.error("[approve-summary] admin path — order not found:", order_id);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
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

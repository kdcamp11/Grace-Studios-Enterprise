/**
 * GET /api/orders/[order_id]/approve-summary
 *
 * Returns all data needed to render the approve page.
 * Uses the same auth + client-lookup pattern as /api/portal/orders
 * (which is known to work) — cookie session → find client by user_id
 * then email fallback → back-fill user_id → verify order belongs to client.
 *
 * Admins / super_admins bypass the ownership check entirely.
 * Bearer token auth also accepted as a primary method when sent.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function GET(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;

  const admin = createAdminClient();

  // ── Step 1: Resolve the authenticated user ──────────────────────────────
  // Try Bearer token first (new client sends this), then fall back to cookies
  // (same path that portal/orders uses successfully).
  let user: { id: string; email?: string | null } | null = null;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const { data } = await admin.auth.getUser(token);
    if (data.user) user = data.user;
  }

  if (!user) {
    const serverClient = createServerClient();
    const { data: { user: cookieUser } } = await serverClient.auth.getUser();
    user = cookieUser ?? null;
  }

  if (!user) {
    console.error("[approve-summary] No authenticated user — order_id:", order_id);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[approve-summary] user:", user.email, "order_id:", order_id);

  // ── Step 2: Admin bypass ────────────────────────────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  console.log("[approve-summary] role:", profile?.role ?? "none", "isAdmin:", isAdmin);

  // ── Step 3: For non-admins, verify order ownership the same way        ──
  // portal/orders does it: find client by user_id → fallback to email →   ──
  // back-fill user_id. Then confirm the order belongs to that client.      ──
  let clientId: string;

  if (isAdmin) {
    const { data: orderCheck } = await admin
      .from("orders")
      .select("client_id")
      .eq("id", order_id)
      .single();

    if (!orderCheck) {
      console.error("[approve-summary] order not found (admin path):", order_id);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    clientId = orderCheck.client_id;

  } else {
    // Mirror portal/orders: find client by user_id then email, back-fill, then check order
    const tenant = await getRequestTenant();

    let foundClientId: string | null = null;

    // Try user_id first
    if (!foundClientId) {
      const { data: c } = await admin
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (c) foundClientId = c.id;
    }

    // Fall back to email
    if (!foundClientId && user.email) {
      const { data: c } = await admin
        .from("clients")
        .select("id")
        .eq("email", user.email.toLowerCase())
        .single();
      if (c) {
        foundClientId = c.id;
        // Back-fill user_id exactly as portal/orders does
        await admin
          .from("clients")
          .update({ user_id: user.id })
          .eq("id", c.id)
          .is("user_id", null);
      }
    }

    if (!foundClientId) {
      console.error("[approve-summary] no client found for user:", user.email, user.id);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Verify this order actually belongs to that client
    const { data: orderCheck } = await admin
      .from("orders")
      .select("id, client_id")
      .eq("id", order_id)
      .eq("client_id", foundClientId)
      .single();

    if (!orderCheck) {
      console.error("[approve-summary] order", order_id, "does not belong to client", foundClientId);
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    clientId = foundClientId;
  }

  // ── Step 4: Fetch all approve-page data ─────────────────────────────────
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
    console.error("[approve-summary] order data not found after auth passed:", order_id);
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  console.log("[approve-summary] returning data for order:", order_id, "stage:", order.stage);

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

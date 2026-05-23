/**
 * GET /api/portal/orders
 * Returns all orders for the authenticated client user.
 * Uses the admin client so it bypasses RLS on both `clients` and `orders` tables.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function GET() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ orders: [] }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ orders: [] });

  const admin = createAdminClient();

  // Find the client row — try user_id first, then email
  let { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .single();

  if (!client && user.email) {
    const { data: byEmail } = await admin
      .from("clients")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("email", user.email.toLowerCase())
      .single();
    client = byEmail ?? null;

    // Back-fill user_id so future lookups are faster
    if (client) {
      await admin
        .from("clients")
        .update({ user_id: user.id })
        .eq("id", client.id)
        .is("user_id", null);
    }
  }

  if (!client) return NextResponse.json({ orders: [] });

  // Fetch orders
  const { data: orderRows } = await admin
    .from("orders")
    .select("id, order_number, stage, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  if (!orderRows || orderRows.length === 0) {
    return NextResponse.json({ orders: [], clientId: client.id });
  }

  const orderIds = orderRows.map((o) => o.id);

  // Fetch concepts and first-piece-media in parallel
  const [{ data: concepts }, { data: mediaRows }] = await Promise.all([
    admin.from("concepts").select("order_id").in("order_id", orderIds),
    admin
      .from("first_piece_media")
      .select("order_id, client_approved")
      .in("order_id", orderIds)
      .eq("client_visible", true),
  ]);

  const conceptOrderIds = new Set((concepts ?? []).map((c) => c.order_id));
  const pendingReviewIds = new Set(
    (mediaRows ?? [])
      .filter((m) => m.client_approved === null)
      .map((m) => m.order_id)
  );

  const orders = orderRows.map((o) => ({
    ...o,
    has_concepts:       conceptOrderIds.has(o.id),
    has_pending_review: pendingReviewIds.has(o.id),
  }));

  return NextResponse.json({ orders, clientId: client.id });
}

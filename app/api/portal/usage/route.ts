/**
 * GET /api/portal/usage
 * Returns AI concept generation usage for the authenticated client.
 * Uses the admin client to bypass RLS on clients/orders/concepts tables.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function GET() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ usage: null });

  const admin = createAdminClient();

  // Find client row
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
  }

  if (!client) return NextResponse.json({ usage: { totalOrders: 0, ordersWithConcepts: 0, thisMonth: 0, conceptsGenerated: 0, history: [] } });

  // Fetch all orders for this client
  const { data: orders } = await admin
    .from("orders")
    .select("id, created_at")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  if (!orders || orders.length === 0) {
    return NextResponse.json({ usage: { totalOrders: 0, ordersWithConcepts: 0, thisMonth: 0, conceptsGenerated: 0, history: [] } });
  }

  const orderIds = orders.map((o) => o.id);

  // Fetch all concepts for this client's orders
  const { data: concepts } = await admin
    .from("concepts")
    .select("order_id, created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Orders that have at least one concept = 1 generation run
  const ordersWithConceptsSet = new Set((concepts ?? []).map((c) => c.order_id));
  const ordersWithConcepts = ordersWithConceptsSet.size;

  // Concepts generated this month (by concept rows, not order)
  const thisMonthConcepts = (concepts ?? []).filter((c) => c.created_at >= monthStart);
  const thisMonthRuns = new Set(thisMonthConcepts.map((c) => c.order_id)).size;

  // Total individual concept images
  const conceptsGenerated = (concepts ?? []).length;

  // Monthly history — last 6 months
  const history: { month: string; runs: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = d.toISOString();
    const end   = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();
    const runs  = new Set(
      (concepts ?? [])
        .filter((c) => c.created_at >= start && c.created_at < end)
        .map((c) => c.order_id)
    ).size;
    history.push({
      month: d.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      runs,
    });
  }

  return NextResponse.json({
    usage: {
      totalOrders:       orders.length,
      ordersWithConcepts,
      thisMonth:         thisMonthRuns,
      conceptsGenerated,
      history,
    },
  });
}

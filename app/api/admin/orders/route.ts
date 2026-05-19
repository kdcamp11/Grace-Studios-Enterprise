import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/admin/orders
 * Returns all orders for the admin dashboard. Uses service-role key to bypass
 * the orders_select_own RLS policy. Does a two-step query (orders then clients)
 * to avoid PostgREST embedded-resource joins silently dropping rows.
 */
export async function GET(_req: NextRequest) {
  const { data: orders, error: ordersError } = await adminSupabase
    .from("orders")
    .select("id, order_number, stage, created_at, client_id")
    .order("created_at", { ascending: false });

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ orders: [] });
  }

  // Fetch all referenced clients in one round-trip
  const clientIds = Array.from(new Set(orders.map((o) => o.client_id).filter(Boolean)));
  const { data: clients } = await adminSupabase
    .from("clients")
    .select("id, name, email, sport")
    .in("id", clientIds);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));

  const result = orders.map((o) => {
    const client = clientMap.get(o.client_id);
    return {
      id:           o.id,
      order_number: o.order_number,
      stage:        o.stage,
      created_at:   o.created_at,
      client_name:  client?.name  ?? "—",
      client_email: client?.email ?? "—",
      sport:        client?.sport ?? "—",
    };
  });

  return NextResponse.json({ orders: result });
}

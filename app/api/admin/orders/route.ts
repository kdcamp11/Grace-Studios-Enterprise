import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/admin/orders
 * Returns all orders for the admin dashboard. Uses service-role key to bypass
 * the orders_select_own RLS policy (which restricts client-side queries to the
 * logged-in user's own orders, blocking admin from seeing all).
 */
export async function GET(_req: NextRequest) {
  const { data, error } = await adminSupabase
    .from("orders")
    .select("id, order_number, stage, created_at, clients(name, email, sport)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = (data ?? []).map((o) => {
    const client = Array.isArray(o.clients) ? o.clients[0] : o.clients;
    return {
      id:           o.id,
      order_number: o.order_number,
      stage:        o.stage,
      created_at:   o.created_at,
      client_name:  (client as { name: string })?.name  ?? "—",
      client_email: (client as { email: string })?.email ?? "—",
      sport:        (client as { sport: string })?.sport ?? "—",
    };
  });

  return NextResponse.json({ orders });
}

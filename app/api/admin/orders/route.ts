import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

/**
 * GET /api/admin/orders
 * Returns all orders for the current tenant's admin dashboard.
 */
export async function GET(_req: NextRequest) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const { tenant } = ctx;
  const admin = createAdminClient();

  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("id, order_number, stage, created_at, client_id")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (ordersError) {
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ orders: [] });
  }

  const clientIds = Array.from(new Set(orders.map((o) => o.client_id).filter(Boolean)));
  const { data: clients } = await admin
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

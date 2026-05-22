import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/super-admin";

async function assertSuperAdmin() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isSuperAdmin(user.email)) return null;
  return user;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await assertSuperAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const tenantId = params.id;

  const [ordersRes, activeOrdersRes, clientsRes, usersRes, revenueRes] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .not("stage", "in", '("complete","delivered")'),
    admin.from("clients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin
      .from("invoices")
      .select("amount_cents")
      .eq("tenant_id", tenantId)
      .eq("status", "paid"),
  ]);

  const totalRevenue = (revenueRes.data ?? []).reduce(
    (sum: number, row: { amount_cents: number }) => sum + (row.amount_cents ?? 0),
    0
  );

  return NextResponse.json({
    stats: {
      tenant_id: tenantId,
      total_orders: ordersRes.count ?? 0,
      active_orders: activeOrdersRes.count ?? 0,
      total_clients: clientsRes.count ?? 0,
      total_users: usersRes.count ?? 0,
      total_revenue: totalRevenue,
    },
  });
}

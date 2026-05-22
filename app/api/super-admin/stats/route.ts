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

export async function GET(_req: NextRequest) {
  const user = await assertSuperAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();

  const [tenantsRes, activeTenantsRes, ordersRes, activeOrdersRes, clientsRes, revenueRes] =
    await Promise.all([
      admin.from("tenants").select("id", { count: "exact", head: true }),
      admin.from("tenants").select("id", { count: "exact", head: true }).eq("active", true),
      admin.from("orders").select("id", { count: "exact", head: true }),
      admin
        .from("orders")
        .select("id", { count: "exact", head: true })
        .not("stage", "in", '("complete","delivered")'),
      admin.from("clients").select("id", { count: "exact", head: true }),
      admin.from("invoices").select("amount_cents").eq("status", "paid"),
    ]);

  const totalRevenue = (revenueRes.data ?? []).reduce(
    (sum: number, row: { amount_cents: number }) => sum + (row.amount_cents ?? 0),
    0
  );

  return NextResponse.json({
    stats: {
      total_tenants: tenantsRes.count ?? 0,
      active_tenants: activeTenantsRes.count ?? 0,
      total_orders: ordersRes.count ?? 0,
      active_orders: activeOrdersRes.count ?? 0,
      total_clients: clientsRes.count ?? 0,
      total_revenue: totalRevenue,
    },
  });
}

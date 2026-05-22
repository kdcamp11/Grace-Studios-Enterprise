import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRoleTenant, isErrorResponse } from "@/lib/api/assert-role-tenant";

export async function GET() {
  const ctx = await assertRoleTenant(["sales_rep", "admin", "super_admin"]);
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  const { data: clients, error } = await admin
    .from("clients")
    .select("id, name, contact_name, email, sport, city, retainer_plan, retainer_status, created_at")
    .eq("tenant_id", ctx.tenant.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!clients || clients.length === 0) return NextResponse.json({ clients: [] });

  const clientIds = clients.map((c) => c.id);

  const { data: orders } = await admin
    .from("orders")
    .select("id, client_id, stage, created_at")
    .eq("tenant_id", ctx.tenant.id)
    .in("client_id", clientIds);

  const TERMINAL = ["complete", "delivered"];

  const statsMap = new Map<string, { total: number; active: number; last_order: string | null }>();
  for (const o of orders ?? []) {
    const s = statsMap.get(o.client_id) ?? { total: 0, active: 0, last_order: null };
    s.total++;
    if (!TERMINAL.includes(o.stage)) s.active++;
    if (!s.last_order || o.created_at > s.last_order) s.last_order = o.created_at;
    statsMap.set(o.client_id, s);
  }

  const result = clients.map((c) => ({
    ...c,
    total_orders:  statsMap.get(c.id)?.total      ?? 0,
    active_orders: statsMap.get(c.id)?.active     ?? 0,
    last_order:    statsMap.get(c.id)?.last_order ?? null,
  }));

  return NextResponse.json({ clients: result });
}

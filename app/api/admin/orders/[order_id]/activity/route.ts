import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

export async function GET(
  _req: Request,
  { params }: { params: { order_id: string } },
) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  // Verify order belongs to this tenant
  const { data: order } = await admin
    .from("orders")
    .select("id")
    .eq("id", params.order_id)
    .eq("tenant_id", ctx.tenant.id)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const { data: activity, error } = await admin
    .from("order_activity")
    .select("id, event_type, event_message, actor_role, actor_user_id, metadata, created_at")
    .eq("order_id", params.order_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Hydrate actor names from profiles
  const actorIds = Array.from(new Set((activity ?? []).map((a) => a.actor_user_id).filter(Boolean))) as string[];
  const { data: profiles } = actorIds.length
    ? await admin.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] };

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name ?? p.email]));

  const result = (activity ?? []).map((a) => ({
    ...a,
    actor_name: a.actor_user_id ? (profileMap.get(a.actor_user_id) ?? "System") : "System",
  }));

  return NextResponse.json({ activity: result });
}

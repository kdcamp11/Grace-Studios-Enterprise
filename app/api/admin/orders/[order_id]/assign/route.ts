import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import { logActivity } from "@/lib/activity/log";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const { designer_id } = await req.json() as { designer_id: string | null };
  const admin = createAdminClient();

  if (designer_id) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", designer_id)
      .eq("tenant_id", ctx.tenant.id)
      .eq("role", "designer")
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Designer not found in this tenant" }, { status: 400 });
    }

    const { error } = await admin
      .from("orders")
      .update({ assigned_designer_id: designer_id })
      .eq("id", params.order_id)
      .eq("tenant_id", ctx.tenant.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivity({
      tenantId: ctx.tenant.id, orderId: params.order_id,
      actorUserId: ctx.userId, actorRole: "admin",
      eventType: "designer_assigned",
      eventMessage: `Designer assigned: ${profile.full_name ?? profile.email}`,
      metadata: { designer_id },
    });
  } else {
    const { error } = await admin
      .from("orders")
      .update({ assigned_designer_id: null })
      .eq("id", params.order_id)
      .eq("tenant_id", ctx.tenant.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivity({
      tenantId: ctx.tenant.id, orderId: params.order_id,
      actorUserId: ctx.userId, actorRole: "admin",
      eventType: "designer_unassigned",
      eventMessage: "Designer removed",
    });
  }

  return NextResponse.json({ success: true });
}

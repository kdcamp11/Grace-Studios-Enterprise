import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { order_id, ...briefFields } = body as { order_id: string; [key: string]: unknown };

  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  const tenant = await getRequestTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error: briefError } = await admin.from("briefs").insert({
    ...briefFields,
    order_id,
    tenant_id: tenant.id,
  });

  if (briefError) {
    return NextResponse.json({ error: briefError.message }, { status: 500 });
  }

  const { error: orderError } = await admin
    .from("orders")
    .update({ stage: "design_confirmed" })
    .eq("id", order_id);

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { order_id, design_id, concept_source, ...briefFields } = body as {
    order_id?:      string;
    design_id?:     string;
    concept_source?: string;
    [key: string]: unknown;
  };

  if (!order_id && !design_id) {
    return NextResponse.json({ error: "order_id or design_id required" }, { status: 400 });
  }

  const tenant = await getRequestTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (design_id) {
    // Pre-payment flow: brief is linked to a design, not an order yet.
    // Upsert so repeated submits (e.g. going back and editing) don't create duplicates.
    const { data: existing } = await admin
      .from("briefs")
      .select("id")
      .eq("design_id", design_id)
      .maybeSingle();

    if (existing) {
      const { error } = await admin.from("briefs").update({ ...briefFields }).eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await admin.from("briefs").insert({
        ...briefFields,
        design_id,
        tenant_id: tenant.id,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Mark design as submitted
    await admin.from("designs").update({ status: "submitted" }).eq("id", design_id);

    return NextResponse.json({ success: true });
  }

  // Legacy order-keyed flow
  const { error: briefError } = await admin.from("briefs").insert({
    ...briefFields,
    order_id,
    tenant_id: tenant.id,
  });

  if (briefError) {
    return NextResponse.json({ error: briefError.message }, { status: 500 });
  }

  const orderUpdate: Record<string, unknown> = { stage: "design_confirmed" };
  if (concept_source) orderUpdate.concept_source = concept_source;

  const { error: orderError } = await admin
    .from("orders")
    .update(orderUpdate)
    .eq("id", order_id);

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

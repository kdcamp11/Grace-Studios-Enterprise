import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { order_id, concept_source, ...briefFields } = body as {
    order_id: string;
    concept_source?: string;
    [key: string]: unknown;
  };

  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  const tenant = await getRequestTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
  }

  const admin = createAdminClient();

  // If a brief row was pre-created (e.g. by save-builder-preview), update it
  // rather than inserting a duplicate.
  const { data: existingBrief } = await admin
    .from("briefs")
    .select("id")
    .eq("order_id", order_id)
    .single();

  let briefError;
  if (existingBrief) {
    ({ error: briefError } = await admin
      .from("briefs")
      .update({ ...briefFields })
      .eq("id", existingBrief.id));
  } else {
    ({ error: briefError } = await admin.from("briefs").insert({
      ...briefFields,
      order_id,
      tenant_id: tenant.id,
    }));
  }

  if (briefError) {
    return NextResponse.json({ error: briefError.message }, { status: 500 });
  }

  // Build the order update — always set stage; also set concept_source if provided.
  // "design_confirmed" is the legacy equivalent of "creative_submitted" and is
  // valid both before and after migration 019 is applied.
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

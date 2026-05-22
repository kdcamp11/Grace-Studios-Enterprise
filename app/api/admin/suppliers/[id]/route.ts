import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  // Verify the supplier being demoted belongs to this tenant
  const admin = createAdminClient();
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("tenant_id")
    .eq("id", params.id)
    .single();

  if (!targetProfile || targetProfile.tenant_id !== ctx.tenant.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("profiles")
    .update({ role: "client" })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

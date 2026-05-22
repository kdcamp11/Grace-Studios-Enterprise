import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

export async function GET() {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  const { data: members, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, created_at")
    .eq("tenant_id", ctx.tenant.id)
    .in("role", ["admin", "designer", "sales_rep"])
    .order("role")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ members: members ?? [] });
}

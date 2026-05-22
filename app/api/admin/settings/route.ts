import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

export async function GET() {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  return NextResponse.json({ tenant: ctx.tenant });
}

export async function PATCH(req: NextRequest) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const { tenant } = ctx;

  const body = await req.json() as Record<string, unknown>;

  // Only allow tenant admins to update these fields — slug/plan/domain are super-admin only
  const allowed = [
    "name",
    "logo_url",
    "support_email",
    "support_url",
    "brand_primary",
    "brand_secondary",
    "brand_bg",
    "brand_surface",
    "brand_border",
    "brand_text",
    "brand_muted",
    "enabled_sports",
    "enabled_products",
  ];

  const updates = Object.fromEntries(
    Object.entries(body).filter(([key]) => allowed.includes(key))
  );

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await createAdminClient()
    .from("tenants")
    .update(updates)
    .eq("id", tenant.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenant: data });
}

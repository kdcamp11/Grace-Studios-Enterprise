import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

const ALLOWED_FIELDS = [
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

export async function GET() {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;
  return NextResponse.json({ tenant: ctx.tenant });
}

export async function PATCH(req: NextRequest) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const body = await req.json() as Record<string, unknown>;
  const { complete, ...rest } = body as { complete?: boolean } & Record<string, unknown>;

  const updates = Object.fromEntries(
    Object.entries(rest).filter(([key]) => ALLOWED_FIELDS.includes(key))
  );

  if (complete) {
    updates.onboarding_complete = true;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .update(updates)
    .eq("id", ctx.tenant.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenant: data });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/super-admin";

async function assertSuperAdmin() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isSuperAdmin(user.email)) {
    return null;
  }
  return user;
}

export async function GET() {
  const user = await assertSuperAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenants: data });
}

export async function POST(req: NextRequest) {
  const user = await assertSuperAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tenants")
    .insert({
      name:            body.name,
      slug:            body.slug,
      custom_domain:   body.custom_domain || null,
      logo_url:        body.logo_url || null,
      brand_primary:   body.brand_primary   || "#111111",
      brand_secondary: body.brand_secondary || "#333333",
      brand_bg:        body.brand_bg        || "#ffffff",
      brand_surface:   body.brand_surface   || "#f5f5f5",
      brand_border:    body.brand_border    || "#d4d4d4",
      brand_text:      body.brand_text      || "#0a0a0a",
      brand_muted:     body.brand_muted     || "#888888",
      enabled_sports:  body.enabled_sports  || ["basketball","football","soccer","baseball","softball","volleyball"],
      enabled_products: body.enabled_products || ["jersey","shorts","tracksuit","jacket"],
      design_fee:      body.design_fee      ?? 0,
      commission_rate: body.commission_rate ?? 0,
      plan:            body.plan            || "starter",
      owner_email:     body.owner_email,
      support_email:   body.support_email   || null,
      support_url:     body.support_url     || null,
      active:          true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tenant: data });
}

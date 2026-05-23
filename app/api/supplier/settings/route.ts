/**
 * GET /api/supplier/settings  — fetch supplier profile + catalog
 * PATCH /api/supplier/settings — update supplier profile + catalog
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

async function assertSupplier() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return null;
  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("id, role, full_name, company, logo_url, enabled_sports, enabled_products, email")
    .eq("id", user.id)
    .single();
  if (!profile) return null;
  if (profile.role !== "supplier" && profile.role !== "admin" && profile.role !== "super_admin") return null;
  return { user, profile };
}

export async function GET() {
  const ctx = await assertSupplier();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ profile: ctx.profile });
}

export async function PATCH(req: NextRequest) {
  const ctx = await assertSupplier();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    full_name?: string;
    company?: string;
    logo_url?: string | null;
    enabled_sports?: string[];
    enabled_products?: string[];
  };

  const updates: Record<string, unknown> = {};
  if (body.full_name   !== undefined) updates.full_name         = body.full_name?.trim() || null;
  if (body.company     !== undefined) updates.company           = body.company?.trim()   || null;
  if (body.logo_url    !== undefined) updates.logo_url          = body.logo_url;
  if (body.enabled_sports   !== undefined) updates.enabled_sports   = body.enabled_sports;
  if (body.enabled_products !== undefined) updates.enabled_products = body.enabled_products;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await createAdminClient()
    .from("profiles")
    .update(updates)
    .eq("id", ctx.user.id)
    .select("id, full_name, company, logo_url, enabled_sports, enabled_products, email")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data });
}

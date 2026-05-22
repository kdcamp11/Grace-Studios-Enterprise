import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

async function assertSupplier() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return null;
  const { data: profile } = await createAdminClient()
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "supplier" && profile?.role !== "admin" && profile?.role !== "super_admin") return null;
  return user;
}

export async function GET() {
  const user = await assertSupplier();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await createAdminClient()
    .from("supplier_portfolio")
    .select("id, image_url, caption, sport, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await assertSupplier();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const { image_url, caption, sport } = await req.json() as {
    image_url: string;
    caption?: string;
    sport?: string;
  };

  if (!image_url) return NextResponse.json({ error: "image_url required" }, { status: 400 });

  const { data, error } = await createAdminClient()
    .from("supplier_portfolio")
    .insert({ user_id: user.id, tenant_id: tenant.id, image_url, caption: caption ?? null, sport: sport ?? null })
    .select("id, image_url, caption, sport, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

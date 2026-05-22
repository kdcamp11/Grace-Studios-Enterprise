import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

async function getClientRow(userId: string, tenantId: string) {
  return createAdminClient()
    .from("clients")
    .select("id, name, contact_name, city")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .single();
}

export async function GET() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ client: null });

  const { data: client } = await getClientRow(user.id, tenant.id);
  return NextResponse.json({ client: client ?? null });
}

export async function PATCH(req: NextRequest) {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const { name, contact_name, city } = await req.json() as {
    name?: string;
    contact_name?: string;
    city?: string;
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify this user owns a client row for this tenant
  const { data: existing } = await getClientRow(user.id, tenant.id);
  if (!existing) return NextResponse.json({ error: "No team profile found" }, { status: 404 });

  const { error } = await admin
    .from("clients")
    .update({
      name:         name.trim(),
      contact_name: contact_name?.trim() || null,
      city:         city?.trim() || null,
    })
    .eq("id", existing.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

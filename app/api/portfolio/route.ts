/**
 * GET /api/portfolio
 * Returns all supplier portfolio items for this tenant, grouped by supplier.
 * Accessible by any authenticated user (clients, admins, suppliers).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function GET() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ suppliers: [] });

  const admin = createAdminClient();

  // Fetch all portfolio items for this tenant
  const { data: items } = await admin
    .from("supplier_portfolio")
    .select("id, image_url, caption, sport, user_id, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (!items || items.length === 0) {
    return NextResponse.json({ suppliers: [] });
  }

  // Get unique supplier user_ids
  const userIds = [...new Set(items.map((i) => i.user_id))];

  // Fetch supplier profiles
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, company")
    .in("id", userIds)
    .eq("role", "supplier");

  const profileMap: Record<string, { full_name: string | null; company: string | null }> = {};
  for (const p of profiles ?? []) {
    profileMap[p.id] = { full_name: p.full_name, company: p.company };
  }

  // Group items by supplier
  const grouped: Record<string, {
    supplier_id: string;
    name: string;
    items: typeof items;
  }> = {};

  for (const item of items) {
    if (!grouped[item.user_id]) {
      const p = profileMap[item.user_id];
      grouped[item.user_id] = {
        supplier_id: item.user_id,
        name: p?.company ?? p?.full_name ?? "Production Partner",
        items: [],
      };
    }
    grouped[item.user_id].items.push(item);
  }

  return NextResponse.json({ suppliers: Object.values(grouped) });
}

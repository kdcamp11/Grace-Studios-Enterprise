import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * GET /api/public/portfolio?sport=Basketball
 * Public endpoint — returns portfolio items for the current tenant.
 * No auth required. Supplier names are never exposed.
 */
export async function GET(req: NextRequest) {
  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ items: [] });

  const sport = req.nextUrl.searchParams.get("sport") ?? null;

  const admin = createAdminClient();

  let query = admin
    .from("supplier_portfolio")
    .select("id, image_url, caption, sport, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (sport && sport !== "All") {
    query = query.eq("sport", sport);
  }

  const { data } = await query;
  return NextResponse.json({ items: data ?? [] });
}

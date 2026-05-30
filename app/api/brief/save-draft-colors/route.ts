import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * POST /api/brief/save-draft-colors
 *
 * Upserts a brief row with zone_colors for a draft design so the Saved Designs
 * thumbnail shows a color swatch. Does NOT mark the design as submitted.
 */
export async function POST(req: NextRequest) {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const { design_id, zone_colors } = await req.json() as {
    design_id: string;
    zone_colors: Record<string, string>;
  };

  if (!design_id || !zone_colors) {
    return NextResponse.json({ error: "design_id and zone_colors required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify this design belongs to the authenticated user's client
  const { data: design } = await admin
    .from("designs")
    .select("id, client_id")
    .eq("id", design_id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (!design) return NextResponse.json({ error: "Design not found" }, { status: 404 });

  const { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("id", design.client_id)
    .or(`email.eq.${user.email?.toLowerCase()},user_id.eq.${user.id}`)
    .maybeSingle();

  if (!client) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Upsert a brief with just zone_colors — don't touch design status
  const { data: existing } = await admin
    .from("briefs")
    .select("id")
    .eq("design_id", design_id)
    .maybeSingle();

  if (existing) {
    await admin.from("briefs").update({ zone_colors }).eq("id", existing.id);
  } else {
    await admin.from("briefs").insert({
      design_id,
      tenant_id: tenant.id,
      zone_colors,
    });
  }

  return NextResponse.json({ ok: true });
}

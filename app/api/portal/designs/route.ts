import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * GET /api/portal/designs
 *
 * Returns unconverted designs (status = draft | submitted) for the
 * authenticated client. These are pre-payment designs that appear in the
 * portal's "Saved Designs" section until Creative Activation is paid.
 */
export async function GET() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const admin = createAdminClient();

  // Find the client row for this user
  const { data: client } = await admin
    .from("clients")
    .select("id, name, sport")
    .eq("tenant_id", tenant.id)
    .or(`email.eq.${user.email.toLowerCase()},user_id.eq.${user.id}`)
    .maybeSingle();

  if (!client) return NextResponse.json({ designs: [] });

  // Fetch unconverted designs for this client
  const { data: designs } = await admin
    .from("designs")
    .select("id, kind, status, created_at")
    .eq("client_id", client.id)
    .eq("tenant_id", tenant.id)
    .in("status", ["draft", "submitted"])
    .order("created_at", { ascending: false });

  if (!designs?.length) return NextResponse.json({ designs: [] });

  const designIds = designs.map((d) => d.id);

  // Fetch briefs + first concept image in parallel
  const [briefsRes, conceptsRes] = await Promise.all([
    admin
      .from("briefs")
      .select("design_id, client_concept_url, zone_colors, vision_prompt")
      .in("design_id", designIds),
    admin
      .from("concepts")
      .select("design_id, image_url")
      .in("design_id", designIds)
      .eq("concept_number", 1),
  ]);

  const briefMap   = new Map(briefsRes.data?.map((b) => [b.design_id, b]) ?? []);
  const conceptMap = new Map(conceptsRes.data?.map((c) => [c.design_id, c.image_url]) ?? []);

  const result = designs.map((d) => {
    const brief = briefMap.get(d.id);
    return {
      id:           d.id,
      kind:         d.kind,
      status:       d.status,
      createdAt:    d.created_at,
      teamName:     client.name,
      sport:        client.sport,
      hasFile:      !!brief?.client_concept_url,
      hasBuilder:   !!(brief?.zone_colors),
      hasBrief:     !!(brief?.vision_prompt),
      thumbnailUrl: conceptMap.get(d.id) ?? null,
      zoneColors:   (brief?.zone_colors as Record<string, string> | null) ?? null,
    };
  });

  return NextResponse.json({ designs: result });
}

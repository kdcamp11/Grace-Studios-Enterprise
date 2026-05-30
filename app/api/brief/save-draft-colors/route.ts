import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * POST /api/brief/save-draft-colors
 *
 * Upserts a brief row for a draft design. Saves zone_colors for the Saved
 * Designs color swatch. Optionally also saves a canvas screenshot (uploaded to
 * Storage) and full builder metadata (garmentType, sport, artwork) into
 * ai_prompt so the builder-review page can show the jersey preview server-side.
 *
 * Body: {
 *   design_id: string;
 *   zone_colors?: Record<string, string>;
 *   imageDataUrl?: string;   // base64 canvas screenshot
 *   garmentType?: string;
 *   sport?: string;
 *   artwork?: unknown[];
 * }
 */
export async function POST(req: NextRequest) {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const {
    design_id,
    zone_colors,
    imageDataUrl,
    garmentType,
    sport,
    artwork,
  } = await req.json() as {
    design_id:    string;
    zone_colors?: Record<string, string>;
    imageDataUrl?: string;
    garmentType?:  string;
    sport?:        string;
    artwork?:      unknown[];
  };

  if (!design_id) {
    return NextResponse.json({ error: "design_id required" }, { status: 400 });
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

  // Upload canvas screenshot to Storage when provided
  let renderUrl: string | null = null;
  if (imageDataUrl) {
    const base64Data  = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer      = Buffer.from(base64Data, "base64");
    const storagePath = `builder-previews/${tenant.id}/designs/${design_id}/${Date.now()}.jpg`;

    const { error: uploadError } = await admin.storage
      .from("order-files")
      .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });

    if (!uploadError) {
      const { data: urlData } = admin.storage.from("order-files").getPublicUrl(storagePath);
      renderUrl = urlData.publicUrl;
    } else {
      console.error("[save-draft-colors] upload error:", uploadError);
    }
  }

  // Load existing brief to preserve ai_prompt data we're not updating
  const { data: existing } = await admin
    .from("briefs")
    .select("id, ai_prompt")
    .eq("design_id", design_id)
    .maybeSingle();

  const briefUpdate: Record<string, unknown> = {};

  if (zone_colors) briefUpdate.zone_colors = zone_colors;

  // Merge into ai_prompt when we have new image/metadata to save
  if (renderUrl || garmentType || sport || artwork !== undefined) {
    let prev: Record<string, unknown> = {};
    if (existing?.ai_prompt) {
      try { prev = JSON.parse(existing.ai_prompt as string); } catch { /* ignore */ }
    }
    const prevRenders = (prev.renders as Record<string, string> | undefined) ?? {};
    const prevBuilder = (prev.builder as Record<string, unknown> | undefined) ?? {};
    briefUpdate.ai_prompt = JSON.stringify({
      garmentType: garmentType ?? prev.garmentType ?? "Basketball Jersey & Shorts",
      sport:       sport       ?? prev.sport       ?? "Basketball",
      renders:     { frontJersey: renderUrl ?? prevRenders.frontJersey ?? null },
      builder:     { artwork: artwork ?? prevBuilder.artwork ?? [] },
    });
  }

  if (existing) {
    if (Object.keys(briefUpdate).length > 0) {
      await admin.from("briefs").update(briefUpdate).eq("id", existing.id);
    }
  } else {
    await admin.from("briefs").insert({
      design_id,
      tenant_id: tenant.id,
      ...briefUpdate,
    });
  }

  return NextResponse.json({ ok: true, renderUrl });
}

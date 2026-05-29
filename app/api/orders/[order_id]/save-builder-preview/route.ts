import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/orders/[order_id]/save-builder-preview
 *
 * Persists the in-progress jersey builder design so it can be restored on the
 * next visit and shown as a thumbnail in the client portal — before the brief
 * is formally submitted. Saves:
 *   - a JPEG screenshot of the canvas → Supabase Storage (render URL)
 *   - the full design state (zone colors + artwork) → briefs.ai_prompt JSON
 *   - zone colors → briefs.zone_colors column
 *
 * Body: {
 *   imageDataUrl?: string,   // base64 canvas screenshot (optional)
 *   sport?: string,
 *   garmentType?: string,
 *   zoneColors?: object,     // 7-zone color map
 *   artwork?: array,         // serialized artwork drafts (logos/text)
 * }
 * Returns: { renderUrl: string | null }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const limited = rateLimit(req, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;

  const ctx = await assertClientOrder(params.order_id);
  if (isErrorResponse(ctx)) return ctx;
  const { orderId, tenantId } = ctx;

  let body: {
    imageDataUrl?: string;
    sport?: string;
    garmentType?: string;
    zoneColors?: Record<string, string>;
    artwork?: unknown[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    imageDataUrl,
    sport = "Basketball",
    garmentType = "Basketball Jersey & Shorts",
    zoneColors,
    artwork,
  } = body;

  const admin = createAdminClient();

  // Upload the canvas screenshot (when provided). A unique filename per save
  // avoids stale CDN caching of the portal thumbnail.
  let renderUrl: string | null = null;
  if (imageDataUrl) {
    const base64Data  = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    const buffer      = Buffer.from(base64Data, "base64");
    const storagePath = `builder-previews/${tenantId}/${orderId}/${Date.now()}.jpg`;

    const { error: uploadError } = await admin.storage
      .from("order-files")
      .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });

    if (uploadError) {
      console.error("[save-builder-preview] upload error:", uploadError);
    } else {
      const { data: urlData } = admin.storage
        .from("order-files")
        .getPublicUrl(storagePath);
      renderUrl = urlData.publicUrl;
    }
  }

  // Preserve a previously saved render URL when this save had no screenshot.
  const { data: existing } = await admin
    .from("briefs")
    .select("id, ai_prompt")
    .eq("order_id", orderId)
    .single();

  let prevRenderUrl: string | null = null;
  if (existing?.ai_prompt) {
    try {
      const prev = JSON.parse(existing.ai_prompt as string);
      prevRenderUrl = prev?.renders?.frontJersey ?? null;
    } catch { /* ignore */ }
  }

  const aiPrompt = JSON.stringify({
    garmentType,
    sport,
    renders: { frontJersey: renderUrl ?? prevRenderUrl },
    builder: { artwork: artwork ?? [] },
  });

  const briefUpdate: Record<string, unknown> = { ai_prompt: aiPrompt };
  if (zoneColors) briefUpdate.zone_colors = zoneColors;

  if (existing) {
    await admin
      .from("briefs")
      .update(briefUpdate)
      .eq("id", existing.id);
  } else {
    await admin.from("briefs").insert({
      tenant_id: tenantId,
      order_id:  orderId,
      ...briefUpdate,
    });
  }

  // Mark the order as client-provided so the portal can identify it as a builder order
  await admin
    .from("orders")
    .update({ concept_source: "client_provided" })
    .eq("id", orderId)
    .is("concept_source", null);

  return NextResponse.json({ renderUrl: renderUrl ?? prevRenderUrl });
}

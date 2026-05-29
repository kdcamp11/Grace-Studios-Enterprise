import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/orders/[order_id]/save-builder-preview
 *
 * Captures a JPEG screenshot of the jersey builder canvas, uploads it to
 * Supabase Storage, and upserts the briefs row so the render URL appears
 * in the client portal before the brief is fully submitted.
 *
 * Body: { imageDataUrl: string (base64 data URL), sport?: string, garmentType?: string }
 * Returns: { renderUrl: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const ctx = await assertClientOrder(params.order_id);
  if (isErrorResponse(ctx)) return ctx;
  const { orderId, tenantId } = ctx;

  let body: { imageDataUrl?: string; sport?: string; garmentType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    imageDataUrl,
    sport = "Basketball",
    garmentType = "Basketball Jersey & Shorts",
  } = body;

  if (!imageDataUrl) {
    return NextResponse.json({ error: "imageDataUrl required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Strip the data URL prefix and decode
  const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  const storagePath = `builder-previews/${tenantId}/${orderId}/preview.jpg`;

  const { error: uploadError } = await admin.storage
    .from("order-files")
    .upload(storagePath, buffer, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    console.error("[save-builder-preview] upload error:", uploadError);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: urlData } = admin.storage
    .from("order-files")
    .getPublicUrl(storagePath);

  const renderUrl = urlData.publicUrl;

  const aiPrompt = JSON.stringify({
    garmentType,
    sport,
    renders: { frontJersey: renderUrl },
  });

  // Upsert brief row — create if missing, update ai_prompt if exists
  const { data: existing } = await admin
    .from("briefs")
    .select("id")
    .eq("order_id", orderId)
    .single();

  if (existing) {
    await admin
      .from("briefs")
      .update({ ai_prompt: aiPrompt })
      .eq("id", existing.id);
  } else {
    await admin.from("briefs").insert({
      tenant_id: tenantId,
      order_id:  orderId,
      ai_prompt: aiPrompt,
    });
  }

  return NextResponse.json({ renderUrl });
}

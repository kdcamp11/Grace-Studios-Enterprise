/**
 * POST /api/orders/[order_id]/generate-production-file
 *
 * Generates a production-ready SVG flat template from the approved design data
 * and uploads it to Supabase Storage.
 *
 * Called automatically from /api/approve-order on client approval.
 * Can also be called manually by admins to regenerate the file.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateJerseyProductionSVG,
  type ZoneColors,
  type ProductionFileInput,
} from "@/lib/production/jersey-svg";

// Default zone colors — used when a brief has no zone_colors (AI brief path)
const DEFAULT_ZONE_COLORS: ZoneColors = {
  jerseyTop:          "#1a1a1a",
  collar:             "#1a1a1a",
  jerseyShorts:       "#1a1a1a",
  jerseySidePanels:   "#1a1a1a",
  jerseyLowerPanels:  "#1a1a1a",
  sleevePanels:       "#1a1a1a",
  shortSidePanels:    "#1a1a1a",
};

export async function POST(
  _req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;
  const supabase = createAdminClient();

  // ── 1. Fetch order + client + brief ────────────────────────────────────────
  const [{ data: order }, { data: brief }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, tenant_id, client_id, stage")
      .eq("id", order_id)
      .single(),
    supabase
      .from("briefs")
      .select("zone_colors")
      .eq("order_id", order_id)
      .single(),
  ]);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("name, contact_name, email, sport, city, logo_url")
    .eq("id", order.client_id)
    .single();

  // ── 2. Resolve zone colors ──────────────────────────────────────────────────
  // brief.zone_colors is saved when the jersey builder redirects to the brief
  const rawZones = brief?.zone_colors as Record<string, string> | null | undefined;
  const colors: ZoneColors = rawZones
    ? {
        jerseyTop:          rawZones.jerseyTop          ?? DEFAULT_ZONE_COLORS.jerseyTop,
        collar:             rawZones.collar             ?? DEFAULT_ZONE_COLORS.collar,
        jerseyShorts:       rawZones.jerseyShorts       ?? DEFAULT_ZONE_COLORS.jerseyShorts,
        jerseySidePanels:   rawZones.jerseySidePanels   ?? DEFAULT_ZONE_COLORS.jerseySidePanels,
        jerseyLowerPanels:  rawZones.jerseyLowerPanels  ?? DEFAULT_ZONE_COLORS.jerseyLowerPanels,
        sleevePanels:       rawZones.sleevePanels       ?? DEFAULT_ZONE_COLORS.sleevePanels,
        shortSidePanels:    rawZones.shortSidePanels    ?? DEFAULT_ZONE_COLORS.shortSidePanels,
      }
    : DEFAULT_ZONE_COLORS;

  // ── 3. Build file data ──────────────────────────────────────────────────────
  const fileInput: ProductionFileInput = {
    orderNumber: order.order_number ?? order_id.slice(0, 8).toUpperCase(),
    teamName:    client?.name        ?? "Unknown Team",
    sport:       client?.sport       ?? "Basketball",
    contactName: client?.contact_name ?? undefined,
    city:        client?.city         ?? undefined,
    colors,
    logoUrl:     client?.logo_url     ?? undefined,
  };

  // ── 4. Generate SVG ─────────────────────────────────────────────────────────
  let svgContent: string;
  try {
    svgContent = generateJerseyProductionSVG(fileInput);
  } catch (err) {
    console.error("[generate-production-file] SVG generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate production file" },
      { status: 500 },
    );
  }

  // ── 5. Upload to Supabase Storage ───────────────────────────────────────────
  const bucket   = "production-files";
  const filePath = `${order.tenant_id}/${order_id}.svg`;

  // Ensure bucket exists (no-op if already created)
  await supabase.storage
    .createBucket(bucket, { public: true })
    .catch(() => { /* already exists */ });

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, Buffer.from(svgContent, "utf-8"), {
      contentType: "image/svg+xml",
      upsert: true,  // overwrite if regenerating
    });

  if (uploadError) {
    console.error("[generate-production-file] Storage upload error:", uploadError);
    return NextResponse.json(
      { error: "Failed to upload production file", detail: uploadError.message },
      { status: 500 },
    );
  }

  // ── 6. Get public URL and save to order ─────────────────────────────────────
  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  const fileUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("orders")
    .update({ production_file_url: fileUrl })
    .eq("id", order_id);

  if (updateError) {
    console.error("[generate-production-file] Order update error:", updateError);
    // Non-fatal — file is uploaded, URL is returned
  }

  return NextResponse.json({
    success:     true,
    file_url:    fileUrl,
    order_id,
    colors_used: Object.keys(rawZones ?? {}).length > 0 ? "jersey-builder" : "default",
  });
}

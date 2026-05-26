/**
 * POST /api/orders/[order_id]/generate-production-file
 *
 * Generates a full production artwork SVG including:
 *   - Flat garment templates with zone colors
 *   - Team logo(s) embedded
 *   - Player name & number roster
 *   - Color specs (HEX + CMYK)
 *   - Design notes from brief
 *   - Approved concept image reference
 *
 * Called automatically from /api/approve-order on client approval.
 * Can also be triggered manually by admins to regenerate.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateJerseyProductionSVG,
  type ZoneColors,
  type RosterEntry,
  type ProductionFileInput,
} from "@/lib/production/jersey-svg";

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

  // ── 1. Fetch order, brief, client, and approved concept in parallel ──────────
  const [{ data: order }, { data: briefRaw }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, tenant_id, client_id, stage")
      .eq("id", order_id)
      .single(),
    supabase
      .from("briefs")
      .select(
        "zone_colors, primary_colors, secondary_colors, accent_color, " +
        "logo_placement, design_system, vision_prompt, logo_urls, player_roster"
      )
      .eq("order_id", order_id)
      .single(),
  ]);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const [{ data: client }, { data: approvedConcept }] = await Promise.all([
    supabase
      .from("clients")
      .select("name, contact_name, email, sport, city, logo_url")
      .eq("id", order.client_id)
      .single(),
    supabase
      .from("concepts")
      .select("image_url")
      .eq("order_id", order_id)
      .eq("selected", true)
      .single(),
  ]);

  // ── 2. Resolve zone colors ────────────────────────────────────────────────────
  const brief = briefRaw as Record<string, unknown> | null;
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

  // ── 3. Resolve logos ──────────────────────────────────────────────────────────
  // Prefer logo_urls array from brief (uploaded during brief flow),
  // fall back to client.logo_url
  const briefLogoUrls = Array.isArray(brief?.logo_urls)
    ? (brief.logo_urls as unknown[]).filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    : [];
  const clientLogoUrl = client?.logo_url ?? null;
  const logoUrls: string[] = briefLogoUrls.length > 0
    ? briefLogoUrls
    : clientLogoUrl
    ? [clientLogoUrl]
    : [];

  // ── 4. Resolve roster ─────────────────────────────────────────────────────────
  type RawPlayer = { name?: string; number?: string; size?: string; cut?: string };
  const rawRoster = Array.isArray(brief?.player_roster) ? (brief.player_roster as RawPlayer[]) : [];
  const roster: RosterEntry[] = rawRoster
    .filter((p) => p.name || p.number)
    .map((p) => ({
      name:   p.name   ?? "—",
      number: p.number ?? "—",
      size:   p.size   ?? undefined,
      cut:    p.cut    ?? undefined,
    }));

  // ── 5. Build full production file input ───────────────────────────────────────
  const fileInput: ProductionFileInput = {
    orderNumber:     order.order_number ?? order_id.slice(0, 8).toUpperCase(),
    teamName:        client?.name          ?? "Unknown Team",
    sport:           client?.sport         ?? "Basketball",
    contactName:     client?.contact_name  ?? undefined,
    city:            client?.city          ?? undefined,
    colors,
    primaryColors:   (brief?.primary_colors   as string | null) ?? undefined,
    secondaryColors: (brief?.secondary_colors as string | null) ?? undefined,
    accentColor:     (brief?.accent_color     as string | null) ?? undefined,
    logoUrls:        logoUrls.length > 0 ? logoUrls : undefined,
    logoPlacement:   (brief?.logo_placement   as string | null) ?? undefined,
    designSystem:    (brief?.design_system    as string | null) ?? undefined,
    visionPrompt:    (brief?.vision_prompt    as string | null) ?? undefined,
    roster:          roster.length > 0 ? roster : undefined,
    conceptImageUrl: approvedConcept?.image_url ?? undefined,
  };

  // ── 6. Generate SVG ────────────────────────────────────────────────────────────
  let svgContent: string;
  try {
    svgContent = generateJerseyProductionSVG(fileInput);
  } catch (err) {
    console.error("[generate-production-file] SVG generation error:", err);
    return NextResponse.json({ error: "Failed to generate production file" }, { status: 500 });
  }

  // ── 7. Upload to Supabase Storage ──────────────────────────────────────────────
  const bucket   = "production-files";
  const filePath = `${order.tenant_id}/${order_id}.svg`;

  await supabase.storage.createBucket(bucket, { public: true }).catch(() => {});

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, Buffer.from(svgContent, "utf-8"), {
      contentType: "image/svg+xml",
      upsert: true,
    });

  if (uploadError) {
    console.error("[generate-production-file] Storage upload error:", uploadError);
    return NextResponse.json({ error: "Failed to upload production file", detail: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  const fileUrl = urlData.publicUrl;

  // ── 8. Save URL to order (non-fatal if column missing) ────────────────────────
  try {
    await supabase.from("orders").update({ production_file_url: fileUrl }).eq("id", order_id);
  } catch {
    console.warn("[generate-production-file] Could not save production_file_url — run migration 016");
  }

  // ── 9. Upsert into order_files so client sees it on tracker ───────────────────
  await supabase.from("order_files").delete().eq("order_id", order_id).eq("label", "Production Artwork");

  const svgBytes = Buffer.from(svgContent, "utf-8").length;
  const { error: fileInsertError } = await supabase
    .from("order_files")
    .insert({
      tenant_id:      order.tenant_id,
      order_id,
      file_url:       fileUrl,
      file_name:      `production-artwork-${fileInput.orderNumber}.svg`,
      file_size:      svgBytes,
      file_type:      "image/svg+xml",
      label:          "Production Artwork",
      client_visible: true,
    });

  if (fileInsertError) {
    console.error("[generate-production-file] order_files insert error:", fileInsertError);
  }

  return NextResponse.json({
    success:      true,
    file_url:     fileUrl,
    order_id,
    roster_count: roster.length,
    logos_count:  logoUrls.length,
    colors_used:  Object.keys(rawZones ?? {}).length > 0 ? "jersey-builder" : "brief-colors",
  });
}

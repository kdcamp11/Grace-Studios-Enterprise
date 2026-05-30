import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/orders/info?orderId=<uuid>
 * Returns order summary for checkout and concept-gate checks.
 * Uses service-role key to bypass RLS for the client join.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const { data: order, error: orderError } = await adminSupabase
    .from("orders")
    .select("order_number, design_fee_paid, production_choice, client_id, concept_source")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: client } = await adminSupabase
    .from("clients")
    .select("name, sport")
    .eq("id", order.client_id)
    .single();

  // Pull design metadata from brief for garment type + design system
  const { data: brief } = await adminSupabase
    .from("briefs")
    .select("ai_prompt, design_system, zone_colors")
    .eq("order_id", orderId)
    .single();

  let garmentType  = "Sports Uniform";
  let previewUrl: string | null = null;

  if (brief?.ai_prompt) {
    try {
      const meta = JSON.parse(brief.ai_prompt as string);
      if (meta.garmentType) garmentType = meta.garmentType;
      if (meta.renders?.frontJersey) previewUrl = meta.renders.frontJersey;
    } catch { /* ignore */ }
  }

  // Detect builder orders: explicit concept_source === "client_provided" is the primary
  // signal. For older orders where concept_source is null (set before the field existed),
  // fall back to zone_colors presence. Never override an explicit "ai" concept_source
  // even if zone_colors happens to be set on the brief.
  const hasZoneColors = !!(brief?.zone_colors && !Array.isArray(brief.zone_colors));
  const isBuilder =
    order.concept_source === "client_provided" ||
    (order.concept_source === null && hasZoneColors);

  return NextResponse.json({
    order_number:       order.order_number ?? orderId.slice(0, 8).toUpperCase(),
    design_fee_paid:    order.design_fee_paid    ?? false,
    production_choice:  order.production_choice  ?? null,
    concept_source:     (order.concept_source as string) ?? "ai",
    is_builder:         isBuilder,
    team_name:          client?.name    ?? "Your Team",
    sport:              client?.sport   ?? "",
    garment_type:       garmentType,
    design_system:      (brief?.design_system as string) ?? "bold",
    preview_url:        previewUrl,
  });
}

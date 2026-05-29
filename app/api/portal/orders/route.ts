/**
 * GET /api/portal/orders
 * Returns all orders for the authenticated client user.
 * Uses the admin client so it bypasses RLS on both `clients` and `orders` tables.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function GET() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ orders: [] }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ orders: [] });

  const admin = createAdminClient();

  // Find the client row — try user_id first, then email
  let { data: client } = await admin
    .from("clients")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .single();

  if (!client && user.email) {
    const { data: byEmail } = await admin
      .from("clients")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("email", user.email.toLowerCase())
      .single();
    client = byEmail ?? null;

    // Back-fill user_id so future lookups are faster
    if (client) {
      await admin
        .from("clients")
        .update({ user_id: user.id })
        .eq("id", client.id)
        .is("user_id", null);
    }
  }

  if (!client) return NextResponse.json({ orders: [] });

  // Pull team name + sport from the client row for the design preview cards.
  const { data: clientMeta } = await admin
    .from("clients")
    .select("name, sport")
    .eq("id", client.id)
    .single();

  // Fetch orders
  const { data: orderRows } = await admin
    .from("orders")
    .select("id, order_number, stage, created_at, order_type, design_fee_paid, tracking_number, concept_source")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  if (!orderRows || orderRows.length === 0) {
    return NextResponse.json({ orders: [], clientId: client.id });
  }

  const orderIds = orderRows.map((o) => o.id);

  // Fetch concepts, first-piece-media, and briefs (for design preview) in parallel
  const [{ data: concepts }, { data: mediaRows }, { data: briefRows }] = await Promise.all([
    admin.from("concepts").select("order_id, image_url").in("order_id", orderIds),
    admin
      .from("first_piece_media")
      .select("order_id, client_approved")
      .in("order_id", orderIds)
      .eq("client_visible", true),
    admin
      .from("briefs")
      .select("order_id, zone_colors, logos_to_include, ai_prompt, client_concept_url")
      .in("order_id", orderIds),
  ]);

  const conceptOrderIds = new Set((concepts ?? []).map((c) => c.order_id));
  // First concept image per order (for locked preview thumbnail)
  const previewByOrder = new Map<string, string>();
  for (const c of (concepts ?? [])) {
    if (c.image_url && !previewByOrder.has(c.order_id)) {
      previewByOrder.set(c.order_id, c.image_url);
    }
  }
  const pendingReviewIds = new Set(
    (mediaRows ?? [])
      .filter((m) => m.client_approved === null)
      .map((m) => m.order_id)
  );
  const briefByOrder = new Map(
    (briefRows ?? []).map((b) => [b.order_id as string, b])
  );

  const orders = orderRows.map((o) => {
    const brief = briefByOrder.get(o.id);

    // Parse ai_prompt JSON for per-order garment type and builder renders
    let garmentType: string | null = null;
    let builderRenderUrl: string | null = null;
    if (brief?.ai_prompt) {
      try {
        const meta = JSON.parse(brief.ai_prompt as string);
        if (meta.garmentType) garmentType = meta.garmentType as string;
        if (meta.renders?.frontJersey) builderRenderUrl = meta.renders.frontJersey as string;
      } catch { /* ignore malformed JSON */ }
    }

    const hasBrief = briefByOrder.has(o.id);

    return {
      ...o,
      has_concepts:       conceptOrderIds.has(o.id),
      has_pending_review: pendingReviewIds.has(o.id),
      preview_url:        previewByOrder.get(o.id) ?? null,
      builder_render_url: builderRenderUrl,
      garment_type:       garmentType,
      team_name:          clientMeta?.name ?? null,
      // Only use client-level sport as fallback when there's a brief — otherwise
      // clientMeta.sport reflects a different order's garment type entirely.
      sport:              hasBrief ? (clientMeta?.sport ?? null) : null,
      zone_colors:        (brief?.zone_colors as Record<string, string> | string[] | null) ?? null,
      logos_to_include:   (brief?.logos_to_include as string | null) ?? null,
      // Set only for the upload-concept flow (client uploaded a production file).
      // Lets the portal distinguish uploaded-concept orders from jersey-builder
      // orders — both carry concept_source = "client_provided".
      client_concept_url: (brief?.client_concept_url as string | null) ?? null,
    };
  });

  return NextResponse.json({ orders, clientId: client.id });
}

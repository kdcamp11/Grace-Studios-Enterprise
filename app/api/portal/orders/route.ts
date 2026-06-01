/**
 * GET /api/portal/orders
 * Returns all orders for the authenticated client user.
 * Uses the admin client so it bypasses RLS on both `clients` and `orders` tables.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";
import { resolveTimeline, stepForIndex } from "@/lib/order-milestones";

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

  // Fetch orders (supplier_user_id needed for supplierAssigned lifecycle gate)
  const { data: orderRows } = await admin
    .from("orders")
    .select("id, order_number, stage, created_at, order_type, design_fee_paid, tracking_number, concept_source, production_choice, deposit_paid, balance_paid, supplier_user_id")
    .eq("client_id", client.id)
    .order("created_at", { ascending: false });

  if (!orderRows || orderRows.length === 0) {
    return NextResponse.json({ orders: [], clientId: client.id });
  }

  const orderIds = orderRows.map((o) => o.id);

  // Fetch concepts, first-piece-media, briefs, mockups, and production files in parallel
  const [{ data: concepts }, { data: mediaRows }, { data: briefRows }, { data: mockupRows }, { data: fileRows }] = await Promise.all([
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
    // order_mockups (migration 025) — returns [] gracefully if table absent
    admin.from("order_mockups").select("order_id").in("order_id", orderIds),
    admin.from("order_files").select("order_id, label, client_visible").in("order_id", orderIds),
  ]);

  // Per-order milestone signal sets
  const mockupOrderIds = new Set((mockupRows ?? []).map((m) => m.order_id));
  // Only count files whose label contains "production" — matches deriveTimeline exactly.
  // Counting all client-visible files was too broad and would advance orders into
  // the production-files step before actual spec files have been uploaded.
  const prodFilesOrderIds = new Set(
    (fileRows ?? [])
      .filter((f) => (f.label ?? "").toLowerCase().includes("production"))
      .map((f) => f.order_id),
  );
  const mediaTotalIds    = new Set((mediaRows ?? []).map((m) => m.order_id));
  const mediaApprovedIds = new Set((mediaRows ?? []).filter((m) => m.client_approved === true).map((m) => m.order_id));

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

  // Production pricing per order (migration 027 — graceful fallback)
  const productionPricingMap: Record<string, { total: number | null; deposit: number | null; balance: number | null; quantity: number | null }> = {};
  try {
    const { data: pricingRows } = await admin
      .from("orders")
      .select("id, production_total_cents, production_deposit_cents, production_balance_cents, quantity")
      .in("id", orderIds);
    for (const row of pricingRows ?? []) {
      productionPricingMap[row.id] = {
        total:    (row as Record<string, unknown>).production_total_cents    as number | null ?? null,
        deposit:  (row as Record<string, unknown>).production_deposit_cents  as number | null ?? null,
        balance:  (row as Record<string, unknown>).production_balance_cents  as number | null ?? null,
        quantity: (row as Record<string, unknown>).quantity                  as number | null ?? null,
      };
    }
  } catch { /* migration 027 not yet applied */ }

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

    // Derived lifecycle phase — identical calculation to the client status page
    // and the Grace Enterprise workflow board. One source of truth across views.
    const derived = resolveTimeline({
      stage:             o.stage,
      production_choice: o.production_choice,
      deposit_paid:      (o as Record<string, unknown>).deposit_paid as boolean | null ?? null,
      balance_paid:      (o as Record<string, unknown>).balance_paid as boolean | null ?? null,
      tracking_number:   o.tracking_number,
      mockupUploaded:          mockupOrderIds.has(o.id),
      productionFilesUploaded: prodFilesOrderIds.has(o.id),
      supplierAssigned:        !!((o as Record<string, unknown>).supplier_user_id),
      firstPieceUploaded:      mediaTotalIds.has(o.id),
      firstPieceApproved:      mediaApprovedIds.has(o.id),
    });
    const lifecycleStep = stepForIndex(derived.currentIndex);

    return {
      ...o,
      lifecycle_phase:    lifecycleStep?.key ?? null,
      lifecycle_label:    lifecycleStep?.label ?? null,
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
      production_total_cents:   productionPricingMap[o.id]?.total    ?? null,
      production_deposit_cents: productionPricingMap[o.id]?.deposit  ?? null,
      production_balance_cents: productionPricingMap[o.id]?.balance  ?? null,
      production_quantity:      productionPricingMap[o.id]?.quantity ?? null,
    };
  });

  return NextResponse.json({ orders, clientId: client.id });
}

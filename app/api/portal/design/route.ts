/**
 * GET /api/portal/design?order_id=...
 *
 * Returns the persisted design for an order so the builder-review screen can
 * always show what the customer designed — even after localStorage was cleared
 * (post-submit) or on a fresh device.
 *
 * Ownership: the requesting user must own the order (matched by client.user_id
 * or client.email, same logic as /api/portal/orders). Uses the admin client to
 * bypass RLS, then enforces ownership in code.
 *
 * Design preview is rendered from briefs.zone_colors (no canvas capture).
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("order_id");
  if (!orderId) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const admin = createAdminClient();

  // Load the order (scoped to tenant) with its client + brief.
  const { data: order } = await admin
    .from("orders")
    .select("id, client_id, stage, design_fee_paid, order_type")
    .eq("id", orderId)
    .eq("tenant_id", tenant.id)
    .single();

  if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership check: the order's client must belong to this user (by user_id or email).
  const { data: client } = await admin
    .from("clients")
    .select("id, name, sport, user_id, email")
    .eq("id", order.client_id)
    .single();

  const owns =
    !!client &&
    (client.user_id === user.id ||
      (!!user.email && client.email?.toLowerCase() === user.email.toLowerCase()));

  if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Load the brief (latest, if multiple) for the design preview.
  const { data: brief } = await admin
    .from("briefs")
    .select("id, zone_colors, logos_to_include, vision_prompt, ai_prompt")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let renderUrl: string | null = null;
  if (brief?.ai_prompt) {
    try {
      const meta = JSON.parse(brief.ai_prompt as string);
      if (meta.renders?.frontJersey) renderUrl = meta.renders.frontJersey as string;
    } catch { /* ignore */ }
  }

  return NextResponse.json({
    teamName:        client?.name ?? null,
    sport:           client?.sport ?? null,
    zoneColors:      brief?.zone_colors ?? null,
    logosToInclude:  brief?.logos_to_include ?? null,
    visionPrompt:    brief?.vision_prompt ?? null,
    renderUrl,
    hasBrief:        !!brief,
    stage:           order.stage,
    designFeePaid:   order.design_fee_paid,
    orderType:       order.order_type,
  });
}

/**
 * GET /api/portal/order-detail?order_id=<uuid>
 * Returns full order detail for the client tracker page.
 *
 * Auth: Bearer token first, cookie fallback (same dual-auth as approve-order).
 * Ownership: user_id → email fallback → back-fill (same as portal/orders).
 * Resilient: production_file_url and approved concept are surfaced as files
 *   even if migration 016 hasn't been run yet.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getPaymentThresholdInfo, generateInvoiceNumber } from "@/lib/payments/thresholds";

export async function GET(req: NextRequest) {
  const order_id = req.nextUrl.searchParams.get("order_id");
  if (!order_id) return NextResponse.json({ error: "order_id required" }, { status: 400 });

  const admin = createAdminClient();

  // ── 1. Auth: Bearer token first, cookie fallback ─────────────────────────
  let user: { id: string; email?: string | null } | null = null;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const { data } = await admin.auth.getUser(token);
    if (data.user) user = data.user;
  }
  if (!user) {
    const serverClient = createServerClient();
    const { data: { user: cookieUser } } = await serverClient.auth.getUser();
    user = cookieUser ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── 2. Role check ─────────────────────────────────────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdminRole = profile?.role === "admin" || profile?.role === "super_admin";

  // ── 3. Fetch order (without production_file_url in case migration not run) ─
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, stage, created_at, estimated_delivery, tracking_number, client_id, tenant_id, production_choice, deposit_paid, balance_paid")
    .eq("id", order_id)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // ── 4. Ownership check for non-admins (user_id → email fallback) ──────────
  if (!isAdminRole) {
    let clientId: string | null = null;

    const { data: c1 } = await admin
      .from("clients")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (c1) clientId = c1.id;

    if (!clientId && user.email) {
      const { data: c2 } = await admin
        .from("clients")
        .select("id")
        .eq("email", user.email.toLowerCase())
        .single();
      if (c2) {
        clientId = c2.id;
        // Back-fill user_id
        await admin.from("clients").update({ user_id: user.id }).eq("id", c2.id).is("user_id", null);
      }
    }

    if (!clientId || clientId !== order.client_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // ── 5. Fetch related data in parallel ─────────────────────────────────────
  const [{ data: concepts }, { data: media }, { data: files }, { data: approvedConcept }, { data: invoiceRow }] =
    await Promise.all([
      admin.from("concepts").select("id").eq("order_id", order_id).limit(1),
      admin
        .from("first_piece_media")
        .select("id, media_url, media_type, caption, client_approved, client_note")
        .eq("order_id", order_id)
        .eq("client_visible", true)
        .order("created_at", { ascending: true }),
      admin
        .from("order_files")
        .select("id, file_url, file_name, file_size, file_type, label")
        .eq("order_id", order_id)
        .eq("client_visible", true)
        .order("created_at", { ascending: true }),
      // Fetch approved concept so we can always show the design as a viewable file
      admin
        .from("concepts")
        .select("image_url, concept_number")
        .eq("order_id", order_id)
        .eq("selected", true)
        .single(),
      // Fetch the most recent non-canceled invoice so the tracker can link to it
      admin
        .from("invoices")
        .select("id, status, total_amount, deposit_amount")
        .eq("order_id", order_id)
        .not("status", "eq", "canceled")
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    ]);

  // ── 5b. Fetch mockups + revision flag (safe if migration 025 not yet applied) ─
  let mockups: { id: string; image_url: string; label: string | null; revision_round: number; created_at: string }[] = [];
  let mockupRevisionUsed = false;
  try {
    const { data: mockupRows } = await admin
      .from("order_mockups")
      .select("id, image_url, label, revision_round, created_at")
      .eq("order_id", order_id)
      .order("created_at", { ascending: true });
    mockups = mockupRows ?? [];
    const { data: orderExtra2 } = await admin
      .from("orders")
      .select("mockup_revision_used")
      .eq("id", order_id)
      .single();
    mockupRevisionUsed = (orderExtra2 as { mockup_revision_used?: boolean } | null)?.mockup_revision_used ?? false;
  } catch {
    // Migration 025 not yet applied — skip gracefully
  }

  // ── 6. Try to get production_file_url separately (safe if column missing) ─
  let productionFileUrl: string | null = null;
  try {
    const { data: orderExtra } = await admin
      .from("orders")
      .select("production_file_url")
      .eq("id", order_id)
      .single();
    productionFileUrl = (orderExtra as { production_file_url?: string | null })?.production_file_url ?? null;
  } catch {
    // Column doesn't exist yet (migration 016 not run) — skip silently
  }

  // ── 6b. Auto-create production invoice if pricing is set but no invoice exists ─
  // Handles orders where pricing was saved before the auto-create logic was added.
  let resolvedInvoice = invoiceRow ?? null;
  if (!resolvedInvoice) {
    try {
      const { data: pricingRow } = await admin
        .from("orders")
        .select("production_total_cents, production_deposit_cents, tenant_id")
        .eq("id", order_id)
        .single();

      const totalCents   = (pricingRow as { production_total_cents?: number | null } | null)?.production_total_cents ?? null;
      const depositCents = (pricingRow as { production_deposit_cents?: number | null } | null)?.production_deposit_cents ?? null;
      const tenantId     = (pricingRow as { tenant_id?: string | null } | null)?.tenant_id ?? null;

      if (totalCents && totalCents > 0 && tenantId) {
        const totalDollars   = totalCents / 100;
        const depositDollars = (depositCents ?? 0) / 100;
        const threshold = getPaymentThresholdInfo(totalDollars);

        const { data: newInvoice } = await admin.from("invoices").insert({
          tenant_id:                  tenantId,
          order_id,
          invoice_number:             generateInvoiceNumber("PROD"),
          total_amount:               totalDollars,
          deposit_amount:             depositDollars,
          status:                     "sent",
          recommended_payment_method: threshold.recommended,
          payment_threshold_band:     threshold.band,
          card_enabled:               threshold.cardEnabled,
        }).select("id, status, total_amount, deposit_amount").single();

        resolvedInvoice = newInvoice ?? null;
      }
    } catch {
      // Migration 027 not applied or invoice creation failed — skip gracefully
    }
  }

  // ── 7. Build files list — always include the approved design image ─────────
  const orderLabel = order.order_number ?? order_id.slice(0, 8).toUpperCase();
  let resolvedFiles = files ?? [];

  // If the production SVG exists and isn't already in order_files, add it
  const hasProductionSpec = resolvedFiles.some((f) => f.label === "Production Spec");
  if (!hasProductionSpec && productionFileUrl) {
    resolvedFiles = [
      {
        id:        "production-spec-synthetic",
        file_url:  productionFileUrl,
        file_name: `production-spec-${orderLabel}.svg`,
        file_size: null,
        file_type: "image/svg+xml",
        label:     "Production Spec",
      },
      ...resolvedFiles,
    ];
  }

  // Always show the approved concept image if design is approved (stage = files_sent or beyond)
  const approvedStages = ["files_sent", "first_piece_in_progress", "first_piece_review", "bulk_production", "qc_verified", "shipped", "delivered", "complete"];
  const hasConceptFile = resolvedFiles.some((f) => f.label === "Approved Design");
  if (!hasConceptFile && approvedConcept?.image_url && approvedStages.includes(order.stage)) {
    resolvedFiles = [
      {
        id:        "approved-concept-synthetic",
        file_url:  approvedConcept.image_url,
        file_name: `approved-design-${orderLabel}.jpg`,
        file_size: null,
        file_type: "image/jpeg",
        label:     "Approved Design",
      },
      ...resolvedFiles,
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { client_id: _cid, tenant_id: _tid, ...orderFields } = order;

  return NextResponse.json({
    order: {
      ...orderFields,
      has_concepts:         (concepts?.length ?? 0) > 0,
      media:                media ?? [],
      files:                resolvedFiles,
      mockups,
      mockup_revision_used: mockupRevisionUsed,
      invoice:              resolvedInvoice,
    },
  });
}

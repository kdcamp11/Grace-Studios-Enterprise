import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import { logActivity } from "@/lib/activity/log";
import { calcProductionPricing, PRODUCTION_PRICING_TIERS } from "@/lib/payments/supplier-pricing";
import type { ProductionPricingTier } from "@/lib/payments/supplier-pricing";
import { isAllowedTransition } from "@/lib/workflow/stage-map";
import { getPaymentThresholdInfo, generateInvoiceNumber } from "@/lib/payments/thresholds";

const serviceSupabase = createAdminClient();

// ---------------------------------------------------------------------------
// GET /api/admin/orders/[order_id]
// Returns all data needed by the admin order detail page.
// ---------------------------------------------------------------------------
export async function GET(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const { order_id } = params;

  // Fetch order row first — also verify it belongs to this tenant.
  // Migration-025 columns (mockup_revision_used, first_piece_revision_used) are
  // fetched separately below so a missing column can't 500 the whole request.
  const { data: orderRow, error: orderError } = await serviceSupabase
    .from("orders")
    .select(
      "id, order_number, stage, created_at, approved_at, estimated_delivery, tracking_number, supplier, supplier_user_id, assigned_designer_id, notes, design_fee_paid, production_choice, production_file_url, client_id, deposit_paid, balance_paid",
    )
    .eq("id", order_id)
    .eq("tenant_id", ctx.tenant.id)
    .single();

  if (orderError || !orderRow) {
    return NextResponse.json(
      { error: orderError?.message ?? "Order not found" },
      { status: orderError ? 500 : 404 },
    );
  }

  // Migration-025 revision flags — graceful fallback if not yet applied.
  let mockupRevisionUsed = false;
  let firstPieceRevisionUsed = false;
  try {
    const { data: rev } = await serviceSupabase
      .from("orders")
      .select("mockup_revision_used, first_piece_revision_used")
      .eq("id", order_id)
      .single();
    mockupRevisionUsed     = (rev as { mockup_revision_used?: boolean } | null)?.mockup_revision_used ?? false;
    firstPieceRevisionUsed = (rev as { first_piece_revision_used?: boolean } | null)?.first_piece_revision_used ?? false;
  } catch {
    // Migration 025 not yet applied — skip gracefully
  }

  // Fetch client by client_id separately
  const { data: clientRow } = await serviceSupabase
    .from("clients")
    .select("name, email, sport, city")
    .eq("id", orderRow.client_id)
    .single();

  // Parallel fetch of remaining relations
  const [
    { data: briefRow },
    { data: concepts },
    { data: media },
    { data: supplierProfiles },
    { data: designerProfiles },
    { data: files },
    { data: invoiceRows },
    { data: mockups },
  ] = await Promise.all([
    serviceSupabase.from("briefs").select("*").eq("order_id", order_id).single(),
    serviceSupabase
      .from("concepts")
      .select("id, concept_number, image_url, selected")
      .eq("order_id", order_id)
      .order("concept_number"),
    serviceSupabase
      .from("first_piece_media")
      .select("*")
      .eq("order_id", order_id)
      .order("created_at", { ascending: false }),
    serviceSupabase
      .from("profiles")
      .select("id, full_name, company, email")
      .eq("role", "supplier"),
    serviceSupabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("tenant_id", ctx.tenant.id)
      .eq("role", "designer"),
    serviceSupabase
      .from("order_files")
      .select("id, created_at, file_url, file_name, file_size, file_type, label, client_visible")
      .eq("order_id", order_id)
      .order("created_at"),
    serviceSupabase
      .from("invoices")
      .select("*, payments(*)")
      .eq("order_id", order_id)
      .eq("tenant_id", ctx.tenant.id)
      .order("created_at", { ascending: false }),
    serviceSupabase
      .from("order_mockups")
      .select("*")
      .eq("order_id", order_id)
      .order("created_at", { ascending: true }),
  ]);

  const order = {
    id:                orderRow.id,
    order_number:      orderRow.order_number,
    stage:             orderRow.stage,
    created_at:        orderRow.created_at,
    approved_at:       orderRow.approved_at,
    estimated_delivery: orderRow.estimated_delivery,
    tracking_number:   orderRow.tracking_number,
    supplier:          orderRow.supplier,
    supplier_user_id:      orderRow.supplier_user_id,
    assigned_designer_id:  orderRow.assigned_designer_id,
    notes:                 orderRow.notes,
    design_fee_paid:      orderRow.design_fee_paid,
    production_choice:    orderRow.production_choice,
    production_file_url:  (orderRow as Record<string, unknown>).production_file_url as string | null ?? null,
    deposit_paid:         (orderRow as Record<string, unknown>).deposit_paid as boolean | null ?? null,
    balance_paid:         (orderRow as Record<string, unknown>).balance_paid as boolean | null ?? null,
    mockup_revision_used:      mockupRevisionUsed,
    first_piece_revision_used: firstPieceRevisionUsed,
    client: clientRow ?? { name: "—", email: "—", sport: "—", city: "—" },
  };

  // Migration 027: production pricing columns — graceful fallback.
  let productionPricing: {
    production_pricing_tier:  string | null;
    quantity:                 number | null;
    production_total_cents:   number | null;
    production_deposit_cents: number | null;
    production_balance_cents: number | null;
  } = {
    production_pricing_tier:  null,
    quantity:                 null,
    production_total_cents:   null,
    production_deposit_cents: null,
    production_balance_cents: null,
  };
  try {
    const { data: pricingRow } = await serviceSupabase
      .from("orders")
      .select("production_pricing_tier, quantity, production_total_cents, production_deposit_cents, production_balance_cents")
      .eq("id", order_id)
      .single();
    if (pricingRow) {
      productionPricing = pricingRow as typeof productionPricing;
    }
  } catch {
    // Migration 027 not yet applied — skip gracefully
  }

  return NextResponse.json({
    order: { ...order, ...productionPricing },
    brief:     briefRow   ?? null,
    concepts:  concepts   ?? [],
    media:     media      ?? [],
    suppliers: supplierProfiles ?? [],
    designers: designerProfiles ?? [],
    files:     files      ?? [],
    invoices:  invoiceRows ?? [],
    mockups:   mockups    ?? [],
  });
}

// ---------------------------------------------------------------------------
// PATCH /api/admin/orders/[order_id]
// Body must include an `action` discriminator.
// ---------------------------------------------------------------------------
export async function PATCH(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const { order_id } = params;

  // Verify this order belongs to the caller's tenant; also fetch current stage
  // so stage transitions validate against the authoritative DB value, not stale
  // client-provided from_stage.
  const { data: ownership } = await serviceSupabase
    .from("orders")
    .select("id, stage")
    .eq("id", order_id)
    .eq("tenant_id", ctx.tenant.id)
    .single();
  if (!ownership) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;

  // ── Stage advancement ──────────────────────────────────────────────────
  if (action === "stage") {
    const { stage, from_stage, force } = body as { action: string; stage: string; from_stage: string; force?: boolean };
    if (!stage || !from_stage) {
      return NextResponse.json({ error: "stage and from_stage are required" }, { status: 400 });
    }

    // Use the DB's current stage as the authoritative source for the transition
    // check — the client-provided from_stage can be stale (e.g., admin page
    // loaded before client approved the mockup, so local state still shows the
    // old stage while the DB has already advanced).
    const dbStage = (ownership as { stage?: string }).stage ?? from_stage;

    // Idempotent: if already at the target stage, return success.
    if (dbStage === stage) {
      return NextResponse.json({ success: true, already_at_stage: true });
    }

    if (!isAllowedTransition(dbStage, stage) && !force) {
      return NextResponse.json(
        { warning: true, message: "This transition skips expected workflow steps. Send { force: true } to override." },
        { status: 409 },
      );
    }

    const stageUpdate: Record<string, unknown> = { stage };

    // Auto-route to preferred supplier when GE releases production.
    // Only applies when moving to sent_to_supplier and no supplier is already set.
    if (stage === "sent_to_supplier") {
      const { data: currentOrder } = await serviceSupabase
        .from("orders")
        .select("supplier_user_id")
        .eq("id", order_id)
        .single();

      const alreadyAssigned = !!(currentOrder as Record<string, unknown> | null)?.supplier_user_id;

      if (!alreadyAssigned) {
        try {
          const { data: tenantRow } = await serviceSupabase
            .from("tenants")
            .select("preferred_supplier_id")
            .eq("id", ctx.tenant.id)
            .single();
          const preferredId = (tenantRow as { preferred_supplier_id?: string | null } | null)?.preferred_supplier_id;
          if (preferredId) {
            stageUpdate.supplier_user_id = preferredId;
          }
        } catch { /* migration 027 not yet applied — skip */ }
      }
    }

    const { error: updateError } = await serviceSupabase
      .from("orders")
      .update(stageUpdate)
      .eq("id", order_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: logError } = await serviceSupabase.from("stage_log").insert({
      order_id,
      tenant_id:  ctx.tenant.id,
      from_stage: dbStage,
      to_stage:   stage,
      changed_by: "admin",
      note:       force ? "Forced override — skipped expected workflow steps" : null,
    });

    if (logError) {
      console.error("[admin orders] stage_log insert failed:", logError.message);
    }

    const STAGE_LABELS: Record<string, string> = {
      onboarding: "Brief Submitted", design_confirmed: "Concepts Generating",
      files_sent: "Design Approved", first_piece_in_progress: "First Piece",
      first_piece_review: "First Piece Review", bulk_production: "Bulk Production",
      qc_verified: "QC Verified", shipped: "Shipped", delivered: "Delivered", complete: "Complete",
    };
    const routingNote = stageUpdate.supplier_user_id ? " (preferred supplier auto-assigned)" : "";
    await logActivity({
      tenantId: ctx.tenant.id, orderId: order_id,
      actorUserId: ctx.userId, actorRole: "admin",
      eventType: "stage_changed",
      eventMessage: `Stage moved from ${STAGE_LABELS[from_stage] ?? from_stage} → ${STAGE_LABELS[stage] ?? stage}${routingNote}`,
      metadata: { from_stage, to_stage: stage },
    });

    return NextResponse.json({ success: true, auto_assigned_supplier: !!stageUpdate.supplier_user_id });
  }

  // ── Production pricing ─────────────────────────────────────────────────
  if (action === "pricing") {
    const { tier, quantity: rawQty } = body as {
      action: string;
      tier: string;
      quantity: number | string;
    };

    if (!tier || !(tier in PRODUCTION_PRICING_TIERS)) {
      return NextResponse.json({ error: `Invalid pricing tier. Must be one of: ${Object.keys(PRODUCTION_PRICING_TIERS).join(", ")}` }, { status: 400 });
    }
    const qty = Number(rawQty);
    if (!Number.isInteger(qty) || qty < 1) {
      return NextResponse.json({ error: "quantity must be a positive integer" }, { status: 400 });
    }

    const calc = calcProductionPricing(tier as ProductionPricingTier, qty);

    try {
      const { error } = await serviceSupabase
        .from("orders")
        .update({
          production_pricing_tier:  calc.tier,
          quantity:                 calc.quantity,
          production_total_cents:   calc.total_cents,
          production_deposit_cents: calc.deposit_cents,
          production_balance_cents: calc.balance_cents,
        })
        .eq("id", order_id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Upsert production invoice so the client portal can display a payment CTA.
      // Amounts stored in dollars to match the invoices table convention.
      const totalDollars   = calc.total_cents / 100;
      const depositDollars = calc.deposit_cents / 100;
      const threshold = getPaymentThresholdInfo(totalDollars);

      try {
        // Find any existing non-canceled production invoice for this order.
        const { data: existingInvoice } = await serviceSupabase
          .from("invoices")
          .select("id")
          .eq("order_id", order_id)
          .not("status", "eq", "canceled")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (existingInvoice?.id) {
          // Update amounts on the existing invoice (don't change status so partial payments are preserved).
          await serviceSupabase
            .from("invoices")
            .update({ total_amount: totalDollars, deposit_amount: depositDollars })
            .eq("id", existingInvoice.id);
        } else {
          // Create a new invoice.
          await serviceSupabase.from("invoices").insert({
            tenant_id:                  ctx.tenant.id,
            order_id,
            invoice_number:             generateInvoiceNumber("PROD"),
            total_amount:               totalDollars,
            deposit_amount:             depositDollars,
            status:                     "sent",
            recommended_payment_method: threshold.recommended,
            payment_threshold_band:     threshold.band,
            card_enabled:               threshold.cardEnabled,
          });
        }
      } catch {
        // Non-fatal — log but don't block the pricing save response.
        console.error("[admin orders] invoice upsert failed for production pricing");
      }

      await logActivity({
        tenantId: ctx.tenant.id, orderId: order_id,
        actorUserId: ctx.userId, actorRole: "admin",
        eventType: "stage_changed",
        eventMessage: `Production pricing set: ${PRODUCTION_PRICING_TIERS[tier as ProductionPricingTier].label} × ${qty} sets = $${(calc.total_cents / 100).toFixed(2)}`,
        metadata: { tier, quantity: qty, total_cents: calc.total_cents },
      });

      return NextResponse.json({ success: true, pricing: calc });
    } catch {
      return NextResponse.json({ error: "Production pricing columns not available. Apply migration 027." }, { status: 500 });
    }
  }

  // ── Supplier assignment ────────────────────────────────────────────────
  if (action === "supplier") {
    const { supplier_user_id } = body as { action: string; supplier_user_id: string | null };

    const { error } = await serviceSupabase
      .from("orders")
      .update({ supplier_user_id: supplier_user_id ?? null })
      .eq("id", order_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (supplier_user_id) {
      const { data: sp } = await serviceSupabase.from("profiles").select("full_name, email").eq("id", supplier_user_id).single();
      await logActivity({
        tenantId: ctx.tenant.id, orderId: order_id,
        actorUserId: ctx.userId, actorRole: "admin",
        eventType: "supplier_assigned",
        eventMessage: `Supplier assigned: ${sp?.full_name ?? sp?.email ?? "Unknown"}`,
        metadata: { supplier_user_id },
      });
    } else {
      await logActivity({
        tenantId: ctx.tenant.id, orderId: order_id,
        actorUserId: ctx.userId, actorRole: "admin",
        eventType: "supplier_unassigned",
        eventMessage: "Supplier removed",
      });
    }

    return NextResponse.json({ success: true });
  }

  // ── Order details (tracking, delivery, notes) ──────────────────────────
  if (action === "details") {
    const { tracking_number, estimated_delivery, notes } = body as {
      action: string;
      tracking_number?: string;
      estimated_delivery?: string;
      notes?: string;
    };

    const updates: Record<string, string | null> = {};
    if ("tracking_number"   in body) updates.tracking_number   = tracking_number   ?? null;
    if ("estimated_delivery" in body) updates.estimated_delivery = estimated_delivery ?? null;
    if ("notes"             in body) updates.notes             = notes             ?? null;

    const { error } = await serviceSupabase
      .from("orders")
      .update(updates)
      .eq("id", order_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // ── First-piece media review ────────────────────────────────────────────
  if (action === "media") {
    const { media_id, approved, admin_note } = body as {
      action: string;
      media_id: string;
      approved: boolean;
      admin_note?: string;
    };

    if (!media_id || approved === undefined) {
      return NextResponse.json({ error: "media_id and approved are required" }, { status: 400 });
    }

    const { error } = await serviceSupabase
      .from("first_piece_media")
      .update({
        admin_approved:    approved,
        admin_note:        admin_note ?? null,
        admin_reviewed_at: new Date().toISOString(),
        client_visible:    approved,
      })
      .eq("id", media_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // ── File visibility toggle ─────────────────────────────────────────────
  if (action === "file_visibility") {
    const { file_id, client_visible } = body as {
      action: string;
      file_id: string;
      client_visible: boolean;
    };

    if (!file_id || client_visible === undefined) {
      return NextResponse.json({ error: "file_id and client_visible are required" }, { status: 400 });
    }

    const { error } = await serviceSupabase
      .from("order_files")
      .update({ client_visible })
      .eq("id", file_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  }

  // ── File insert (after storage upload) ────────────────────────────────────
  if (action === "file_insert") {
    const { uploaded_by, file_url, file_name, file_size, file_type, label, client_visible } = body as {
      action: string; uploaded_by?: string; file_url: string; file_name: string;
      file_size: number; file_type?: string; label?: string; client_visible: boolean;
    };

    const { data: row, error } = await serviceSupabase
      .from("order_files")
      .insert({ order_id, uploaded_by: uploaded_by ?? null, file_url, file_name, file_size, file_type: file_type ?? null, label: label ?? null, client_visible })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logActivity({
      tenantId: ctx.tenant.id, orderId: order_id,
      actorUserId: ctx.userId, actorRole: "admin",
      eventType: "files_uploaded",
      eventMessage: `File uploaded: ${file_name}`,
    });
    return NextResponse.json({ success: true, row });
  }

  // ── File delete ────────────────────────────────────────────────────────────
  if (action === "file_delete") {
    const { file_id } = body as { action: string; file_id: string };
    if (!file_id) return NextResponse.json({ error: "file_id required" }, { status: 400 });
    const { error } = await serviceSupabase.from("order_files").delete().eq("id", file_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  // ── Mockup insert (after storage upload) ──────────────────────────────────
  if (action === "mockup_insert") {
    const { image_url, label, revision_round, uploaded_by } = body as {
      action: string;
      image_url: string;
      label?: string;
      revision_round?: number;
      uploaded_by?: string;
    };

    if (!image_url) return NextResponse.json({ error: "image_url required" }, { status: 400 });

    // Fetch tenant_id from verified order ownership
    const { data: orderForTenant } = await serviceSupabase
      .from("orders")
      .select("tenant_id")
      .eq("id", order_id)
      .single();

    const { data: mockupRow, error: mockupError } = await serviceSupabase
      .from("order_mockups")
      .insert({
        tenant_id:      orderForTenant?.tenant_id ?? ctx.tenant.id,
        order_id,
        uploaded_by:    uploaded_by ?? null,
        image_url,
        label:          label ?? null,
        revision_round: revision_round ?? 1,
      })
      .select()
      .single();

    if (mockupError) return NextResponse.json({ error: mockupError.message }, { status: 500 });
    return NextResponse.json({ row: mockupRow });
  }

  // ── Mockup delete ──────────────────────────────────────────────────────────
  if (action === "mockup_delete") {
    const { mockup_id } = body as { action: string; mockup_id: string };
    if (!mockup_id) return NextResponse.json({ error: "mockup_id required" }, { status: 400 });
    const { error } = await serviceSupabase.from("order_mockups").delete().eq("id", mockup_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── On-hold toggle ────────────────────────────────────────────────────────
  if (action === "on_hold") {
    const { on_hold } = body as { action: string; on_hold: boolean };
    if (typeof on_hold !== "boolean") {
      return NextResponse.json({ error: "on_hold (boolean) required" }, { status: 400 });
    }
    try {
      const { error } = await serviceSupabase
        .from("orders")
        .update({ on_hold })
        .eq("id", order_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logActivity({
        tenantId: ctx.tenant.id, orderId: order_id,
        actorUserId: ctx.userId, actorRole: "admin",
        eventType: "stage_changed",
        eventMessage: on_hold ? "Order placed on hold" : "Order hold released",
        metadata: { on_hold },
      });
    } catch {
      // Migration 026 not yet applied
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

// ---------------------------------------------------------------------------
// POST /api/admin/orders/[order_id]
// Accepts multipart/form-data for server-side storage uploads (bypasses
// browser-client storage auth). Supports:
//   action=mockup_upload  — field: file, label, revision_round
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const { order_id } = params;

  const { data: ownership } = await serviceSupabase
    .from("orders")
    .select("id, tenant_id")
    .eq("id", order_id)
    .eq("tenant_id", ctx.tenant.id)
    .single();
  if (!ownership) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const formData = await req.formData();
  const action   = formData.get("action") as string | null;

  if (action === "mockup_upload") {
    const file          = formData.get("file") as Blob | null;
    const label         = (formData.get("label") as string | null) ?? null;
    const revisionRound = parseInt((formData.get("revision_round") as string | null) ?? "1", 10);

    if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

    const ext  = (file instanceof File ? file.name.split(".").pop() : null) ?? "jpg";
    const path = `${order_id}/mockups/${Date.now()}.${ext}`;

    const buffer  = Buffer.from(await file.arrayBuffer());
    const { error: storageError } = await serviceSupabase.storage
      .from("order-files")
      .upload(path, buffer, { contentType: file.type || "image/jpeg", upsert: false });

    if (storageError) {
      return NextResponse.json({ error: `Storage upload failed: ${storageError.message}` }, { status: 500 });
    }

    const { data: { publicUrl } } = serviceSupabase.storage.from("order-files").getPublicUrl(path);

    const { data: mockupRow, error: dbError } = await serviceSupabase
      .from("order_mockups")
      .insert({
        tenant_id:      ownership.tenant_id,
        order_id,
        uploaded_by:    ctx.userId,
        image_url:      publicUrl,
        label,
        revision_round: isNaN(revisionRound) ? 1 : revisionRound,
      })
      .select()
      .single();

    if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
    return NextResponse.json({ row: mockupRow });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

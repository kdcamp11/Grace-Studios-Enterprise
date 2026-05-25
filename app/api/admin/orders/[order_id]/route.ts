import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import { logActivity } from "@/lib/activity/log";

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

  // Fetch order row first — also verify it belongs to this tenant
  const { data: orderRow, error: orderError } = await serviceSupabase
    .from("orders")
    .select(
      "id, order_number, stage, created_at, approved_at, estimated_delivery, tracking_number, supplier, supplier_user_id, assigned_designer_id, notes, design_fee_paid, production_choice, production_file_url, client_id",
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
    client: clientRow ?? { name: "—", email: "—", sport: "—", city: "—" },
  };

  return NextResponse.json({
    order,
    brief:     briefRow   ?? null,
    concepts:  concepts   ?? [],
    media:     media      ?? [],
    suppliers: supplierProfiles ?? [],
    designers: designerProfiles ?? [],
    files:     files      ?? [],
    invoices:  invoiceRows ?? [],
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

  // Verify this order belongs to the caller's tenant
  const { data: ownership } = await serviceSupabase
    .from("orders")
    .select("id")
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
    const { stage, from_stage } = body as { action: string; stage: string; from_stage: string };
    if (!stage || !from_stage) {
      return NextResponse.json({ error: "stage and from_stage are required" }, { status: 400 });
    }

    const { error: updateError } = await serviceSupabase
      .from("orders")
      .update({ stage })
      .eq("id", order_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { error: logError } = await serviceSupabase.from("stage_log").insert({
      order_id,
      tenant_id:  ctx.tenant.id,
      from_stage,
      to_stage:   stage,
      changed_by: "admin",
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
    await logActivity({
      tenantId: ctx.tenant.id, orderId: order_id,
      actorUserId: ctx.userId, actorRole: "admin",
      eventType: "stage_changed",
      eventMessage: `Stage moved from ${STAGE_LABELS[from_stage] ?? from_stage} → ${STAGE_LABELS[stage] ?? stage}`,
      metadata: { from_stage, to_stage: stage },
    });

    return NextResponse.json({ success: true });
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

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ---------------------------------------------------------------------------
// GET /api/admin/orders/[order_id]
// Returns all data needed by the admin order detail page.
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;

  // Fetch order row first (no embedded join to avoid PostgREST join issues)
  const { data: orderRow, error: orderError } = await serviceSupabase
    .from("orders")
    .select(
      "id, order_number, stage, created_at, approved_at, estimated_delivery, tracking_number, supplier, supplier_user_id, notes, design_fee_paid, production_choice, client_id",
    )
    .eq("id", order_id)
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
    { data: files },
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
      .from("order_files")
      .select("id, created_at, file_url, file_name, file_size, file_type, label, client_visible")
      .eq("order_id", order_id)
      .order("created_at"),
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
    supplier_user_id:  orderRow.supplier_user_id,
    notes:             orderRow.notes,
    design_fee_paid:   orderRow.design_fee_paid,
    production_choice: orderRow.production_choice,
    client: clientRow ?? { name: "—", email: "—", sport: "—", city: "—" },
  };

  return NextResponse.json({
    order,
    brief:     briefRow   ?? null,
    concepts:  concepts   ?? [],
    media:     media      ?? [],
    suppliers: supplierProfiles ?? [],
    files:     files      ?? [],
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
  const { order_id } = params;

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
      from_stage,
      to_stage: stage,
      changed_by: "admin",
    });

    if (logError) {
      // Non-fatal — stage is already updated; log the error but return success
      console.error("[admin orders] stage_log insert failed:", logError.message);
    }

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

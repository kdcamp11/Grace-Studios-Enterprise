/**
 * POST /api/orders/[order_id]/review-mockup
 * Body: { action: "approve" | "request_revision" }
 *
 * Client-facing endpoint that lets a client approve their 2D mockup or
 * request one revision. Server enforces the one-revision limit via
 * orders.mockup_revision_used.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";

export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const ctx = await assertClientOrder(params.order_id);
  if (isErrorResponse(ctx)) return ctx;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action } = body;
  if (action !== "approve" && action !== "request_revision") {
    return NextResponse.json({ error: "action must be 'approve' or 'request_revision'" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (action === "approve") {
    const { error } = await admin
      .from("orders")
      .update({ stage: "production_files_prep" })
      .eq("id", ctx.orderId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, stage: "production_files_prep" });
  }

  // action === "request_revision" — check limit first
  const { data: orderRow, error: fetchError } = await admin
    .from("orders")
    .select("mockup_revision_used")
    .eq("id", ctx.orderId)
    .single();

  if (fetchError || !orderRow) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (orderRow.mockup_revision_used) {
    return NextResponse.json({ error: "Revision already used" }, { status: 409 });
  }

  const { error: updateError } = await admin
    .from("orders")
    .update({ stage: "mockup_revision", mockup_revision_used: true })
    .eq("id", ctx.orderId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, stage: "mockup_revision" });
}

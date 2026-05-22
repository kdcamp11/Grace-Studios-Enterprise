import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";
import { rateLimit } from "@/lib/rate-limit";

/**
 * POST /api/orders/mark-paid
 * Placeholder payment confirmation — sets design_fee_paid = true.
 * Will be replaced by a Stripe webhook in production.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 10, windowMs: 60 * 1000 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const { order_id } = body as { order_id?: string };

  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  const ctx = await assertClientOrder(order_id);
  if (isErrorResponse(ctx)) return ctx;

  const { error } = await createAdminClient()
    .from("orders")
    .update({ design_fee_paid: true })
    .eq("id", order_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

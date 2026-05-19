import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/orders/mark-paid
 * Placeholder payment confirmation endpoint. Sets design_fee_paid = true.
 *
 * In production this will be replaced / supplemented by a Stripe webhook
 * (stripe checkout.session.completed → mark paid). Until then, the checkout
 * page calls this directly so the full flow can be tested end-to-end.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { order_id } = body as { order_id?: string };

  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  const { error } = await adminSupabase
    .from("orders")
    .update({ design_fee_paid: true })
    .eq("id", order_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

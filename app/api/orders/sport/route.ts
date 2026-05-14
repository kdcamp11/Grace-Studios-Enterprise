import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/orders/sport?orderId=<uuid>
 * Returns the sport for a given order. Uses service-role key to bypass RLS.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  // Step 1: get client_id from orders
  const { data: order, error: orderError } = await adminSupabase
    .from("orders")
    .select("client_id")
    .eq("id", orderId)
    .single();

  if (orderError) {
    console.error("[sport] order error:", orderError);
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  if (!order?.client_id) {
    console.error("[sport] no client_id for order", orderId);
    return NextResponse.json({ sport: "" });
  }

  // Step 2: get sport from clients
  const { data: client, error: clientError } = await adminSupabase
    .from("clients")
    .select("sport")
    .eq("id", order.client_id)
    .single();

  if (clientError) {
    console.error("[sport] client error:", clientError);
    return NextResponse.json({ error: clientError.message }, { status: 500 });
  }

  const sport = client?.sport ?? "";
  console.log("[sport] orderId:", orderId, "→ sport:", sport);
  return NextResponse.json({ sport });
}

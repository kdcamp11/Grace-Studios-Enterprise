import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const adminSupabase = createAdminClient();

/**
 * GET /api/orders/sport?orderId=<uuid>
 * Returns the sport for a given order or design. Checks orders first; if not
 * found falls back to the designs table so pre-payment (design-keyed) brief
 * pages work without an order existing yet.
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  // Try orders first (legacy + post-payment flows)
  const { data: order } = await adminSupabase
    .from("orders")
    .select("client_id")
    .eq("id", orderId)
    .maybeSingle();

  let clientId = order?.client_id ?? null;

  // Fallback: check designs table (pre-payment design-keyed flow)
  if (!clientId) {
    const { data: design } = await adminSupabase
      .from("designs")
      .select("client_id")
      .eq("id", orderId)
      .maybeSingle();
    clientId = design?.client_id ?? null;
  }

  if (!clientId) {
    return NextResponse.json({ sport: "" });
  }

  const { data: client } = await adminSupabase
    .from("clients")
    .select("sport")
    .eq("id", clientId)
    .single();

  return NextResponse.json({ sport: client?.sport ?? "" });
}


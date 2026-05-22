import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

const VALID_SUPPLIER_STAGES = [
  "first_piece_in_progress",
  "first_piece_review",
  "bulk_production",
  "qc_verified",
  "shipped",
  "delivered",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;

  // Verify caller is authenticated
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { stage } = await req.json() as { stage: string };

  if (!VALID_SUPPLIER_STAGES.includes(stage as typeof VALID_SUPPLIER_STAGES[number])) {
    return NextResponse.json({ error: "Invalid stage for supplier" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify this order is assigned to the calling supplier
  const { data: order } = await admin
    .from("orders")
    .select("supplier_user_id, stage")
    .eq("id", order_id)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.supplier_user_id !== user.id) {
    return NextResponse.json({ error: "Not assigned to this order" }, { status: 403 });
  }

  const { error } = await admin
    .from("orders")
    .update({ stage })
    .eq("id", order_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

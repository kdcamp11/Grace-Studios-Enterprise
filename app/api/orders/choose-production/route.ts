import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";

/**
 * POST /api/orders/choose-production
 * Body: { order_id, choice: "design_file" | "production" }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { order_id, choice } = body as { order_id?: string; choice?: string };

  if (!order_id || !["design_file", "production"].includes(choice ?? "")) {
    return NextResponse.json({ error: "order_id and valid choice required" }, { status: 400 });
  }

  const ctx = await assertClientOrder(order_id);
  if (isErrorResponse(ctx)) return ctx;

  const patch: Record<string, unknown> = { production_choice: choice };

  if (choice === "production") {
    patch.stage = "first_piece_in_progress";
  }

  const { error } = await createAdminClient()
    .from("orders")
    .update(patch)
    .eq("id", order_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, choice });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/orders/choose-production
 * Body: { order_id, choice: "design_file" | "production" }
 *
 * design_file  → records choice, stage stays at "files_sent"
 * production   → records choice + production_deposit_paid=true (placeholder),
 *               advances stage to "first_piece_in_progress"
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { order_id, choice } = body as { order_id?: string; choice?: string };

  if (!order_id || !["design_file", "production"].includes(choice ?? "")) {
    return NextResponse.json({ error: "order_id and valid choice required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { production_choice: choice };

  if (choice === "production") {
    patch.production_deposit_paid = true;
    patch.stage = "first_piece_in_progress";
  }

  const { error } = await adminSupabase
    .from("orders")
    .update(patch)
    .eq("id", order_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, choice });
}

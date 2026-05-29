import { NextRequest, NextResponse } from "next/server";
import { assertClientDesign, isErrorResponse } from "@/lib/api/assert-client-design";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/designs/[design_id]/status
 *
 * Polling endpoint used by /designs/[design_id]/activated. Returns the
 * current design status and, once converted, the minted order_id so the
 * client can redirect to the right post-payment destination.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { design_id: string } },
) {
  const ctx = await assertClientDesign(params.design_id);
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();
  const { data: design } = await admin
    .from("designs")
    .select("status, kind, order_id")
    .eq("id", params.design_id)
    .single();

  if (!design) {
    return NextResponse.json({ error: "Design not found" }, { status: 404 });
  }

  return NextResponse.json({
    status:  design.status,
    kind:    design.kind,
    orderId: design.order_id ?? null,
  });
}

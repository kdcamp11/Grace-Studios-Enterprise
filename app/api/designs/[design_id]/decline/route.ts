/**
 * POST /api/designs/[design_id]/decline
 *
 * Permanently removes the design and its associated brief / concept rows.
 * briefs.design_id and concepts.design_id are ON DELETE SET NULL, so deleting
 * the design row is safe — child rows become orphans that nothing queries.
 * Only the owning client may decline their own design.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  _req: NextRequest,
  { params }: { params: { design_id: string } },
) {
  const { design_id } = params;

  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Verify ownership — client row must match by user_id or email.
  const { data: design } = await admin
    .from("designs")
    .select("id, client_id, status")
    .eq("id", design_id)
    .maybeSingle();

  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Converted designs have a real order attached — don't allow removal.
  if (design.status === "converted") {
    return NextResponse.json({ error: "Activated designs cannot be removed" }, { status: 409 });
  }

  const { data: client } = await admin
    .from("clients")
    .select("id, user_id, email")
    .eq("id", design.client_id)
    .single();

  const owns =
    !!client &&
    (client.user_id === user.id ||
      (!!user.email && client.email?.toLowerCase() === user.email.toLowerCase()));

  if (!owns) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Delete brief and concept rows first (design_id FK is ON DELETE SET NULL,
  // but we want these gone too, not left as orphans).
  await admin.from("briefs").delete().eq("design_id", design_id);
  await admin.from("concepts").delete().eq("design_id", design_id);

  // Delete the design itself.
  const { error } = await admin.from("designs").delete().eq("id", design_id);
  if (error) {
    console.error("[decline] delete failed:", error.message);
    return NextResponse.json({ error: "Failed to remove design" }, { status: 500 });
  }

  return NextResponse.json({ status: "removed" });
}

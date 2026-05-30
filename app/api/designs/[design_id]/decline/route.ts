/**
 * POST /api/designs/[design_id]/decline
 *
 * Marks the design as declined so it disappears from the client portal
 * without hard-deleting the row (brief and concept data are preserved).
 * Only the owning client may decline their own design.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: NextRequest,
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

  // Only draft/submitted designs can be declined.
  if (design.status === "converted") {
    return NextResponse.json({ error: "Converted designs cannot be declined" }, { status: 409 });
  }

  const { error } = await admin
    .from("designs")
    .update({ status: "declined" })
    .eq("id", design_id);

  if (error) {
    return NextResponse.json({ error: "Failed to decline design" }, { status: 500 });
  }

  return NextResponse.json({ status: "declined" });
}

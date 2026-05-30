/**
 * GET /api/portal/board-data?order_id=<uuid>
 * Returns brief + concept rows for the concepts page — bypasses RLS via admin client.
 * Authenticated: user must be logged in and own the client row for this order.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const order_id  = req.nextUrl.searchParams.get("order_id");
  const design_id = req.nextUrl.searchParams.get("design_id");
  if (!order_id && !design_id) {
    return NextResponse.json({ error: "order_id or design_id required" }, { status: 400 });
  }

  // Auth check
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Verify this user owns this order/design (or is admin/super_admin)
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdminRole = profile?.role === "admin" || profile?.role === "super_admin";

  if (!isAdminRole) {
    // Resolve the owning client_id from either orders or designs
    const { data: row } = design_id
      ? await admin.from("designs").select("id, client_id").eq("id", design_id).maybeSingle()
      : await admin.from("orders").select("id, client_id").eq("id", order_id!).maybeSingle();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Check client belongs to user (by user_id or email)
    const { data: clientByUserId } = await admin
      .from("clients")
      .select("id")
      .eq("id", row.client_id)
      .eq("user_id", user.id)
      .single();

    if (!clientByUserId && user.email) {
      const { data: clientByEmail } = await admin
        .from("clients")
        .select("id")
        .eq("id", row.client_id)
        .eq("email", user.email.toLowerCase())
        .single();

      if (!clientByEmail) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (!clientByUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Fetch brief data
  const { data: brief } = design_id
    ? await admin.from("briefs").select("ai_prompt, logo_urls, logo_placement").eq("design_id", design_id).maybeSingle()
    : await admin.from("briefs").select("ai_prompt, logo_urls, logo_placement").eq("order_id", order_id!).maybeSingle();

  // Fetch concept rows (legacy / renders-in-concepts-table format)
  const { data: conceptRows } = design_id
    ? await admin.from("concepts").select("id, concept_number, image_url").eq("design_id", design_id).order("concept_number")
    : await admin.from("concepts").select("id, concept_number, image_url").eq("order_id", order_id!).order("concept_number");

  // Fetch order/design + client name
  const { data: orderRow } = design_id
    ? await admin.from("designs").select("clients(name)").eq("id", design_id).maybeSingle()
    : await admin.from("orders").select("order_number, clients(name)").eq("id", order_id!).maybeSingle();

  return NextResponse.json({
    brief: brief ?? null,
    conceptRows: conceptRows ?? [],
    order: orderRow ?? null,
  });
}

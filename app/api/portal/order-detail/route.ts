/**
 * GET /api/portal/order-detail?order_id=<uuid>
 * Returns full order detail for the client tracker page — bypasses RLS via admin client.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  const order_id = req.nextUrl.searchParams.get("order_id");
  if (!order_id) return NextResponse.json({ error: "order_id required" }, { status: 400 });

  // Auth check
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Check role
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdminRole = profile?.role === "admin" || profile?.role === "super_admin";

  // Fetch order
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, stage, created_at, estimated_delivery, tracking_number, client_id, production_file_url, tenant_id")
    .eq("id", order_id)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Verify ownership for non-admins
  if (!isAdminRole) {
    const { data: clientByUserId } = await admin
      .from("clients")
      .select("id")
      .eq("id", order.client_id)
      .eq("user_id", user.id)
      .single();

    if (!clientByUserId && user.email) {
      const { data: clientByEmail } = await admin
        .from("clients")
        .select("id")
        .eq("id", order.client_id)
        .eq("email", user.email.toLowerCase())
        .single();

      if (!clientByEmail) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (!clientByUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Fetch related data
  const [{ data: concepts }, { data: media }, { data: files }] = await Promise.all([
    admin.from("concepts").select("id").eq("order_id", order_id).limit(1),
    admin
      .from("first_piece_media")
      .select("id, media_url, media_type, caption, client_approved, client_note")
      .eq("order_id", order_id)
      .eq("client_visible", true)
      .order("created_at", { ascending: true }),
    admin
      .from("order_files")
      .select("id, file_url, file_name, file_size, file_type, label")
      .eq("order_id", order_id)
      .eq("client_visible", true)
      .order("created_at", { ascending: true }),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { client_id: _client_id, tenant_id: _tenant_id, ...orderFields } = order;

  // If no order_files rows exist yet but a production_file_url was saved on the
  // order (e.g. approved before the order_files insert was added), surface it
  // as a synthetic entry so the client always sees the download.
  let resolvedFiles = files ?? [];
  const hasProductionSpec = resolvedFiles.some((f) => f.label === "Production Spec");
  if (!hasProductionSpec && order.production_file_url) {
    const orderLabel = order.order_number ?? order_id.slice(0, 8).toUpperCase();
    resolvedFiles = [
      {
        id:        "production-spec-synthetic",
        file_url:  order.production_file_url,
        file_name: `production-spec-${orderLabel}.svg`,
        file_size: null,
        file_type: "image/svg+xml",
        label:     "Production Spec",
      },
      ...resolvedFiles,
    ];
  }

  return NextResponse.json({
    order: {
      ...orderFields,
      has_concepts: (concepts?.length ?? 0) > 0,
      media: media ?? [],
      files: resolvedFiles,
    },
  });
}

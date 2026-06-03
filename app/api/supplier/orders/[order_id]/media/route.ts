import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/supplier/orders/[order_id]/media
 *
 * Records a first-piece media upload in the database. Storage upload happens
 * client-side via Supabase Storage; this route handles the DB insert using the
 * admin client to avoid the RLS infinite-recursion issue on first_piece_media.
 *
 * Body: { media_url, media_type, caption? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  try {
    const serverClient = createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isSupplier = profile?.role === "supplier";
    const isAdmin    = profile?.role === "admin" || profile?.role === "super_admin";
    if (!isSupplier && !isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Always look up the order — needed for tenant_id and supplier verification
    const { data: order } = await admin
      .from("orders")
      .select("tenant_id, supplier_user_id")
      .eq("id", params.order_id)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (isSupplier && order.supplier_user_id !== user.id) {
      return NextResponse.json({ error: "Not assigned to this order" }, { status: 403 });
    }

    const body = await req.json() as {
      media_url: string;
      media_type: "photo" | "video";
      caption?: string | null;
    };

    if (!body.media_url || !body.media_type) {
      return NextResponse.json({ error: "media_url and media_type are required" }, { status: 400 });
    }

    const { data: row, error } = await admin
      .from("first_piece_media")
      .insert({
        order_id:    params.order_id,
        tenant_id:   order.tenant_id,
        uploaded_by: user.id,
        media_url:   body.media_url,
        media_type:  body.media_type,
        caption:     body.caption ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[supplier/media] insert error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ media: row });
  } catch (err) {
    console.error("[supplier/media] unhandled error:", err);
    return NextResponse.json({ error: "Upload record failed. Please try again." }, { status: 500 });
  }
}

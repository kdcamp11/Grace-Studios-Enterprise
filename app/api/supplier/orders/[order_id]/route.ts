import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// GET /api/supplier/orders/[order_id]
// Returns order detail for a supplier — uses admin client to bypass RLS.
// Supplier: verified by supplier_user_id match. Admin: unrestricted.
// ---------------------------------------------------------------------------
export async function GET(
  _req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;

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

  // Admin client bypasses RLS — supplier assignment enforced manually below
  let orderQuery = admin
    .from("orders")
    .select("id, order_number, stage, created_at, estimated_delivery, tracking_number, production_file_url, deposit_paid, balance_paid, supplier_user_id, client_id")
    .eq("id", order_id);

  if (isSupplier) {
    orderQuery = orderQuery.eq("supplier_user_id", user.id);
  }

  const { data: order } = await orderQuery.single();
  if (!order) {
    return NextResponse.json({ error: "Order not found or not assigned to you" }, { status: 404 });
  }

  const [{ data: brief }, { data: concepts }, { data: media }, { data: clientRow }] = await Promise.all([
    admin.from("briefs").select("*").eq("order_id", order_id).single(),
    admin
      .from("concepts")
      .select("id, image_url, concept_number")
      .eq("order_id", order_id)
      .eq("selected", true),
    admin
      .from("first_piece_media")
      .select("id, created_at, media_url, media_type, caption, admin_approved, admin_note, client_visible, client_approved")
      .eq("order_id", order_id)
      .order("created_at", { ascending: false }),
    admin
      .from("clients")
      .select("name, email, sport, city")
      .eq("id", (order as Record<string, unknown>).client_id as string)
      .single(),
  ]);

  return NextResponse.json({
    order: {
      id: order.id,
      order_number: order.order_number,
      stage: order.stage,
      created_at: order.created_at,
      estimated_delivery: order.estimated_delivery ?? null,
      tracking_number:    (order as Record<string, unknown>).tracking_number    as string | null ?? null,
      production_file_url: (order as Record<string, unknown>).production_file_url as string | null ?? null,
      deposit_paid:  (order as Record<string, unknown>).deposit_paid  as boolean ?? false,
      balance_paid:  (order as Record<string, unknown>).balance_paid  as boolean ?? false,
      client: clientRow ?? { name: "—", email: "—", sport: "—", city: "—" },
    },
    brief:    brief    ?? null,
    concepts: concepts ?? [],
    media:    media    ?? [],
  });
}

type SupplierAction =
  | "start_first_piece"    // files_sent → first_piece_in_progress
  | "submit_for_review"    // first_piece_in_progress → first_piece_review
  | "resubmit_for_review"  // first_piece_revision → first_piece_review
  | "start_bulk"           // (reserved — GE advances to bulk_production after approval)
  | "complete_bulk"        // bulk_production → qc_verified
  | "update_tracking"      // set tracking_number (stays qc_verified)
  | "mark_shipped";        // qc_verified → shipped

interface PatchBody {
  action: SupplierAction;
  tracking_number?: string;
  qc_notes?: string;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const { order_id } = params;

  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as PatchBody;

  const admin = createAdminClient();

  // Verify this order is assigned to the calling supplier (or caller is admin)
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: order } = await admin
    .from("orders")
    .select("id, stage, supplier_user_id, deposit_paid, balance_paid, tracking_number")
    .eq("id", order_id)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const isSupplier = profile?.role === "supplier";
  const isAdmin    = profile?.role === "admin";

  if (isSupplier && order.supplier_user_id !== user.id) {
    return NextResponse.json({ error: "Not assigned to this order" }, { status: 403 });
  }
  if (!isSupplier && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Action-based updates ─────────────────────────────────────────────────
  switch (body.action) {
    case "start_first_piece": {
      if (order.stage !== "files_sent" && order.stage !== "sent_to_supplier") {
        return NextResponse.json({ error: "Order not in release-ready stage" }, { status: 409 });
      }
      if (!order.deposit_paid) {
        return NextResponse.json({ error: "First payment must be completed before production can begin" }, { status: 409 });
      }
      const { error } = await admin
        .from("orders")
        .update({ stage: "first_piece_in_progress" })
        .eq("id", order_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Notify GE that supplier started
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "first_piece_started", order_id }),
      }).catch(() => {});

      return NextResponse.json({ success: true, stage: "first_piece_in_progress" });
    }

    case "submit_for_review":
    case "resubmit_for_review": {
      const validFrom = body.action === "resubmit_for_review"
        ? ["first_piece_revision"]
        : ["first_piece_in_progress"];
      if (!validFrom.includes(order.stage)) {
        return NextResponse.json({ error: `Order must be in ${validFrom.join("/")} to submit for review` }, { status: 409 });
      }
      // Require at least one media upload
      const { count } = await admin
        .from("first_piece_media")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order_id);
      if (!count || count === 0) {
        return NextResponse.json({ error: "Upload at least one first piece photo or video before submitting" }, { status: 409 });
      }
      const { error } = await admin
        .from("orders")
        .update({ stage: "first_piece_review" })
        .eq("id", order_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "first_piece_submitted", order_id }),
      }).catch(() => {});

      return NextResponse.json({ success: true, stage: "first_piece_review" });
    }

    case "complete_bulk": {
      if (order.stage !== "bulk_production") {
        return NextResponse.json({ error: "Order must be in bulk_production to complete" }, { status: 409 });
      }
      if (!order.balance_paid) {
        return NextResponse.json({ error: "Final payment must be completed before bulk can be marked complete" }, { status: 409 });
      }
      const { error } = await admin
        .from("orders")
        .update({ stage: "qc_verified" })
        .eq("id", order_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, stage: "qc_verified" });
    }

    case "update_tracking": {
      if (!body.tracking_number?.trim()) {
        return NextResponse.json({ error: "Tracking number is required" }, { status: 400 });
      }
      if (order.stage !== "qc_verified") {
        return NextResponse.json({ error: "Order must be in QC stage to add tracking" }, { status: 409 });
      }
      const { error } = await admin
        .from("orders")
        .update({ tracking_number: body.tracking_number.trim() })
        .eq("id", order_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    case "mark_shipped": {
      if (order.stage !== "qc_verified") {
        return NextResponse.json({ error: "Order must be in QC stage to mark shipped" }, { status: 409 });
      }
      const trackingToUse = body.tracking_number?.trim() || (order.tracking_number as string | null);
      if (!trackingToUse) {
        return NextResponse.json({ error: "Tracking number is required before marking shipped" }, { status: 409 });
      }
      const update: Record<string, unknown> = { stage: "shipped" };
      if (body.tracking_number?.trim()) update.tracking_number = body.tracking_number.trim();
      const { error } = await admin
        .from("orders")
        .update(update)
        .eq("id", order_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, stage: "shipped" });
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}

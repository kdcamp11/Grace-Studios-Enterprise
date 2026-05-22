import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import {
  sendBriefSubmitted,
  sendFirstPieceSubmitted,
  sendFirstPieceReady,
  sendChangesRequested,
  sendClientApprovedFirstPiece,
  sendClientRequestedChanges,
  type TenantEmailCtx,
} from "@/lib/email";

type NotifyEvent =
  | "brief_submitted"
  | "first_piece_submitted"
  | "first_piece_ready"
  | "changes_requested"
  | "client_approved_first_piece"
  | "client_requested_changes";

export async function POST(req: NextRequest) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  try {
    const body = await req.json();
    const { event, order_id, media_id, admin_note } = body as {
      event: NotifyEvent;
      order_id: string;
      media_id?: string;
      admin_note?: string | null;
    };

    if (!event || !order_id) {
      return NextResponse.json({ error: "event and order_id required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const tenant: TenantEmailCtx = {
      name:        ctx.tenant.name,
      brandColor:  ctx.tenant.brand_primary,
      adminEmail:  ctx.tenant.support_email,
    };

    // Fetch order + client
    const { data: order } = await supabase
      .from("orders")
      .select("id, order_number, client_id, supplier_user_id")
      .eq("id", order_id)
      .single();

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: client } = await supabase
      .from("clients")
      .select("name, email, sport, city")
      .eq("id", order.client_id)
      .single();

    const orderNumber = order.order_number ?? order_id.slice(0, 8).toUpperCase();
    const teamName    = client?.name ?? "Client";

    switch (event) {
      case "brief_submitted": {
        if (!client) break;
        await sendBriefSubmitted({
          orderNumber,
          teamName,
          sport:  client.sport ?? "—",
          city:   client.city  ?? "—",
          email:  client.email ?? "—",
          tenant,
        });
        break;
      }

      case "first_piece_submitted": {
        // Fetch supplier name
        let supplierName = "Supplier";
        if (order.supplier_user_id) {
          const { data: supplierProfile } = await supabase
            .from("profiles")
            .select("full_name, company")
            .eq("id", order.supplier_user_id)
            .single();
          supplierName = supplierProfile?.company ?? supplierProfile?.full_name ?? "Supplier";
        }
        await sendFirstPieceSubmitted({ orderNumber, teamName, supplierName, tenant });
        break;
      }

      case "first_piece_ready": {
        if (!client?.email) break;
        await sendFirstPieceReady({
          clientEmail: client.email,
          teamName,
          orderNumber,
          orderId: order_id,
          tenant,
        });
        break;
      }

      case "changes_requested": {
        // Fetch supplier email
        if (!order.supplier_user_id) break;
        const { data: supplierProfile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", order.supplier_user_id)
          .single();
        if (!supplierProfile?.email) break;
        await sendChangesRequested({
          supplierEmail: supplierProfile.email,
          orderNumber,
          teamName,
          adminNote: admin_note ?? null,
          tenant,
        });
        break;
      }

      case "client_approved_first_piece": {
        await sendClientApprovedFirstPiece({
          orderNumber,
          teamName,
          clientNote: admin_note ?? null,
          tenant,
        });
        break;
      }

      case "client_requested_changes": {
        await sendClientRequestedChanges({
          orderNumber,
          teamName,
          clientNote: admin_note ?? null,
          tenant,
        });
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown event" }, { status: 400 });
    }

    return NextResponse.json({ status: "sent", event, order_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[notify] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendBriefSubmitted,
  sendFirstPieceSubmitted,
  sendFirstPieceReady,
  sendChangesRequested,
  sendClientApprovedFirstPiece,
  sendClientRequestedChanges,
} from "@/lib/email";

type NotifyEvent =
  | "brief_submitted"
  | "first_piece_submitted"
  | "first_piece_ready"
  | "changes_requested"
  | "client_approved_first_piece"
  | "client_requested_changes";

export async function POST(req: NextRequest) {
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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

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
        await sendFirstPieceSubmitted({ orderNumber, teamName, supplierName });
        break;
      }

      case "first_piece_ready": {
        if (!client?.email) break;
        await sendFirstPieceReady({
          clientEmail: client.email,
          teamName,
          orderNumber,
          orderId: order_id,
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
        });
        break;
      }

      case "client_approved_first_piece": {
        await sendClientApprovedFirstPiece({
          orderNumber,
          teamName,
          clientNote: admin_note ?? null,
        });
        break;
      }

      case "client_requested_changes": {
        await sendClientRequestedChanges({
          orderNumber,
          teamName,
          clientNote: admin_note ?? null,
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

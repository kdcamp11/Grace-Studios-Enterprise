import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";
import { sendClientApprovedFirstPiece, sendClientRequestedChanges, type TenantEmailCtx } from "@/lib/email";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const ctx = await assertClientOrder(params.order_id);
  if (isErrorResponse(ctx)) return ctx;

  const { orderId: order_id } = ctx;
  const body = await req.json() as Record<string, unknown>;
  const { action } = body;

  const admin = createAdminClient();

  // ── Client first-piece media review ───────────────────────────────────────
  if (action === "review_media") {
    const { media_id, approved, note } = body as {
      action: string;
      media_id: string;
      approved: boolean;
      note?: string;
    };

    if (!media_id || approved === undefined) {
      return NextResponse.json({ error: "media_id and approved are required" }, { status: 400 });
    }

    // Verify the media item belongs to this order
    const { data: mediaRow } = await admin
      .from("first_piece_media")
      .select("id")
      .eq("id", media_id)
      .eq("order_id", order_id)
      .single();

    if (!mediaRow) return NextResponse.json({ error: "Media not found" }, { status: 404 });

    const { error } = await admin.from("first_piece_media").update({
      client_approved:    approved,
      client_note:        note ?? null,
      client_reviewed_at: new Date().toISOString(),
    }).eq("id", media_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fire notification email to studio (non-blocking)
    Promise.resolve(
      admin
        .from("orders")
        .select("order_number, tenant_id, clients(name), tenants(name, brand_primary, support_email)")
        .eq("id", order_id)
        .single()
    ).then(({ data: order }) => {
      if (!order) return;
      const teamName    = (Array.isArray(order.clients) ? order.clients[0] : order.clients as { name: string } | null)?.name ?? "Client";
      const orderNumber = (order.order_number as string | null) ?? order_id.slice(0, 8).toUpperCase();
      const t = Array.isArray(order.tenants) ? order.tenants[0] : order.tenants as { name: string; brand_primary: string; support_email: string | null } | null;
      const tenant: TenantEmailCtx | undefined = t ? { name: t.name, brandColor: t.brand_primary, adminEmail: t.support_email } : undefined;
      const fn = approved ? sendClientApprovedFirstPiece : sendClientRequestedChanges;
      fn({ orderNumber, teamName, clientNote: note ?? null, tenant }).catch(() => {});
    }).catch(() => {});

    return NextResponse.json({ success: true });
  }

  // ── Client concept selection ───────────────────────────────────────────────
  if (action === "select_concept") {
    const { concept_id } = body as { action: string; concept_id: string };

    if (!concept_id) {
      return NextResponse.json({ error: "concept_id is required" }, { status: 400 });
    }

    // Verify the concept belongs to this order
    const { data: conceptRow } = await admin
      .from("concepts")
      .select("id")
      .eq("id", concept_id)
      .eq("order_id", order_id)
      .single();

    if (!conceptRow) return NextResponse.json({ error: "Concept not found" }, { status: 404 });

    const { error: clearError } = await admin
      .from("concepts")
      .update({ selected: false })
      .eq("order_id", order_id);

    if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 });

    const { error: selectError } = await admin
      .from("concepts")
      .update({ selected: true })
      .eq("id", concept_id);

    if (selectError) return NextResponse.json({ error: selectError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}

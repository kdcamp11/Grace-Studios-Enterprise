import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { order_id } = await req.json();
  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch everything needed
  const { data: order } = await supabase
    .from("orders")
    .select("id, stage, client_id, account_lead, order_number, estimated_delivery")
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

  const { data: brief } = await supabase
    .from("briefs")
    .select("ai_prompt, design_system, primary_colors, secondary_colors, gs_logo_placement, reference_image_url")
    .eq("order_id", order_id)
    .single();

  const { data: selectedConcept } = await supabase
    .from("concepts")
    .select("image_url, concept_number")
    .eq("order_id", order_id)
    .eq("selected", true)
    .single();

  const now = new Date().toISOString();
  const orderLabel = order.order_number ?? order_id.slice(0, 8).toUpperCase();

  // 1. Update order: stage → files_sent + approved_at
  const { error: updateError } = await supabase
    .from("orders")
    .update({ stage: "files_sent", approved_at: now })
    .eq("id", order_id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to update order", detail: updateError.message }, { status: 500 });
  }

  // 2. Insert stage_log
  const { data: logRow, error: logError } = await supabase
    .from("stage_log")
    .insert({
      order_id,
      from_stage: order.stage,
      to_stage: "files_sent",
      changed_by: "client",
      note: "Client approved design and sent to production.",
      email_sent: false,
    })
    .select("id")
    .single();

  if (logError) {
    return NextResponse.json({ error: "Failed to log stage change", detail: logError.message }, { status: 500 });
  }

  // 3. Fire emails via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supplierEmail = order.account_lead ?? process.env.GRACE_STUDIOS_EMAIL ?? "orders@gracestudios.com";
  const clientEmail = client?.email ?? "";
  const teamName = client?.name ?? "Client";

  let emailsSucceeded = false;

  try {
    await Promise.all([
      // Supplier / account lead notification
      resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Grace Athletics <noreply@graceathletics.com>",
        to: supplierEmail,
        subject: `New Order Approved — ${teamName} (${orderLabel})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f0f0f0; padding: 32px;">
            <h1 style="color: #C9A84C; font-size: 24px; margin-bottom: 8px;">Order Approved — Ready for Production</h1>
            <p style="color: #888; margin-bottom: 24px;">Order: ${orderLabel}</p>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px; width: 140px;">Team</td><td style="padding: 8px 0; font-size: 13px;">${teamName}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Sport</td><td style="padding: 8px 0; font-size: 13px;">${client?.sport ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">City</td><td style="padding: 8px 0; font-size: 13px;">${client?.city ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Design System</td><td style="padding: 8px 0; font-size: 13px; text-transform: capitalize;">${brief?.design_system ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Primary Colors</td><td style="padding: 8px 0; font-size: 13px;">${brief?.primary_colors ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Logo Placement</td><td style="padding: 8px 0; font-size: 13px;">${brief?.gs_logo_placement ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Approved At</td><td style="padding: 8px 0; font-size: 13px;">${new Date(now).toLocaleString()}</td></tr>
            </table>

            ${selectedConcept ? `<p style="margin-bottom: 8px; color: #888; font-size: 13px;">Approved Concept (${selectedConcept.concept_number}):</p><img src="${selectedConcept.image_url}" style="width: 100%; border-radius: 8px; margin-bottom: 24px;" />` : ""}

            ${brief?.ai_prompt ? `<div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 24px;"><p style="color: #C9A84C; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Design Description</p><p style="font-size: 13px; line-height: 1.6; margin: 0;">${brief.ai_prompt}</p></div>` : ""}
          </div>
        `,
      }),

      // Client confirmation
      resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Grace Athletics <noreply@graceathletics.com>",
        to: clientEmail,
        subject: `Your brief has been received — ${teamName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f0f0f0; padding: 32px;">
            <h1 style="color: #C9A84C; font-size: 24px; margin-bottom: 8px;">Design Approved</h1>
            <p style="color: #888; margin-bottom: 24px;">Order: ${orderLabel}</p>

            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
              Your design has been approved and sent to production. Your order is now in progress.
            </p>

            ${selectedConcept ? `<img src="${selectedConcept.image_url}" style="width: 100%; border-radius: 8px; margin-bottom: 24px;" />` : ""}

            <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #C9A84C; font-size: 12px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">What Happens Next</p>
              <p style="font-size: 13px; line-height: 1.6; margin: 0 0 8px;">Your Grace Studios account lead will be in touch with production timeline and estimated delivery.</p>
              <p style="font-size: 13px; color: #888; margin: 0;">Estimated delivery: 3–5 weeks from approval.</p>
            </div>

            <div style="background: #1a1a1a; border-radius: 8px; padding: 16px;">
              <p style="color: #C9A84C; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Revision Fee Notice</p>
              <p style="font-size: 12px; color: #888; margin: 0; line-height: 1.6;">
                Design changes after approval are subject to revision fees: Color change $25 · Logo change $75 · Layout change $150.
              </p>
            </div>
          </div>
        `,
      }),
    ]);

    emailsSucceeded = true;
  } catch (emailErr) {
    console.error("Email send failed:", emailErr);
    // Don't fail the approval — log it and move on
  }

  // 4. Update email_sent on stage_log
  if (emailsSucceeded && logRow) {
    await supabase
      .from("stage_log")
      .update({ email_sent: true })
      .eq("id", logRow.id);
  }

  return NextResponse.json({ status: "approved", order_id, emails_sent: emailsSucceeded });
}

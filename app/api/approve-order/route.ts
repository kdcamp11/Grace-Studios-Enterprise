import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { order_id } = await req.json();
  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  // Auth — same dual-method pattern (Bearer token first, then cookies)
  const admin = createAdminClient();
  let user: { id: string; email?: string | null } | null = null;

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    const { data } = await admin.auth.getUser(token);
    if (data.user) user = data.user;
  }
  if (!user) {
    const serverClient = createServerClient();
    const { data: { user: cookieUser } } = await serverClient.auth.getUser();
    user = cookieUser ?? null;
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the order exists (admins can approve any order; clients verified below)
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  if (!isAdmin) {
    // Find this user's client record (user_id → email fallback, with back-fill)
    let clientId: string | null = null;
    const { data: c1 } = await admin.from("clients").select("id").eq("user_id", user.id).single();
    if (c1) { clientId = c1.id; }
    if (!clientId && user.email) {
      const { data: c2 } = await admin.from("clients").select("id").eq("email", user.email.toLowerCase()).single();
      if (c2) {
        clientId = c2.id;
        await admin.from("clients").update({ user_id: user.id }).eq("id", c2.id).is("user_id", null);
      }
    }
    if (!clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: orderCheck } = await admin.from("orders").select("id").eq("id", order_id).eq("client_id", clientId).single();
    if (!orderCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = admin;

  // Fetch everything needed
  const { data: order } = await supabase
    .from("orders")
    .select("id, stage, client_id, account_lead, order_number, estimated_delivery, tenant_id")
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
    .select("ai_prompt, design_system, primary_colors, secondary_colors, logo_placement, reference_image_url")
    .eq("order_id", order_id)
    .single();

  const { data: selectedConcept } = await supabase
    .from("concepts")
    .select("image_url, concept_number")
    .eq("order_id", order_id)
    .eq("selected", true)
    .single();

  // Fetch tenant for branding + support email
  const { data: tenant } = await supabase
    .from("tenants")
    .select("name, support_email, brand_primary")
    .eq("id", order.tenant_id)
    .single();

  const now = new Date().toISOString();
  const orderLabel  = order.order_number ?? order_id.slice(0, 8).toUpperCase();
  const studioName  = tenant?.name ?? "Grace Studios";
  const accentColor = tenant?.brand_primary ?? "#C9A84C";

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
      tenant_id:  order.tenant_id,
      from_stage: order.stage,
      to_stage:   "files_sent",
      changed_by: "client",
      note:       "Client approved design and sent to production.",
      email_sent: false,
    })
    .select("id")
    .single();

  if (logError) {
    return NextResponse.json({ error: "Failed to log stage change", detail: logError.message }, { status: 500 });
  }

  // 3. Fire emails via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const supplierEmail = order.account_lead ?? tenant?.support_email ?? process.env.DEFAULT_ADMIN_EMAIL ?? "";
  const clientEmail   = client?.email ?? "";
  const teamName      = client?.name  ?? "Client";
  const emailFrom     = process.env.EMAIL_FROM ?? `${studioName} <noreply@graceathletics.com>`;

  let emailsSucceeded = false;

  try {
    await Promise.all([
      // Studio / account lead notification
      resend.emails.send({
        from:    emailFrom,
        to:      supplierEmail,
        subject: `New Order Approved — ${teamName} (${orderLabel})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f0f0f0; padding: 32px;">
            <h1 style="color: ${accentColor}; font-size: 24px; margin-bottom: 8px;">Order Approved — Ready for Production</h1>
            <p style="color: #888; margin-bottom: 24px;">Order: ${orderLabel}</p>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px; width: 140px;">Team</td><td style="padding: 8px 0; font-size: 13px;">${teamName}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Sport</td><td style="padding: 8px 0; font-size: 13px;">${client?.sport ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">City</td><td style="padding: 8px 0; font-size: 13px;">${client?.city ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Design System</td><td style="padding: 8px 0; font-size: 13px; text-transform: capitalize;">${brief?.design_system ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Primary Colors</td><td style="padding: 8px 0; font-size: 13px;">${brief?.primary_colors ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Logo Placement</td><td style="padding: 8px 0; font-size: 13px;">${brief?.logo_placement ?? "—"}</td></tr>
              <tr><td style="padding: 8px 0; color: #888; font-size: 13px;">Approved At</td><td style="padding: 8px 0; font-size: 13px;">${new Date(now).toLocaleString()}</td></tr>
            </table>

            ${selectedConcept ? `<p style="margin-bottom: 8px; color: #888; font-size: 13px;">Approved Concept (${selectedConcept.concept_number}):</p><img src="${selectedConcept.image_url}" style="width: 100%; border-radius: 8px; margin-bottom: 24px;" />` : ""}

            ${brief?.ai_prompt ? `<div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 24px;"><p style="color: ${accentColor}; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Design Description</p><p style="font-size: 13px; line-height: 1.6; margin: 0;">${brief.ai_prompt}</p></div>` : ""}
          </div>
        `,
      }),

      // Client confirmation
      resend.emails.send({
        from:    emailFrom,
        to:      clientEmail,
        subject: `Your design has been approved — ${teamName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f0f0f0; padding: 32px;">
            <h1 style="color: ${accentColor}; font-size: 24px; margin-bottom: 8px;">Design Approved</h1>
            <p style="color: #888; margin-bottom: 24px;">Order: ${orderLabel}</p>

            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
              Your design has been approved and sent to production. Your order is now in progress.
            </p>

            ${selectedConcept ? `<img src="${selectedConcept.image_url}" style="width: 100%; border-radius: 8px; margin-bottom: 24px;" />` : ""}

            <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="color: ${accentColor}; font-size: 12px; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 1px;">What Happens Next</p>
              <p style="font-size: 13px; line-height: 1.6; margin: 0 0 8px;">Your ${studioName} account lead will be in touch with production timeline and estimated delivery.</p>
              <p style="font-size: 13px; color: #888; margin: 0;">Estimated delivery: 3–5 weeks from approval.</p>
            </div>

            <div style="background: #1a1a1a; border-radius: 8px; padding: 16px;">
              <p style="color: ${accentColor}; font-size: 12px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Revision Fee Notice</p>
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
    // Non-fatal — approval already recorded
  }

  // 4. Update email_sent on stage_log
  if (emailsSucceeded && logRow) {
    await supabase
      .from("stage_log")
      .update({ email_sent: true })
      .eq("id", logRow.id);
  }

  // 5. Auto-generate production file (non-blocking — failure doesn't affect approval)
  let productionFileUrl: string | null = null;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const genRes  = await fetch(
      `${baseUrl}/api/orders/${order_id}/generate-production-file`,
      { method: "POST" },
    );
    if (genRes.ok) {
      const genData = await genRes.json() as { file_url?: string };
      productionFileUrl = genData.file_url ?? null;
    } else {
      console.error("[approve-order] Production file generation failed:", await genRes.text());
    }
  } catch (genErr) {
    console.error("[approve-order] Production file generation error:", genErr);
  }

  // 6. Advance stage: files_sent → first_piece_in_progress
  // Files are prepared automatically — move order into production immediately
  // so the client sees progress and the account lead knows to begin the first piece.
  const { error: advanceError } = await supabase
    .from("orders")
    .update({ stage: "first_piece_in_progress" })
    .eq("id", order_id);

  if (advanceError) {
    console.error("[approve-order] Stage advance failed:", advanceError.message);
    // Non-fatal — order is still approved at files_sent
  } else {
    await supabase.from("stage_log").insert({
      order_id,
      tenant_id:  order.tenant_id,
      from_stage: "files_sent",
      to_stage:   "first_piece_in_progress",
      changed_by: "system",
      note:       "Production files prepared — order advanced to first piece.",
      email_sent: false,
    });
  }

  return NextResponse.json({
    status: "approved",
    order_id,
    emails_sent:         emailsSucceeded,
    production_file_url: productionFileUrl,
  });
}

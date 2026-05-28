/**
 * POST /api/decline-concept
 * Body: { order_id, note?: string }
 *
 * Called when a client declines their concept and requests revisions.
 * - Resets order stage to design_confirmed (so regeneration can proceed)
 * - Logs the stage change
 * - Emails the account lead with the revision note
 */

import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { order_id, note } = await req.json() as { order_id?: string; note?: string };
  if (!order_id) return NextResponse.json({ error: "order_id required" }, { status: 400 });

  const admin = createAdminClient();

  // ── Auth: Bearer first, cookie fallback ──────────────────────────────────
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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Ownership check ──────────────────────────────────────────────────────
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  if (!isAdmin) {
    let clientId: string | null = null;
    const { data: c1 } = await admin.from("clients").select("id").eq("user_id", user.id).single();
    if (c1) clientId = c1.id;
    if (!clientId && user.email) {
      const { data: c2 } = await admin.from("clients").select("id").eq("email", user.email.toLowerCase()).single();
      if (c2) { clientId = c2.id; await admin.from("clients").update({ user_id: user.id }).eq("id", c2.id).is("user_id", null); }
    }
    if (!clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { data: orderCheck } = await admin.from("orders").select("id").eq("id", order_id).eq("client_id", clientId).single();
    if (!orderCheck) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ── Fetch order + client + tenant ────────────────────────────────────────
  const { data: order } = await admin
    .from("orders")
    .select("id, stage, client_id, account_lead, order_number, tenant_id")
    .eq("id", order_id)
    .single();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const [{ data: client }, { data: tenant }] = await Promise.all([
    admin.from("clients").select("name, email").eq("id", order.client_id).single(),
    admin.from("tenants").select("name, support_email, brand_primary").eq("id", order.tenant_id).single(),
  ]);

  const now        = new Date().toISOString();
  const orderLabel = order.order_number ?? order_id.slice(0, 8).toUpperCase();
  const studioName = tenant?.name ?? "Grace Studios";
  const accentColor = tenant?.brand_primary ?? "#C9A84C";
  const teamName   = client?.name ?? "Client";

  // ── Reset stage to creative_submitted so studio can revise + regenerate ──
  await admin.from("orders").update({ stage: "creative_submitted" }).eq("id", order_id);

  await admin.from("stage_log").insert({
    order_id,
    tenant_id:  order.tenant_id,
    from_stage: order.stage,
    to_stage:   "creative_submitted",
    changed_by: "client",
    note:       note ? `Client declined concept: ${note}` : "Client declined concept and requested revisions.",
    email_sent: false,
  });

  // ── Notify account lead ──────────────────────────────────────────────────
  let emailSent = false;
  try {
    const resend        = new Resend(process.env.RESEND_API_KEY);
    const supplierEmail = order.account_lead ?? tenant?.support_email ?? process.env.DEFAULT_ADMIN_EMAIL ?? "";
    const emailFrom     = process.env.EMAIL_FROM ?? `${studioName} <noreply@graceathletics.com>`;

    if (supplierEmail) {
      await resend.emails.send({
        from:    emailFrom,
        to:      supplierEmail,
        subject: `Concept Declined — ${teamName} (${orderLabel})`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #f0f0f0; padding: 32px;">
            <h1 style="color: ${accentColor}; font-size: 22px; margin-bottom: 8px;">Concept Declined — Revision Requested</h1>
            <p style="color: #888; margin-bottom: 24px;">Order: ${orderLabel} · ${teamName}</p>
            <p style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
              The client has reviewed their concept and requested revisions. The order has been reset to the design stage.
            </p>
            ${note ? `
            <div style="background: #1a1a1a; border-radius: 8px; padding: 16px; margin-bottom: 24px; border-left: 3px solid ${accentColor};">
              <p style="color: ${accentColor}; font-size: 11px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 1px;">Client Note</p>
              <p style="font-size: 14px; line-height: 1.6; margin: 0;">${note}</p>
            </div>` : ""}
            <p style="font-size: 13px; color: #888;">Declined at: ${new Date(now).toLocaleString()}</p>
          </div>
        `,
      });
      emailSent = true;
    }
  } catch (emailErr) {
    console.error("[decline-concept] Email error:", emailErr);
  }

  return NextResponse.json({ status: "declined", order_id, email_sent: emailSent });
}

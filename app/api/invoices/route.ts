import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";
import { getPaymentThresholdInfo, generateInvoiceNumber } from "@/lib/payments/thresholds";

/**
 * GET /api/invoices?order_id=xxx
 * Admins: all invoices for the order.
 * Clients: invoices for orders they own (verified via clients table).
 */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("order_id");
  if (!orderId) return NextResponse.json({ error: "order_id required" }, { status: 400 });

  const admin = createAdminClient();

  // Try admin auth first
  const ctx = await assertAdminTenant();
  if (!isErrorResponse(ctx)) {
    const { data: order } = await admin
      .from("orders")
      .select("id")
      .eq("id", orderId)
      .eq("tenant_id", ctx.tenant.id)
      .single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const { data: invoices } = await admin
      .from("invoices")
      .select("*, payments(*)")
      .eq("order_id", orderId)
      .eq("tenant_id", ctx.tenant.id)
      .order("created_at", { ascending: false });

    return NextResponse.json({ invoices: invoices ?? [] });
  }

  // Fall back to client auth with ownership check
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  // Verify the client owns this order (by user_id or email)
  const { data: orderRow } = await admin
    .from("orders")
    .select("id, client_id, clients(email, user_id)")
    .eq("id", orderId)
    .eq("tenant_id", tenant.id)
    .single();

  if (!orderRow) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const clientRaw = Array.isArray(orderRow.clients)
    ? orderRow.clients[0]
    : (orderRow.clients as { email: string; user_id: string | null } | null);

  const emailMatch  = (clientRaw?.email ?? "").toLowerCase() === (user.email ?? "").toLowerCase();
  const userIdMatch = clientRaw?.user_id != null && clientRaw.user_id === user.id;
  if (!emailMatch && !userIdMatch) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: invoices } = await admin
    .from("invoices")
    .select("*, payments(*)")
    .eq("order_id", orderId)
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ invoices: invoices ?? [] });
}

/**
 * POST /api/invoices
 * Admin-only: create an invoice for an order.
 */
export async function POST(req: NextRequest) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const body = await req.json().catch(() => ({})) as {
    order_id?: string;
    total_amount?: number;
    deposit_amount?: number;
    currency?: string;
    admin_notes?: string;
    bank_name?: string;
    bank_routing?: string;
    bank_account?: string;
    bank_swift?: string;
    bank_beneficiary?: string;
  };

  const { order_id, total_amount, deposit_amount = 0 } = body;
  if (!order_id || total_amount == null) {
    return NextResponse.json({ error: "order_id and total_amount are required" }, { status: 400 });
  }
  if (total_amount <= 0) {
    return NextResponse.json({ error: "total_amount must be greater than 0" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify order belongs to tenant
  const { data: order } = await admin
    .from("orders")
    .select("id")
    .eq("id", order_id)
    .eq("tenant_id", ctx.tenant.id)
    .single();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const threshold = getPaymentThresholdInfo(total_amount);
  const invoiceNumber = generateInvoiceNumber("INV");

  const { data: invoice, error } = await admin
    .from("invoices")
    .insert({
      tenant_id:                  ctx.tenant.id,
      order_id,
      invoice_number:             invoiceNumber,
      total_amount,
      deposit_amount,
      currency:                   body.currency ?? "usd",
      status:                     "sent",
      recommended_payment_method: threshold.recommended,
      payment_threshold_band:     threshold.band,
      card_enabled:               threshold.cardEnabled,
      admin_notes:                body.admin_notes ?? null,
      bank_name:                  body.bank_name ?? null,
      bank_routing:               body.bank_routing ?? null,
      bank_account:               body.bank_account ?? null,
      bank_swift:                 body.bank_swift ?? null,
      bank_beneficiary:           body.bank_beneficiary ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invoice }, { status: 201 });
}

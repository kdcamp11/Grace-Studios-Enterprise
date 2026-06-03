import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";
import { stripe } from "@/lib/payments/stripe";

/**
 * POST /api/invoices/[invoice_id]/checkout
 * Creates a Stripe Checkout Session for card payment.
 * Returns { url } — the client redirects to that URL.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { invoice_id: string } },
) {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const admin = createAdminClient();

  // Load invoice
  const { data: invoice } = await admin
    .from("invoices")
    .select("*, orders(client_id, clients(name, email))")
    .eq("id", params.invoice_id)
    .eq("tenant_id", tenant.id)
    .single();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (!invoice.card_enabled) {
    return NextResponse.json(
      { error: "Card payments are not available for this invoice. Please pay by bank transfer." },
      { status: 400 },
    );
  }
  if (invoice.status === "paid") {
    return NextResponse.json({ error: "Invoice is already paid" }, { status: 400 });
  }

  // Verify caller is the client (or admin)
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";

  if (!isAdmin) {
    const order = invoice.orders as { client_id: string; clients: { email: string } | { email: string }[] } | null;
    const clientEmail = order
      ? (Array.isArray(order.clients) ? order.clients[0] : order.clients as { email: string } | null)?.email
      : null;
    if (clientEmail?.toLowerCase() !== user.email?.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({})) as { pay_deposit?: boolean };
  const payDeposit = !!body.pay_deposit && invoice.deposit_amount > 0;
  const isPartiallyPaid = invoice.status === "partially_paid";

  // Guard: can't pay deposit again if it's already been paid
  if (isPartiallyPaid && payDeposit) {
    return NextResponse.json({ error: "Deposit has already been paid" }, { status: 400 });
  }

  // When deposit is already paid, charge only the remaining balance.
  // Otherwise: charge deposit (if selected) or full total.
  let amount: number;
  let lineItemName: string;
  if (isPartiallyPaid && invoice.deposit_amount > 0) {
    amount = invoice.total_amount - invoice.deposit_amount;
    lineItemName = `${tenant.name} — Balance ${invoice.invoice_number}`;
  } else if (payDeposit) {
    amount = invoice.deposit_amount;
    lineItemName = `${tenant.name} — Deposit ${invoice.invoice_number}`;
  } else {
    amount = invoice.total_amount;
    lineItemName = `${tenant.name} — Invoice ${invoice.invoice_number}`;
  }

  const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const appUrl = `${proto}://${host}`;
  // On success, redirect to order tracker (not the invoice page) so the
  // client lands on a meaningful status screen instead of a payment form.
  const successUrl = `${appUrl}/orders/${invoice.order_id}/tracker?payment=success`;
  const cancelUrl  = `${appUrl}/orders/${invoice.order_id}/invoice?payment=canceled`;

  const clientName = (() => {
    const order = invoice.orders as { clients: { name: string } | { name: string }[] } | null;
    if (!order) return "Client";
    const c = Array.isArray(order.clients) ? order.clients[0] : order.clients;
    return (c as { name: string } | null)?.name ?? "Client";
  })();

  const session = await stripe.checkout.sessions.create({
    mode:         "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency:     invoice.currency ?? "usd",
          unit_amount:  Math.round(amount * 100),
          product_data: {
            name:        lineItemName,
            description: `Order for ${clientName}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      invoice_id:  invoice.id,
      order_id:    invoice.order_id,
      tenant_id:   tenant.id,
      pay_deposit: payDeposit ? "true" : "false",
    },
    customer_email: user.email ?? undefined,
    success_url:    successUrl,
    cancel_url:     cancelUrl,
  });

  console.log(`[invoice checkout] created session ${session.id} for invoice ${invoice.id} order ${invoice.order_id} amount=${amount} status=${invoice.status}`);

  // Record a pending payment row so we can match the webhook
  await admin.from("payments").insert({
    tenant_id:                   tenant.id,
    invoice_id:                  invoice.id,
    order_id:                    invoice.order_id,
    method:                      "stripe",
    amount,
    status:                      "pending",
    stripe_checkout_session_id:  session.id,
  });

  return NextResponse.json({ url: session.url });
}


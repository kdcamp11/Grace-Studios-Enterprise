import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planForPriceId } from "@/lib/payments/plans";
import type Stripe from "stripe";

async function createConnectTransfer(
  tenantId: string,
  grossCents: number,
  paymentIntentId: string | null,
  admin: ReturnType<typeof createAdminClient>,
) {
  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_account_id, platform_fee_percent")
    .eq("id", tenantId)
    .single();

  if (!tenant?.stripe_account_id || !tenant.platform_fee_percent) return;

  // Verify account is ready to receive transfers
  let chargesEnabled = false;
  try {
    const account = await stripe.accounts.retrieve(tenant.stripe_account_id);
    chargesEnabled = account.charges_enabled;
  } catch {
    return;
  }
  if (!chargesEnabled) return;

  const feeAmount = Math.round(grossCents * (tenant.platform_fee_percent / 100));
  const netAmount = grossCents - feeAmount;
  if (netAmount <= 0) return;

  const transfer = await stripe.transfers.create({
    amount:      netAmount,
    currency:    "usd",
    destination: tenant.stripe_account_id,
    ...(paymentIntentId ? { source_transaction: paymentIntentId } : {}),
    metadata: { tenant_id: tenantId },
  });

  // Log the fee
  await admin.from("platform_fees").insert({
    tenant_id:         tenantId,
    gross_amount:      grossCents,
    fee_percent:       tenant.platform_fee_percent,
    fee_amount:        feeAmount,
    net_amount:        netAmount,
    stripe_transfer_id: transfer.id,
  });
}

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription") {
        await handleSubscriptionCheckoutCompleted(session);
      } else if (session.metadata?.payment_type === "design_deposit") {
        await handleDesignDepositCompleted(session);
      } else {
        await handleCheckoutCompleted(session);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionCheckoutCompleted(session: Stripe.Checkout.Session) {
  // The subscription upsert event will fire separately; just ensure customer_id is stored
  const tenantId = session.metadata?.tenant_id;
  if (!tenantId || !session.customer) return;

  const admin = createAdminClient();
  const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
  await admin
    .from("tenants")
    .update({ stripe_customer_id: customerId })
    .eq("id", tenantId);
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription) {
  const tenantId = sub.metadata?.tenant_id;
  if (!tenantId) return;

  const admin = createAdminClient();

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan = (priceId ? planForPriceId(priceId) : null) ?? sub.metadata?.plan ?? "starter";

  // MRR in cents: monthly-normalised recurring amount
  const item = sub.items.data[0];
  const unitAmount = item?.price?.unit_amount ?? 0;
  const interval = item?.price?.recurring?.interval;
  const mrr = interval === "year"
    ? Math.round(unitAmount / 12)
    : unitAmount;

  await admin.from("subscriptions").upsert(
    {
      tenant_id:              tenantId,
      plan,
      status:                 sub.status,
      stripe_subscription_id: sub.id,
      stripe_customer_id:     typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      current_period_start:   sub.items.data[0]?.current_period_start
        ? new Date(sub.items.data[0].current_period_start * 1000).toISOString()
        : null,
      current_period_end:     sub.items.data[0]?.current_period_end
        ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
        : null,
      trial_end:              sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      mrr,
      updated_at:             new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );

  // Keep tenants.plan in sync
  await admin.from("tenants").update({ plan }).eq("id", tenantId);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ status: "canceled", mrr: 0, updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", sub.id);

  const tenantId = sub.metadata?.tenant_id;
  if (tenantId) {
    await admin.from("tenants").update({ plan: "starter" }).eq("id", tenantId);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const subDetails = invoice.parent?.subscription_details;
  const subscriptionId = subDetails?.subscription;
  if (!subscriptionId) return;

  const subId = typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id;
  const admin = createAdminClient();

  // Mark subscription active in case it was past_due
  await admin
    .from("subscriptions")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subId);

  // Record platform fee if tenant has fee percent set
  const tenantId = (subDetails?.metadata as Record<string, string> | null)?.tenant_id
    ?? (invoice.metadata as Record<string, string> | null)?.tenant_id;
  if (!tenantId) return;

  const { data: tenant } = await admin
    .from("tenants")
    .select("platform_fee_percent")
    .eq("id", tenantId)
    .single();

  if (!tenant || !tenant.platform_fee_percent) return;

  const gross = invoice.amount_paid;
  const feeAmount = Math.round(gross * (tenant.platform_fee_percent / 100));

  await admin.from("platform_fees").insert({
    tenant_id:    tenantId,
    gross_amount: gross,
    fee_percent:  tenant.platform_fee_percent,
    fee_amount:   feeAmount,
    net_amount:   gross - feeAmount,
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionId) return;

  const subId = typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id;
  const admin = createAdminClient();
  await admin
    .from("subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subId);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const admin = createAdminClient();

  // Find the payment row by session id
  const { data: payment } = await admin
    .from("payments")
    .select("id, invoice_id, order_id, tenant_id, amount")
    .eq("stripe_checkout_session_id", session.id)
    .single();

  if (!payment) {
    console.error("[stripe webhook] no payment row found for session:", session.id);
    return;
  }

  // Mark payment as paid
  await admin
    .from("payments")
    .update({
      status:                   "paid",
      stripe_payment_intent_id: typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    })
    .eq("id", payment.id);

  // Recompute invoice status
  await refreshInvoiceStatus(payment.invoice_id, payment.order_id, admin);

  // Auto-transfer net to tenant's Connect account if configured
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;
  await createConnectTransfer(payment.tenant_id, Number(payment.amount), paymentIntentId, admin).catch(
    (err) => console.error("[stripe webhook] connect transfer failed:", err)
  );
}

async function refreshInvoiceStatus(
  invoiceId: string,
  orderId: string,
  admin: ReturnType<typeof createAdminClient>,
) {
  const { data: invoice } = await admin
    .from("invoices")
    .select("total_amount, deposit_amount, status")
    .eq("id", invoiceId)
    .single();
  if (!invoice) return;

  const { data: payments } = await admin
    .from("payments")
    .select("amount, status")
    .eq("invoice_id", invoiceId)
    .eq("status", "paid");

  const paid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0);

  let newStatus: string;
  if (paid >= invoice.total_amount) {
    newStatus = "paid";
  } else if (paid >= invoice.deposit_amount && invoice.deposit_amount > 0) {
    newStatus = "partially_paid";
  } else {
    newStatus = "pending_payment";
  }

  await admin.from("invoices").update({ status: newStatus }).eq("id", invoiceId);

  // If fully paid or deposit paid — allow production to proceed
  // We update the legacy deposit_paid / balance_paid flags on orders for compatibility
  if (newStatus === "paid") {
    await admin
      .from("orders")
      .update({ deposit_paid: true, balance_paid: true })
      .eq("id", orderId);
  } else if (newStatus === "partially_paid") {
    await admin
      .from("orders")
      .update({ deposit_paid: true })
      .eq("id", orderId);
  }
}

async function handleDesignDepositCompleted(session: Stripe.Checkout.Session) {
  const admin    = createAdminClient();
  const orderId  = session.metadata?.order_id;
  const tenantId = session.metadata?.tenant_id;

  if (!orderId) {
    console.error("[stripe webhook] design_deposit session missing order_id:", session.id);
    return;
  }

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  // Mark the order as design-fee paid
  await admin
    .from("orders")
    .update({ design_fee_paid: true })
    .eq("id", orderId);

  // Advance the creative lifecycle on payment. Guarded so production orders are
  // unaffected, and wrapped so a stage-advance failure never breaks the webhook.
  try {
    const { data: order } = await admin
      .from("orders")
      .select("stage, order_type, tenant_id")
      .eq("id", orderId)
      .single();

    if (order && order.order_type === "creative") {
      await admin
        .from("orders")
        .update({ stage: "creative_in_review" })
        .eq("id", orderId);

      await admin.from("stage_log").insert({
        order_id:   orderId,
        tenant_id:  order.tenant_id,
        from_stage: order.stage,
        to_stage:   "creative_in_review",
        changed_by: "system",
        note:       "Design activation paid",
      });
    }
  } catch (err) {
    console.error("[stripe webhook] creative stage advance failed:", err);
  }

  // Update our deposit session record
  await admin
    .from("design_deposit_sessions")
    .update({ status: "paid", stripe_payment_intent_id: paymentIntentId })
    .eq("stripe_checkout_session_id", session.id);

  // Auto-transfer net to tenant's Connect account if configured
  if (tenantId) {
    const grossCents = session.amount_total ?? 15000;
    await createConnectTransfer(tenantId, grossCents, paymentIntentId, admin).catch(
      (err) => console.error("[stripe webhook] design deposit connect transfer failed:", err),
    );
  }
}

// Export for reuse in admin route
export { refreshInvoiceStatus };

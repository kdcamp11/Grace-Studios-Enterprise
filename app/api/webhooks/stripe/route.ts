import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planForPriceId } from "@/lib/payments/plans";
import { createSupplierTransfer } from "@/lib/payments/supplier-transfer";
import { createDesignerTransfer } from "@/lib/payments/designer-transfer";
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
      } else if (session.metadata?.payment_type === "mockup_design_fee") {
        await handleMockupDesignFeeCompleted(session);
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
    case "account.updated":
      await handleConnectAccountUpdated(event.data.object as Stripe.Account);
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

  console.log(`[stripe webhook] handleCheckoutCompleted: session=${session.id}`);

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

  console.log(`[stripe webhook] matched payment: id=${payment.id} invoice=${payment.invoice_id} order=${payment.order_id} amount=${payment.amount}`);

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  // Mark payment as paid
  await admin
    .from("payments")
    .update({
      status:                   "paid",
      stripe_payment_intent_id: paymentIntentId,
    })
    .eq("id", payment.id);

  // Recompute invoice status and auto-advance order stage
  await refreshInvoiceStatus(payment.invoice_id, payment.order_id, admin);

  // Auto-transfer net to tenant's Connect account if configured
  await createConnectTransfer(payment.tenant_id, Number(payment.amount), paymentIntentId, admin).catch(
    (err) => console.error("[stripe webhook] connect transfer failed:", err)
  );

  // Automatically pay the supplier their 90% cut via Stripe Connect
  const isDeposit = session.metadata?.pay_deposit === "true";
  await createSupplierTransfer(payment.order_id, Number(payment.amount), paymentIntentId, isDeposit, admin).catch(
    (err) => console.error("[stripe webhook] supplier transfer failed:", err)
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

  const paymentType = paid >= invoice.total_amount ? "full" : paid >= invoice.deposit_amount ? "deposit" : "partial";
  console.log(`[stripe webhook] invoice ${invoiceId}: type=${paymentType} status=${invoice.status} → ${newStatus} (paid=${paid}, total=${invoice.total_amount}, deposit=${invoice.deposit_amount})`);

  const { error: invUpdateErr } = await admin.from("invoices").update({ status: newStatus }).eq("id", invoiceId);
  if (invUpdateErr) console.error("[stripe webhook] invoice update failed:", invUpdateErr);

  // Update payment flags on orders so milestone signals stay in sync
  if (newStatus === "paid") {
    const { error: ordUpdateErr } = await admin
      .from("orders")
      .update({ deposit_paid: true, balance_paid: true })
      .eq("id", orderId);
    if (ordUpdateErr) console.error("[stripe webhook] order payment flags update failed:", ordUpdateErr);
    else console.log(`[stripe webhook] order ${orderId}: deposit_paid=true balance_paid=true`);
  } else if (newStatus === "partially_paid") {
    const { error: ordUpdateErr } = await admin
      .from("orders")
      .update({ deposit_paid: true })
      .eq("id", orderId);
    if (ordUpdateErr) console.error("[stripe webhook] order deposit_paid update failed:", ordUpdateErr);
    else console.log(`[stripe webhook] order ${orderId}: deposit_paid=true`);
  }

  // Auto-advance order stage based on the payment milestone just reached.
  // This keeps the workflow stage in sync so all portals reflect the new phase
  // without requiring manual admin action.
  if (newStatus === "partially_paid" || newStatus === "paid") {
    const { data: ord } = await admin
      .from("orders")
      .select("stage, tenant_id")
      .eq("id", orderId)
      .single();

    if (ord) {
      let nextStage: string | null = null;
      let note = "";

      if (ord.stage === "production_files_prep") {
        // Deposit paid while prepping files — advance to sent_to_supplier so admin
        // can coordinate file handoff to the production partner.
        nextStage = "sent_to_supplier";
        note = newStatus === "partially_paid"
          ? "Production deposit paid — order sent to supplier"
          : "Full production payment received — order sent to supplier";
      } else if (ord.stage === "sent_to_supplier" || ord.stage === "files_sent") {
        // Payment confirmed after files were already sent — release to first piece.
        nextStage = "first_piece_in_progress";
        note = "Deposit confirmed — order released to first piece production";
      } else if (newStatus === "paid" && ord.stage === "qc_verified") {
        // Final balance payment at QC — release shipment
        nextStage = "shipped";
        note = "Final balance paid — order released for shipment";
      }

      if (nextStage) {
        console.log(`[stripe webhook] advancing order ${orderId}: stage ${ord.stage} → ${nextStage}`);
        const { error: stageErr } = await admin.from("orders").update({ stage: nextStage }).eq("id", orderId);
        if (stageErr) console.error("[stripe webhook] stage update failed:", stageErr);
        else console.log(`[stripe webhook] order ${orderId}: stage updated to ${nextStage}`);
        await admin.from("stage_log").insert({
          order_id:   orderId,
          tenant_id:  ord.tenant_id,
          from_stage: ord.stage,
          to_stage:   nextStage,
          changed_by: "system",
          note,
        }).catch((err) => console.error("[stripe webhook] stage_log insert failed:", err));
      }
    }
  }
}

async function handleMockupDesignFeeCompleted(session: Stripe.Checkout.Session) {
  const orderId  = session.metadata?.order_id;
  const tenantId = session.metadata?.tenant_id;
  if (!orderId) {
    console.error("[stripe webhook] mockup_design_fee: missing order_id");
    return;
  }

  const admin = createAdminClient();
  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  // Mark fee paid and advance stage
  await admin
    .from("orders")
    .update({ mockup_fee_paid: true, stage: "production_files_prep" })
    .eq("id", orderId);

  // Log stage transition
  await admin.from("stage_log").insert({
    order_id:   orderId,
    tenant_id:  tenantId ?? null,
    from_stage: "mockup_review",
    to_stage:   "production_files_prep",
    changed_by: "system",
    note:       "Mockup design fee paid — advancing to production files",
  }).catch(() => {});

  // Pay the designer 90%
  if (paymentIntentId) {
    const amountCents = session.amount_total ?? 0;
    await createDesignerTransfer(orderId, amountCents, paymentIntentId, admin).catch((err) =>
      console.error("[stripe webhook] designer transfer failed:", err)
    );
  }

  console.log(`[stripe webhook] mockup_design_fee completed: order=${orderId}`);
}

async function handleDesignDepositCompleted(session: Stripe.Checkout.Session) {
  const admin    = createAdminClient();
  const designId = session.metadata?.design_id;   // new design-keyed flow
  const orderId  = session.metadata?.order_id;    // legacy order-keyed flow
  const tenantId = session.metadata?.tenant_id;

  const paymentIntentId = typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent?.id ?? null;

  if (designId) {
    await handleDesignDepositFromDesign(session, designId, tenantId ?? null, paymentIntentId, admin);
  } else if (orderId) {
    await handleDesignDepositFromOrder(session, orderId, tenantId ?? null, paymentIntentId, admin);
  } else {
    console.error("[stripe webhook] design_deposit session missing both design_id and order_id:", session.id);
  }
}

async function handleDesignDepositFromDesign(
  session: Stripe.Checkout.Session,
  designId: string,
  tenantId: string | null,
  paymentIntentId: string | null,
  admin: ReturnType<typeof createAdminClient>,
) {
  // Load the design to get client_id, tenant_id, kind
  const { data: design } = await admin
    .from("designs")
    .select("tenant_id, client_id, kind")
    .eq("id", designId)
    .single();

  if (!design) {
    console.error("[stripe webhook] design not found for design_id:", designId);
    return;
  }

  const effectiveTenantId = tenantId ?? design.tenant_id;

  // Mint the order from the design
  // Upload-path orders skip the mockup phase entirely — the client's uploaded
  // file IS their design, so we start directly at production_files_prep.
  const isUploadPath = design.kind === "upload";
  const initialStage = isUploadPath ? "production_files_prep" : "creative_in_review";

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      tenant_id:       effectiveTenantId,
      client_id:       design.client_id,
      stage:           initialStage,
      design_fee_paid: true,
      concept_source:  design.kind === "upload" || design.kind === "builder"
                         ? "client_provided"
                         : null,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error("[stripe webhook] failed to mint order from design:", designId, orderError);
    return;
  }

  const orderId = order.id;

  // Stamp order_id on any briefs and concepts linked to this design
  await Promise.all([
    admin.from("briefs").update({ order_id: orderId }).eq("design_id", designId),
    admin.from("concepts").update({ order_id: orderId }).eq("design_id", designId),
  ]);

  // Record the conversion on the design itself
  await admin
    .from("designs")
    .update({ status: "converted", order_id: orderId })
    .eq("id", designId);

  // Stage log
  await admin.from("stage_log").insert({
    order_id:   orderId,
    tenant_id:  effectiveTenantId,
    from_stage: "onboarding",
    to_stage:   initialStage,
    changed_by: "system",
    note:       isUploadPath
      ? "Creative Activation paid — production file upload order starts at production_files_prep"
      : "Creative Activation paid — order minted from design",
  }).catch((err) => console.error("[stripe webhook] stage_log insert failed:", err));

  // Record the deposit session now that we have an order_id
  await admin.from("design_deposit_sessions").insert({
    tenant_id:                  effectiveTenantId,
    order_id:                   orderId,
    amount_cents:               session.amount_total ?? 14900,
    status:                     "paid",
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:   paymentIntentId,
  }).catch((err) => console.error("[stripe webhook] design_deposit_sessions insert failed:", err));

  // Auto-transfer net to tenant Connect account if configured
  const grossCents = session.amount_total ?? 14900;
  await createConnectTransfer(effectiveTenantId, grossCents, paymentIntentId, admin).catch(
    (err) => console.error("[stripe webhook] design deposit connect transfer failed:", err),
  );
}

async function handleDesignDepositFromOrder(
  session: Stripe.Checkout.Session,
  orderId: string,
  tenantId: string | null,
  paymentIntentId: string | null,
  admin: ReturnType<typeof createAdminClient>,
) {
  // Mark the order as design-fee paid
  await admin
    .from("orders")
    .update({ design_fee_paid: true })
    .eq("id", orderId);

  // Advance the creative lifecycle
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

  // Update the deposit session record
  await admin
    .from("design_deposit_sessions")
    .update({ status: "paid", stripe_payment_intent_id: paymentIntentId })
    .eq("stripe_checkout_session_id", session.id);

  // Auto-transfer net to tenant Connect account if configured
  const effectiveTenantId = tenantId ?? "";
  if (effectiveTenantId) {
    const grossCents = session.amount_total ?? 14900;
    await createConnectTransfer(effectiveTenantId, grossCents, paymentIntentId, admin).catch(
      (err) => console.error("[stripe webhook] design deposit connect transfer failed:", err),
    );
  }
}

async function handleConnectAccountUpdated(account: Stripe.Account) {
  if (!account.charges_enabled) return;

  const admin = createAdminClient();
  await admin
    .from("profiles")
    .update({ stripe_account_onboarded: true })
    .eq("stripe_account_id", account.id);

  console.log(`[stripe webhook] supplier account onboarded: ${account.id}`);
}

// Export for reuse in admin route
export { refreshInvoiceStatus };

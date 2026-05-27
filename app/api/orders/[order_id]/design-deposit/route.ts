import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";
import { rateLimit } from "@/lib/rate-limit";

// Project activation amount in cents ($100.00)
const DESIGN_DEPOSIT_CENTS = 10000;

/**
 * POST /api/orders/[order_id]/design-deposit
 *
 * Creates a Stripe Checkout Session for the $150 design deposit.
 * On success, the Stripe webhook sets orders.design_fee_paid = true
 * and records the session in design_deposit_sessions.
 *
 * Returns { url } — client-side redirect to Stripe Checkout.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const limited = rateLimit(req, { limit: 5, windowMs: 60 * 1000 });
  if (limited) return limited;

  const ctx = await assertClientOrder(params.order_id);
  if (isErrorResponse(ctx)) return ctx;

  const { orderId, tenantId } = ctx;

  try {
    const tenant = await getRequestTenant();
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

    const admin = createAdminClient();

    // Check if already paid
    const { data: order } = await admin
      .from("orders")
      .select("design_fee_paid, concept_source, order_number")
      .eq("id", orderId)
      .single();

    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.design_fee_paid) {
      return NextResponse.json({ error: "Design deposit already paid" }, { status: 400 });
    }

    // Check for an existing pending session to avoid duplicates
    const { data: existingSession } = await admin
      .from("design_deposit_sessions")
      .select("stripe_checkout_session_id")
      .eq("order_id", orderId)
      .eq("status", "pending")
      .single();

    if (existingSession?.stripe_checkout_session_id) {
      // Retrieve the session to check if it's still valid
      try {
        const session = await stripe.checkout.sessions.retrieve(
          existingSession.stripe_checkout_session_id,
        );
        if (session.status === "open") {
          return NextResponse.json({ url: session.url });
        }
      } catch {
        // Session expired — fall through to create a new one
      }
    }

    const isClientProvided = order.concept_source === "client_provided";
    const productName = `${tenant.name} — Project Activation`;
    const description = "Applied toward your final order total";

    const appUrl = new URL(req.url).origin;
    const successUrl = isClientProvided
      ? `${appUrl}/orders/${orderId}/tracker?deposit=success`
      : `${appUrl}/orders/${orderId}/concepts?unlocked=1`;
    const cancelUrl = `${appUrl}/orders/${orderId}/checkout`;

    const session = await stripe.checkout.sessions.create({
      mode:                 "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency:     "usd",
            unit_amount:  DESIGN_DEPOSIT_CENTS,
            product_data: {
              name:        productName,
              description,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        payment_type:   "design_deposit",
        order_id:       orderId,
        tenant_id:      tenantId,
        concept_source: order.concept_source ?? "ai",
      },
      customer_email: ctx.email,
      success_url:    successUrl,
      cancel_url:     cancelUrl,
      billing_address_collection: "required",
    });

    // Record the session in our DB for webhook matching + status tracking
    await admin.from("design_deposit_sessions").upsert(
      {
        tenant_id:                  tenantId,
        order_id:                   orderId,
        amount_cents:               DESIGN_DEPOSIT_CENTS,
        status:                     "pending",
        stripe_checkout_session_id: session.id,
      },
      { onConflict: "stripe_checkout_session_id" },
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[design-deposit] unhandled error:", err);
    return NextResponse.json({ error: "Unable to start checkout. Please try again." }, { status: 500 });
  }
}

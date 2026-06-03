import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { stripe } from "@/lib/payments/stripe";
import { resolveTenant } from "@/lib/tenant/resolve";
import { rateLimit } from "@/lib/rate-limit";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";
import { isTestBypassEmail, bypassMockupFee } from "@/lib/payments/test-bypass";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/orders/[order_id]/mockup-checkout
 *
 * Creates a Stripe Checkout Session for the mockup design fee.
 * On successful payment, the order advances to production_files_prep.
 * Grace Studios keeps 10%; the designer receives 90% via Stripe Connect.
 *
 * Stripe metadata: { payment_type: "mockup_design_fee", order_id, tenant_id }
 * Success URL: /orders/[order_id]/tracker?mockup_fee=paid
 * Cancel URL:  /orders/[order_id]/tracker
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const limited = rateLimit(req, { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll() {},
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ownershipResult = await assertClientOrder(params.order_id);
  if (isErrorResponse(ownershipResult)) return ownershipResult;

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, tenant_id, mockup_fee_paid, stage")
    .eq("id", params.order_id)
    .single();

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if ((order as { mockup_fee_paid?: boolean }).mockup_fee_paid) {
    return NextResponse.json({ error: "Design fee already paid" }, { status: 400 });
  }

  const proto  = req.headers.get("x-forwarded-proto") ?? "https";
  const host   = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const appUrl = `${proto}://${host}`;

  const hostname =
    req.headers.get("x-hostname") ??
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "localhost:3000";

  const tenant = await resolveTenant(hostname);
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
  }

  const feeCents = Math.round((tenant.design_fee ?? 0) * 100);

  // ── Test bypass — skip Stripe for approved test accounts ─────────────────
  if (isTestBypassEmail(user.email)) {
    const redirectUrl = await bypassMockupFee(params.order_id, appUrl);
    return NextResponse.json({ url: redirectUrl });
  }

  // ── Zero fee bypass ───────────────────────────────────────────────────────
  if (feeCents === 0) {
    const redirectUrl = await bypassMockupFee(params.order_id, appUrl);
    return NextResponse.json({ url: redirectUrl });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Payments are not yet configured. STRIPE_SECRET_KEY is missing." },
      { status: 503 },
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode:                 "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency:     "usd",
            unit_amount:  feeCents,
            product_data: {
              name:        `${tenant.name} — Design Fee`,
              description: "Design services for your approved mockup",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        payment_type: "mockup_design_fee",
        order_id:     params.order_id,
        tenant_id:    order.tenant_id,
      },
      customer_email:             user.email,
      success_url:                `${appUrl}/orders/${params.order_id}/tracker?mockup_fee=paid`,
      cancel_url:                 `${appUrl}/orders/${params.order_id}/tracker`,
      billing_address_collection: "required",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[orders/mockup-checkout] unhandled error:", err);
    return NextResponse.json({ error: "Unable to start checkout. Please try again." }, { status: 500 });
  }
}

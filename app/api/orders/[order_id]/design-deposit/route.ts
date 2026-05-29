import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTenant } from "@/lib/tenant/resolve";
import { rateLimit } from "@/lib/rate-limit";

// Creative Activation amount in cents ($149.00)
const DESIGN_DEPOSIT_CENTS = 14_900;

/**
 * POST /api/orders/[order_id]/design-deposit
 *
 * Creates a Stripe Checkout Session for the $149 Creative Activation fee.
 * On success, the Stripe webhook sets orders.design_fee_paid = true
 * and records the session in design_deposit_sessions.
 *
 * Returns { url } — client redirects to Stripe Checkout.
 *
 * NOTE: Auth and tenant are resolved directly from `req` (cookies + headers)
 * instead of using next/headers helpers. This avoids a Next.js 14 / Sentry
 * build-time issue where those helpers compile to a bare `request` variable
 * reference that is not in scope inside a route handler.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const limited = rateLimit(req, { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  // ── Auth — read session cookies directly from req (no next/headers) ───────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          // Route handlers are read-only for cookies — no-op is fine
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Verify ownership ──────────────────────────────────────────────────────
  const admin = createAdminClient();

  const { data: orderData } = await admin
    .from("orders")
    .select(
      "id, client_id, tenant_id, concept_source, design_fee_paid, order_number, clients(email, user_id)",
    )
    .eq("id", params.order_id)
    .single();

  if (!orderData) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const clientRaw = Array.isArray(orderData.clients)
    ? orderData.clients[0]
    : (orderData.clients as { email: string; user_id: string | null } | null);

  const emailMatch =
    (clientRaw?.email ?? "").toLowerCase() === user.email.toLowerCase();
  const userIdMatch =
    clientRaw?.user_id != null && clientRaw.user_id === user.id;

  if (!emailMatch && !userIdMatch) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // ── Tenant — resolve from request headers directly (no next/headers) ─────
    const hostname =
      req.headers.get("x-hostname") ??
      req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      "localhost:3000";

    const tenant = await resolveTenant(hostname);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
    }

    if (orderData.design_fee_paid) {
      return NextResponse.json(
        { error: "Design deposit already paid" },
        { status: 400 },
      );
    }

    // ── Reuse an existing open Stripe session if one exists ───────────────────
    const { data: existingSession } = await admin
      .from("design_deposit_sessions")
      .select("stripe_checkout_session_id")
      .eq("order_id", params.order_id)
      .eq("status", "pending")
      .single();

    if (existingSession?.stripe_checkout_session_id) {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          existingSession.stripe_checkout_session_id,
        );
        if (session.status === "open") {
          return NextResponse.json({ url: session.url });
        }
      } catch {
        // Session expired or invalid — fall through to create a new one
      }
    }

    // ── Build Stripe Checkout Session ─────────────────────────────────────────
    const isClientProvided = orderData.concept_source === "client_provided";
    const productName = `${tenant.name} — Creative Activation`;
    const description = "Applied toward your final order total";

    const host =
      req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      "localhost:3000";
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const appUrl = `${proto}://${host}`;

    const successUrl = isClientProvided
      ? `${appUrl}/orders/${params.order_id}/tracker?deposit=success`
      : `${appUrl}/orders/${params.order_id}/concepts?unlocked=1`;
    const cancelUrl = `${appUrl}/orders/${params.order_id}/checkout`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: DESIGN_DEPOSIT_CENTS,
            product_data: { name: productName, description },
          },
          quantity: 1,
        },
      ],
      metadata: {
        payment_type: "design_deposit",
        order_id: params.order_id,
        tenant_id: orderData.tenant_id,
        concept_source: orderData.concept_source ?? "ai",
      },
      customer_email: user.email,
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: "required",
    });

    // ── Record session in DB for webhook matching ─────────────────────────────
    await admin.from("design_deposit_sessions").upsert(
      {
        tenant_id: orderData.tenant_id,
        order_id: params.order_id,
        amount_cents: DESIGN_DEPOSIT_CENTS,
        status: "pending",
        stripe_checkout_session_id: session.id,
      },
      { onConflict: "stripe_checkout_session_id" },
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[design-deposit] unhandled error:", err);
    return NextResponse.json(
      { error: "Unable to start checkout. Please try again." },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { stripe } from "@/lib/payments/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTenant } from "@/lib/tenant/resolve";
import { rateLimit } from "@/lib/rate-limit";

// Creative Activation — $149.00
const DESIGN_DEPOSIT_CENTS = 14_900;

/**
 * POST /api/designs/[design_id]/design-deposit
 *
 * Creates a Stripe Checkout Session for the $149 Creative Activation fee,
 * keyed by a design (pre-payment). No order exists yet — the Stripe webhook
 * mints the order from the design on successful payment.
 *
 * Stripe metadata: { payment_type: "design_deposit", design_id, tenant_id, kind }
 * Success URL: /designs/[design_id]/activated  (polls until order is minted)
 * Cancel URL:  /designs/[design_id]/checkout
 *
 * Auth: resolved from session cookies (same as existing order-keyed route).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { design_id: string } },
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

  const admin = createAdminClient();

  // Verify ownership
  const { data: design } = await admin
    .from("designs")
    .select("id, client_id, tenant_id, kind, status, clients(email, user_id)")
    .eq("id", params.design_id)
    .single();

  if (!design) {
    return NextResponse.json({ error: "Design not found" }, { status: 404 });
  }

  const clientRaw = Array.isArray(design.clients)
    ? design.clients[0]
    : (design.clients as { email: string; user_id: string | null } | null);

  const emailMatch  = (clientRaw?.email ?? "").toLowerCase() === user.email.toLowerCase();
  const userIdMatch = clientRaw?.user_id != null && clientRaw.user_id === user.id;
  if (!emailMatch && !userIdMatch) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (design.status === "converted") {
    return NextResponse.json({ error: "Design already activated" }, { status: 400 });
  }

  try {
    const hostname =
      req.headers.get("x-hostname") ??
      req.headers.get("x-forwarded-host") ??
      req.headers.get("host") ??
      "localhost:3000";

    const tenant = await resolveTenant(hostname);
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 400 });
    }

    const proto  = req.headers.get("x-forwarded-proto") ?? "https";
    const host   = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
    const appUrl = `${proto}://${host}`;

    const session = await stripe.checkout.sessions.create({
      mode:                 "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency:     "usd",
            unit_amount:  DESIGN_DEPOSIT_CENTS,
            product_data: {
              name:        `${tenant.name} — Creative Activation`,
              description: "Applied toward your final order total",
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        payment_type: "design_deposit",
        design_id:    params.design_id,
        tenant_id:    design.tenant_id,
        kind:         design.kind,
      },
      customer_email:              user.email,
      success_url:                 `${appUrl}/designs/${params.design_id}/activated`,
      cancel_url:                  `${appUrl}/designs/${params.design_id}/checkout`,
      billing_address_collection:  "required",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[designs/design-deposit] unhandled error:", err);
    return NextResponse.json({ error: "Unable to start checkout. Please try again." }, { status: 500 });
  }
}

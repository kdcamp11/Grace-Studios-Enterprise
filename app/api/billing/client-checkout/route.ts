/**
 * POST /api/billing/client-checkout
 * Creates a Stripe Checkout session for a client AI plan upgrade.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/payments/stripe";
import { CLIENT_PLANS, type ClientAiPlan } from "@/lib/payments/client-plans";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const { plan } = await req.json() as { plan: ClientAiPlan };
  const planConfig = CLIENT_PLANS[plan];
  if (!planConfig) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  if (!planConfig.stripePriceId) return NextResponse.json({ error: "No Stripe price for this plan" }, { status: 400 });

  const admin = createAdminClient();

  // Find client row — try user_id first, then email
  let { data: client } = await admin
    .from("clients")
    .select("id, name, email, stripe_customer_id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .single();

  if (!client && user.email) {
    const { data: byEmail } = await admin
      .from("clients")
      .select("id, name, email, stripe_customer_id")
      .eq("tenant_id", tenant.id)
      .eq("email", user.email.toLowerCase())
      .single();
    client = byEmail ?? null;
  }

  if (!client) return NextResponse.json({ error: "No client profile found. Submit a brief first." }, { status: 404 });

  // Ensure Stripe customer exists for this client
  let customerId = client.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: client.email ?? user.email ?? undefined,
      name:  client.name ?? undefined,
      metadata: { client_id: client.id, tenant_id: tenant.id },
    });
    customerId = customer.id;
    await admin
      .from("clients")
      .update({ stripe_customer_id: customerId })
      .eq("id", client.id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer:   customerId,
    mode:       "subscription",
    line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1&plan=${plan}`,
    cancel_url:  `${appUrl}/billing?canceled=1`,
    metadata:    { client_id: client.id, tenant_id: tenant.id, plan },
    subscription_data: {
      metadata: { client_id: client.id, tenant_id: tenant.id, plan },
    },
  });

  return NextResponse.json({ url: session.url });
}

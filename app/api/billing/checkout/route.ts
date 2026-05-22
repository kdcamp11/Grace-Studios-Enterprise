import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/payments/stripe";
import { PLANS } from "@/lib/payments/plans";
import type { TenantPlan } from "@/lib/supabase/types";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { plan } = await req.json() as { plan: TenantPlan };
  const planConfig = PLANS[plan];

  if (!planConfig?.stripePriceId) {
    return NextResponse.json({ error: "No Stripe price configured for this plan" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("name, owner_email, stripe_customer_id")
    .eq("id", profile.tenant_id)
    .single();

  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

  // Ensure Stripe customer exists
  let customerId = tenant.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant.owner_email,
      name: tenant.name,
      metadata: { tenant_id: profile.tenant_id },
    });
    customerId = customer.id;
    await admin
      .from("tenants")
      .update({ stripe_customer_id: customerId })
      .eq("id", profile.tenant_id);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: planConfig.stripePriceId, quantity: 1 }],
    success_url: `${appUrl}/admin/billing?success=1`,
    cancel_url:  `${appUrl}/admin/billing?canceled=1`,
    metadata: { tenant_id: profile.tenant_id, plan },
    subscription_data: {
      metadata: { tenant_id: profile.tenant_id, plan },
      trial_period_days: plan === "pro" ? 14 : undefined,
    },
  });

  return NextResponse.json({ url: session.url });
}

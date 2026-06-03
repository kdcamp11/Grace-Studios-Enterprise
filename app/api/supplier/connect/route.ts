/**
 * POST /api/supplier/connect
 * Creates or retrieves the supplier's Stripe Express account and returns a
 * one-time onboarding URL. The supplier is redirected there to complete
 * Stripe's hosted onboarding flow.
 *
 * After onboarding, Stripe fires account.updated → the webhook sets
 * profiles.stripe_account_onboarded = true.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/payments/stripe";

export async function POST(req: NextRequest) {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, email, full_name, company, stripe_account_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "supplier") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const host  = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const appUrl = `${proto}://${host}`;

  let accountId = (profile as { stripe_account_id?: string | null }).stripe_account_id ?? null;

  // Create a new Express account if the supplier doesn't have one yet
  if (!accountId) {
    const account = await stripe.accounts.create({
      type:  "express",
      email: profile.email,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        supplier_user_id: profile.id,
        name: profile.company ?? profile.full_name ?? "",
      },
    });
    accountId = account.id;

    await admin
      .from("profiles")
      .update({ stripe_account_id: accountId, stripe_account_onboarded: false })
      .eq("id", profile.id);
  }

  // Generate a fresh onboarding / re-onboarding link
  const accountLink = await stripe.accountLinks.create({
    account:     accountId,
    refresh_url: `${appUrl}/supplier/settings?connect=refresh`,
    return_url:  `${appUrl}/supplier/settings?connect=success`,
    type:        "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/payments/stripe";

export async function GET() {
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

  const admin = createAdminClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("stripe_account_id, platform_fee_percent")
    .eq("id", profile.tenant_id)
    .single();

  if (!tenant?.stripe_account_id) {
    return NextResponse.json({ connected: false });
  }

  try {
    const account = await stripe.accounts.retrieve(tenant.stripe_account_id);
    return NextResponse.json({
      connected:         true,
      account_id:        account.id,
      charges_enabled:   account.charges_enabled,
      payouts_enabled:   account.payouts_enabled,
      details_submitted: account.details_submitted,
      platform_fee_percent: tenant.platform_fee_percent,
    });
  } catch {
    // Account may have been deleted on Stripe side
    return NextResponse.json({ connected: false, stale: true });
  }
}

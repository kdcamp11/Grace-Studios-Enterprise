import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/payments/stripe";

export async function POST() {
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
    .select("stripe_account_id")
    .eq("id", profile.tenant_id)
    .single();

  if (!tenant?.stripe_account_id) {
    return NextResponse.json({ error: "No connected Stripe account" }, { status: 400 });
  }

  const loginLink = await stripe.accounts.createLoginLink(tenant.stripe_account_id);
  return NextResponse.json({ url: loginLink.url });
}

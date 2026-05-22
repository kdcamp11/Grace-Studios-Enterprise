import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLANS } from "@/lib/payments/plans";
import type { TenantPlan } from "@/lib/supabase/types";

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

  const [subRes, tenantRes] = await Promise.all([
    admin
      .from("subscriptions")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("tenants")
      .select("plan, platform_fee_percent")
      .eq("id", profile.tenant_id)
      .single(),
  ]);

  const plan: TenantPlan = tenantRes.data?.plan ?? "starter";

  return NextResponse.json({
    subscription: subRes.data ?? null,
    plan,
    planConfig: PLANS[plan],
    platform_fee_percent: tenantRes.data?.platform_fee_percent ?? 0,
  });
}

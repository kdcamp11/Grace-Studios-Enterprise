/**
 * GET /api/billing/client-subscription
 * Returns the current AI plan for the authenticated client.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";
import { CLIENT_PLANS, type ClientAiPlan } from "@/lib/payments/client-plans";

export async function GET() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ plan: "starter", runsIncluded: 3 });

  const admin = createAdminClient();

  let { data: client } = await admin
    .from("clients")
    .select("id, ai_plan, ai_plan_status, ai_runs_included")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .single();

  if (!client && user.email) {
    const { data: byEmail } = await admin
      .from("clients")
      .select("id, ai_plan, ai_plan_status, ai_runs_included")
      .eq("tenant_id", tenant.id)
      .eq("email", user.email.toLowerCase())
      .single();
    client = byEmail ?? null;
  }

  const planId  = (client?.ai_plan ?? "starter") as ClientAiPlan;
  const planCfg = CLIENT_PLANS[planId] ?? CLIENT_PLANS.starter;

  return NextResponse.json({
    plan:         planId,
    planConfig:   planCfg,
    status:       client?.ai_plan_status ?? "active",
    runsIncluded: planCfg.runsIncluded,
  });
}

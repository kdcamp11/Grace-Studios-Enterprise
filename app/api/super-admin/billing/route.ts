import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/super-admin";

async function assertSuperAdmin() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isSuperAdmin(user.email)) return null;
  return user;
}

export async function GET(_req: NextRequest) {
  const user = await assertSuperAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();

  const [subsRes, feesRes, tenantsRes] = await Promise.all([
    admin
      .from("subscriptions")
      .select("*, tenants(name, slug, brand_primary)")
      .order("created_at", { ascending: false }),
    admin
      .from("platform_fees")
      .select("fee_amount, created_at")
      .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
    admin.from("tenants").select("id, name, plan, active"),
  ]);

  const subs = subsRes.data ?? [];

  const totalMrr     = subs.filter((s) => ["active","trialing"].includes(s.status)).reduce((n, s) => n + (s.mrr ?? 0), 0);
  const activeSubs   = subs.filter((s) => s.status === "active").length;
  const trialingSubs = subs.filter((s) => s.status === "trialing").length;
  const pastDueSubs  = subs.filter((s) => s.status === "past_due").length;
  const fees30d      = (feesRes.data ?? []).reduce((n, f) => n + (f.fee_amount ?? 0), 0);

  return NextResponse.json({
    summary: { totalMrr, activeSubs, trialingSubs, pastDueSubs, fees30d },
    subscriptions: subs,
    tenants: tenantsRes.data ?? [],
  });
}

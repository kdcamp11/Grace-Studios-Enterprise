import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import type { OrderStage } from "@/types/database";

const ACTIVE_STAGES: OrderStage[] = [
  "files_sent",
  "first_piece_in_progress",
  "first_piece_review",
  "bulk_production",
  "qc_verified",
];

export interface SupplierWithPortfolio {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  created_at: string;
  order_count: number;
  active_count: number;
  portfolio: { id: string; image_url: string; sport: string | null; caption: string | null }[];
}

export async function GET() {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  // All supplier profiles for this tenant
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name, company, created_at")
    .eq("role", "supplier")
    .eq("tenant_id", ctx.tenant.id)
    .order("created_at", { ascending: false });

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ suppliers: [] });
  }

  const ids = profiles.map((p) => p.id);

  // Order counts + portfolio in parallel
  const [{ data: orders }, { data: portfolioItems }] = await Promise.all([
    admin
      .from("orders")
      .select("stage, supplier_user_id")
      .in("supplier_user_id", ids)
      .eq("tenant_id", ctx.tenant.id),
    admin
      .from("supplier_portfolio")
      .select("id, user_id, image_url, sport, caption")
      .in("user_id", ids)
      .eq("tenant_id", ctx.tenant.id)
      .order("created_at", { ascending: false }),
  ]);

  const countMap: Record<string, { total: number; active: number }> = {};
  for (const o of orders ?? []) {
    if (!o.supplier_user_id) continue;
    if (!countMap[o.supplier_user_id]) countMap[o.supplier_user_id] = { total: 0, active: 0 };
    countMap[o.supplier_user_id].total += 1;
    if (ACTIVE_STAGES.includes(o.stage as OrderStage)) countMap[o.supplier_user_id].active += 1;
  }

  const portfolioMap: Record<string, SupplierWithPortfolio["portfolio"]> = {};
  for (const p of portfolioItems ?? []) {
    if (!portfolioMap[p.user_id]) portfolioMap[p.user_id] = [];
    portfolioMap[p.user_id].push({ id: p.id, image_url: p.image_url, sport: p.sport, caption: p.caption });
  }

  const suppliers: SupplierWithPortfolio[] = profiles.map((p) => ({
    ...p,
    order_count:  countMap[p.id]?.total  ?? 0,
    active_count: countMap[p.id]?.active ?? 0,
    portfolio:    portfolioMap[p.id]     ?? [],
  }));

  return NextResponse.json({ suppliers });
}

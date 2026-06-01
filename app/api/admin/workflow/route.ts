import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import type { ProductionPricingTier } from "@/lib/payments/supplier-pricing";

/**
 * Maps the raw DB `orders.stage` value directly to an admin board column key.
 * This is the SINGLE source of truth for admin board placement — the column an
 * order appears in is always determined by its actual stage in the database, not
 * by inferred conditions (supplier assignment, payment status, media counts, etc.).
 *
 * Previously this used `resolveTimeline()` which could advance an order into
 * "First Piece Review" or later columns because first_piece_media rows,
 * supplier assignment, or deposit payments existed — even when the DB stage
 * was still `mockup_in_progress`. That made the admin board diverge from the
 * client tracker, which correctly gates progress on actual completed work.
 */
function stageToPhase(stage: string): string {
  const map: Record<string, string> = {
    "mockup_in_progress":      "mockup_in_progress",
    "mockup_review":           "mockup_review",
    "mockup_revision":         "mockup_review",
    "production_files_prep":   "production_files",
    "sent_to_supplier":        "production_files",
    "files_sent":              "production_files",
    "first_piece_in_progress": "first_piece_in_production",
    "first_piece_revision":    "first_piece_in_production",
    "first_piece_review":      "first_piece_review",
    "bulk_production":         "bulk_production",
    "qc_verified":             "quality_check",
    "shipped":                 "shipped",
    "delivered":               "delivered",
    "complete":                "delivered",
  };
  return map[stage] ?? "mockup_in_progress";
}

// All production stages — includes legacy (files_sent, first_piece_in_progress)
// so pre-025 orders still surface in the correct column.
const WORKFLOW_STAGES = [
  "mockup_in_progress", "mockup_review", "mockup_revision",
  "production_files_prep", "sent_to_supplier", "files_sent",
  "first_piece_in_progress", "first_piece_revision",
  "first_piece_review", "bulk_production", "qc_verified",
  "shipped", "delivered", "complete",
] as const;

export interface WorkflowOrder {
  id:                   string;
  order_number:         string | null;
  stage:                string;
  /** Derived lifecycle phase — the SINGLE source of truth for board placement. */
  phase:                string;
  created_at:           string;
  estimated_delivery:   string | null;
  tracking_number:      string | null;
  deposit_paid:         boolean;
  balance_paid:         boolean;
  production_choice:    string | null;
  on_hold:              boolean;
  mockup_revision_used:       boolean;
  first_piece_revision_used:  boolean;
  notes:                string | null;
  client:           { name: string; sport: string | null };
  assigned_designer: { id: string; full_name: string | null; email: string } | null;
  supplier_profile:  { id: string; full_name: string | null; company: string | null } | null;
  /** Whether the preferred supplier has been auto-assigned to this order */
  preferred_supplier_assigned: boolean;
  invoice_status:       string | null;
  mockup_count:         number;
  production_files_count: number;
  first_piece_media: {
    total:         number;
    pending_admin: number; // supplier uploaded, awaiting GE internal review
    client_approved: number;
  };
  /** Production pricing (migration 027, graceful null if not yet set) */
  production_pricing_tier:   ProductionPricingTier | null;
  quantity:                  number | null;
  production_total_cents:    number | null;
  production_deposit_cents:  number | null;
  production_balance_cents:  number | null;
}

export async function GET() {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  // ── 0. Preferred supplier from tenant (migration 027, graceful fallback) ──
  let preferredSupplierId: string | null = null;
  try {
    const { data: tenantRow } = await admin
      .from("tenants")
      .select("preferred_supplier_id")
      .eq("id", ctx.tenant.id)
      .single();
    preferredSupplierId = (tenantRow as { preferred_supplier_id?: string | null } | null)?.preferred_supplier_id ?? null;
  } catch { /* migration 027 not yet applied */ }

  // ── 1. Fetch base order fields (stable columns) ───────────────────────────
  const { data: orders, error } = await admin
    .from("orders")
    .select(`
      id, order_number, stage, created_at, estimated_delivery,
      deposit_paid, balance_paid, tracking_number, production_choice,
      client_id, assigned_designer_id, supplier_user_id, notes
    `)
    .eq("tenant_id", ctx.tenant.id)
    .in("stage", WORKFLOW_STAGES)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ orders: [] });

  const orderIds    = orders.map((o) => o.id);
  const clientIds   = Array.from(new Set(orders.map((o) => o.client_id)));
  const designerIds = Array.from(new Set(orders.map((o) => o.assigned_designer_id).filter(Boolean))) as string[];
  const supplierIds = Array.from(new Set(orders.map((o) => o.supplier_user_id).filter(Boolean))) as string[];

  // ── 2. Migration-025 fields (mockup_revision_used, first_piece_revision_used) ─
  const revisionFlags = new Map<string, { mockup_revision_used: boolean; first_piece_revision_used: boolean }>();
  try {
    const { data: rf } = await admin
      .from("orders")
      .select("id, mockup_revision_used, first_piece_revision_used")
      .in("id", orderIds);
    for (const r of rf ?? []) {
      revisionFlags.set(r.id, {
        mockup_revision_used:      r.mockup_revision_used ?? false,
        first_piece_revision_used: r.first_piece_revision_used ?? false,
      });
    }
  } catch { /* Migration 025 not yet applied */ }

  // ── 3. Migration-026 field (on_hold) ─────────────────────────────────────
  const onHoldMap = new Map<string, boolean>();
  try {
    const { data: oh } = await admin
      .from("orders")
      .select("id, on_hold")
      .in("id", orderIds);
    for (const r of oh ?? []) onHoldMap.set(r.id, r.on_hold ?? false);
  } catch { /* Migration 026 not yet applied */ }

  // ── 3b. Migration-027 fields (production pricing) ────────────────────────
  const pricingMap = new Map<string, {
    production_pricing_tier: string | null;
    quantity: number | null;
    production_total_cents: number | null;
    production_deposit_cents: number | null;
    production_balance_cents: number | null;
  }>();
  try {
    const { data: pr } = await admin
      .from("orders")
      .select("id, production_pricing_tier, quantity, production_total_cents, production_deposit_cents, production_balance_cents")
      .in("id", orderIds);
    for (const r of pr ?? []) {
      pricingMap.set(r.id, {
        production_pricing_tier:  (r as Record<string, unknown>).production_pricing_tier as string | null ?? null,
        quantity:                 (r as Record<string, unknown>).quantity as number | null ?? null,
        production_total_cents:   (r as Record<string, unknown>).production_total_cents as number | null ?? null,
        production_deposit_cents: (r as Record<string, unknown>).production_deposit_cents as number | null ?? null,
        production_balance_cents: (r as Record<string, unknown>).production_balance_cents as number | null ?? null,
      });
    }
  } catch { /* Migration 027 not yet applied */ }

  // ── 4. Parallel lookups ───────────────────────────────────────────────────
  const [
    { data: clients },
    { data: designers },
    { data: suppliers },
    { data: invoices },
    { data: files },
    { data: fpMedia },
  ] = await Promise.all([
    admin.from("clients").select("id, name, sport").in("id", clientIds),
    designerIds.length
      ? admin.from("profiles").select("id, full_name, email").in("id", designerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string }[] }),
    supplierIds.length
      ? admin.from("profiles").select("id, full_name, company").in("id", supplierIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; company: string | null }[] }),
    admin
      .from("invoices")
      .select("order_id, status")
      .in("order_id", orderIds)
      .order("created_at", { ascending: false }),
    // order_files: count client-visible production-related files per order
    admin
      .from("order_files")
      .select("order_id, label, client_visible")
      .in("order_id", orderIds),
    // first_piece_media: all rows so we can compute stats per order
    admin
      .from("first_piece_media")
      .select("order_id, admin_approved, client_approved, client_visible")
      .in("order_id", orderIds),
  ]);

  // ── 5. Mockup counts (migration 025, graceful fallback) ────────────────────
  const mockupCountMap = new Map<string, number>();
  try {
    const { data: mockups } = await admin
      .from("order_mockups")
      .select("order_id")
      .in("order_id", orderIds);
    for (const m of mockups ?? []) {
      mockupCountMap.set(m.order_id, (mockupCountMap.get(m.order_id) ?? 0) + 1);
    }
  } catch { /* Migration 025 not yet applied */ }

  // ── 6. Build lookup maps ──────────────────────────────────────────────────
  const clientMap   = new Map((clients ?? []).map((c) => [c.id, c]));
  const designerMap = new Map((designers ?? []).map((d) => [d.id, d]));
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s]));

  const latestInvoice = new Map<string, string>();
  for (const inv of invoices ?? []) {
    if (!latestInvoice.has(inv.order_id)) latestInvoice.set(inv.order_id, inv.status);
  }

  // production file counts (client-visible, or label contains "production")
  const prodFilesCount = new Map<string, number>();
  for (const f of files ?? []) {
    const isProduction = f.client_visible || (f.label ?? "").toLowerCase().includes("production");
    if (isProduction) {
      prodFilesCount.set(f.order_id, (prodFilesCount.get(f.order_id) ?? 0) + 1);
    }
  }

  // first_piece_media stats
  const fpStats = new Map<string, { total: number; pending_admin: number; client_approved: number }>();
  for (const m of fpMedia ?? []) {
    const s = fpStats.get(m.order_id) ?? { total: 0, pending_admin: 0, client_approved: 0 };
    s.total++;
    if (m.admin_approved === null && !m.client_visible) s.pending_admin++;
    if (m.client_approved === true) s.client_approved++;
    fpStats.set(m.order_id, s);
  }

  // ── 7. Enrich ─────────────────────────────────────────────────────────────
  const enriched: WorkflowOrder[] = orders.map((o) => {
    const rf      = revisionFlags.get(o.id) ?? { mockup_revision_used: false, first_piece_revision_used: false };
    const pricing = pricingMap.get(o.id) ?? {
      production_pricing_tier: null, quantity: null,
      production_total_cents: null, production_deposit_cents: null, production_balance_cents: null,
    };

    const mockupCount = mockupCountMap.get(o.id) ?? 0;
    const prodFiles   = prodFilesCount.get(o.id) ?? 0;
    const fp          = fpStats.get(o.id) ?? { total: 0, pending_admin: 0, client_approved: 0 };

    const supplierUserId = o.supplier_user_id as string | null ?? null;

    // Phase = direct DB stage → column mapping.
    // Never inferred from payment status, supplier assignment, or media counts.
    const phase = stageToPhase(o.stage);

    return {
      id:                   o.id,
      order_number:         o.order_number,
      stage:                o.stage,
      phase,
      created_at:           o.created_at,
      estimated_delivery:   o.estimated_delivery,
      tracking_number:      (o as Record<string, unknown>).tracking_number as string | null ?? null,
      deposit_paid:         o.deposit_paid,
      balance_paid:         o.balance_paid,
      production_choice:    (o as Record<string, unknown>).production_choice as string | null ?? null,
      on_hold:              onHoldMap.get(o.id) ?? false,
      mockup_revision_used:      rf.mockup_revision_used,
      first_piece_revision_used: rf.first_piece_revision_used,
      notes:                (o as Record<string, unknown>).notes as string | null ?? null,
      client:               clientMap.get(o.client_id) ?? { name: "—", sport: null },
      assigned_designer:    o.assigned_designer_id ? (designerMap.get(o.assigned_designer_id) ?? null) : null,
      supplier_profile:     supplierUserId ? (supplierMap.get(supplierUserId) ?? null) : null,
      preferred_supplier_assigned: !!supplierUserId && supplierUserId === preferredSupplierId,
      invoice_status:       latestInvoice.get(o.id) ?? null,
      mockup_count:         mockupCount,
      production_files_count: prodFiles,
      first_piece_media:    fp,
      production_pricing_tier:  pricing.production_pricing_tier as ProductionPricingTier | null,
      quantity:                 pricing.quantity,
      production_total_cents:   pricing.production_total_cents,
      production_deposit_cents: pricing.production_deposit_cents,
      production_balance_cents: pricing.production_balance_cents,
    };
  });

  return NextResponse.json({ orders: enriched });
}

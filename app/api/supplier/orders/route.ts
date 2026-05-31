import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

const SUPPLIER_STAGES = [
  "sent_to_supplier", "files_sent",
  "first_piece_in_progress", "first_piece_revision", "first_piece_review",
  "bulk_production", "qc_verified", "shipped", "delivered",
] as const;

export type SupplierPhase =
  | "awaiting_release"
  | "first_piece_production"
  | "first_piece_upload"
  | "bulk_production"
  | "supplier_qc"
  | "shipment_upload";

export interface SupplierOrder {
  id: string;
  order_number: string | null;
  stage: string;
  supplier_phase: SupplierPhase;
  created_at: string;
  estimated_delivery: string | null;
  tracking_number: string | null;
  deposit_paid: boolean;
  balance_paid: boolean;
  client: { name: string; sport: string | null; city: string | null };
  fp_media: {
    total: number;
    pending_review: number;
    changes_requested: number;
    client_approved: number;
  };
}

/**
 * Compute which supplier board column an order belongs in.
 * Gates: deposit must be paid AND production files must exist before
 * moving past "awaiting_release" into active production columns.
 */
function computeSupplierPhase(
  stage: string,
  fpTotal: number,
  trackingNumber: string | null,
  depositPaid: boolean,
  hasProductionFiles: boolean,
): SupplierPhase {
  if (stage === "sent_to_supplier" || stage === "files_sent") {
    return "awaiting_release";
  }
  if (stage === "first_piece_in_progress") {
    // Both deposit and production files must be present before supplier starts
    if (!depositPaid || !hasProductionFiles) return "awaiting_release";
    return fpTotal === 0 ? "first_piece_production" : "first_piece_upload";
  }
  if (stage === "first_piece_revision" || stage === "first_piece_review") {
    return "first_piece_upload";
  }
  if (stage === "bulk_production") return "bulk_production";
  if (stage === "qc_verified") {
    return trackingNumber ? "shipment_upload" : "supplier_qc";
  }
  if (stage === "shipped" || stage === "delivered") return "shipment_upload";
  return "awaiting_release";
}

export async function GET() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "supplier" && profile.role !== "admin" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let query = admin
    .from("orders")
    .select("id, order_number, stage, created_at, estimated_delivery, tracking_number, deposit_paid, balance_paid, client_id, supplier_user_id, production_file_url")
    .in("stage", SUPPLIER_STAGES)
    .order("created_at", { ascending: true });

  if (profile.role === "supplier") {
    query = query.eq("supplier_user_id", user.id);
  }

  const { data: orders, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ orders: [] });

  const orderIds = orders.map((o) => o.id);
  const clientIds = Array.from(new Set(orders.map((o) => o.client_id)));

  const [{ data: clients }, { data: fpMedia }, { data: orderFileRows }] = await Promise.all([
    admin.from("clients").select("id, name, sport, city").in("id", clientIds),
    admin
      .from("first_piece_media")
      .select("order_id, admin_approved, client_approved")
      .in("order_id", orderIds),
    admin
      .from("order_files")
      .select("order_id, label, client_visible")
      .in("order_id", orderIds),
  ]);

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]));

  // Production files: labelled "production" or any client_visible file in order_files
  const prodFileOrderIds = new Set(
    (orderFileRows ?? [])
      .filter((f) => (f.label ?? "").toLowerCase().includes("production") || f.client_visible)
      .map((f) => f.order_id),
  );

  const fpStats = new Map<string, { total: number; pending_review: number; changes_requested: number; client_approved: number }>();
  for (const m of fpMedia ?? []) {
    const s = fpStats.get(m.order_id) ?? { total: 0, pending_review: 0, changes_requested: 0, client_approved: 0 };
    s.total++;
    if (m.admin_approved === null) s.pending_review++;
    if (m.admin_approved === false) s.changes_requested++;
    if (m.client_approved === true) s.client_approved++;
    fpStats.set(m.order_id, s);
  }

  const enriched: SupplierOrder[] = orders.map((o) => {
    const fp = fpStats.get(o.id) ?? { total: 0, pending_review: 0, changes_requested: 0, client_approved: 0 };
    const tracking = (o as Record<string, unknown>).tracking_number as string | null ?? null;
    const depositPaid = (o as Record<string, unknown>).deposit_paid as boolean ?? false;
    const hasProductionFiles =
      !!((o as Record<string, unknown>).production_file_url) ||
      prodFileOrderIds.has(o.id);
    const phase = computeSupplierPhase(o.stage, fp.total, tracking, depositPaid, hasProductionFiles);
    const c = clientMap.get(o.client_id);
    return {
      id: o.id,
      order_number: o.order_number,
      stage: o.stage,
      supplier_phase: phase,
      created_at: o.created_at,
      estimated_delivery: o.estimated_delivery ?? null,
      tracking_number: tracking,
      deposit_paid: depositPaid,
      balance_paid: (o as Record<string, unknown>).balance_paid as boolean ?? false,
      client: {
        name: c?.name ?? "—",
        sport: c?.sport ?? null,
        city: (c as Record<string, unknown>)?.city as string | null ?? null,
      },
      fp_media: fp,
    };
  });

  return NextResponse.json({ orders: enriched });
}

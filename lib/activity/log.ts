import { createAdminClient } from "@/lib/supabase/admin";

export type ActivityEventType =
  | "brief_submitted"
  | "stage_changed"
  | "designer_assigned"
  | "designer_unassigned"
  | "supplier_assigned"
  | "supplier_unassigned"
  | "admin_assigned"
  | "concept_uploaded"
  | "client_approved_design"
  | "invoice_created"
  | "payment_received"
  | "payment_verified"
  | "first_piece_uploaded"
  | "qc_approved"
  | "shipment_added"
  | "note_updated"
  | "files_uploaded";

interface LogActivityParams {
  tenantId: string;
  orderId: string;
  actorUserId?: string | null;
  actorRole?: string | null;
  eventType: ActivityEventType;
  eventMessage: string;
  metadata?: Record<string, unknown>;
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("order_activity").insert({
      tenant_id:     params.tenantId,
      order_id:      params.orderId,
      actor_user_id: params.actorUserId  ?? null,
      actor_role:    params.actorRole    ?? null,
      event_type:    params.eventType,
      event_message: params.eventMessage,
      metadata:      params.metadata     ?? null,
    });
  } catch {
    // Non-fatal — never let activity logging break the main action
  }
}

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export type ClientOrderContext = {
  userId: string;
  email: string;
  orderId: string;
  clientId: string;
  tenantId: string;
};

/**
 * Verifies the caller is authenticated and owns the given order.
 * Ownership is granted when the order's client matches EITHER:
 *   1. clients.email    = auth user's email  (legacy + email-based flow)
 *   2. clients.user_id  = auth user's uid    (user_id-linked flow)
 *
 * This mirrors the orders_select_own RLS policy exactly so both
 * authentication paths work consistently.
 */
export async function assertClientOrder(orderId: string): Promise<ClientOrderContext | NextResponse> {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, client_id, tenant_id, clients(email, user_id)")
    .eq("id", orderId)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const clientRaw = Array.isArray(order.clients)
    ? order.clients[0]
    : (order.clients as { email: string; user_id: string | null } | null);

  const clientEmail  = clientRaw?.email   ?? "";
  const clientUserId = clientRaw?.user_id ?? null;

  const emailMatch  = clientEmail.toLowerCase() === user.email.toLowerCase();
  const userIdMatch = clientUserId !== null && clientUserId === user.id;

  if (!emailMatch && !userIdMatch) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    userId:   user.id,
    email:    user.email,
    orderId:  order.id,
    clientId: order.client_id,
    tenantId: order.tenant_id,
  };
}

export function isErrorResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

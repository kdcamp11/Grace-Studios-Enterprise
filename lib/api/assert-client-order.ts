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
 * Verifies the caller is authenticated and that the given order's client
 * email matches the caller's JWT email. Returns context on success or a
 * 401/403 NextResponse on failure.
 */
export async function assertClientOrder(orderId: string): Promise<ClientOrderContext | NextResponse> {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, client_id, tenant_id, clients(email)")
    .eq("id", orderId)
    .single();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const clientEmail = Array.isArray(order.clients)
    ? order.clients[0]?.email
    : (order.clients as { email: string } | null)?.email;

  if (clientEmail?.toLowerCase() !== user.email.toLowerCase()) {
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

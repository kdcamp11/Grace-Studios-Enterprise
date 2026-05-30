import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export type ClientDesignContext = {
  userId:   string;
  email:    string;
  designId: string;
  clientId: string;
  tenantId: string;
};

/**
 * Verifies the caller is authenticated and owns the given design.
 * Ownership mirrors the orders_select_own RLS policy: matched by
 * clients.email OR clients.user_id, so both auth paths work.
 */
export async function assertClientDesign(designId: string): Promise<ClientDesignContext | NextResponse> {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: design } = await admin
    .from("designs")
    .select("id, client_id, tenant_id, clients(email, user_id)")
    .eq("id", designId)
    .single();

  if (!design) return NextResponse.json({ error: "Design not found" }, { status: 404 });

  const clientRaw = Array.isArray(design.clients)
    ? design.clients[0]
    : (design.clients as { email: string; user_id: string | null } | null);

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
    designId: design.id,
    clientId: design.client_id,
    tenantId: design.tenant_id,
  };
}

export function isErrorResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

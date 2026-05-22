import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

export interface ClientProfile {
  id: string;
  name: string;
  contact_name: string | null;
  email: string;
  city: string | null;
}

/**
 * GET /api/brief/client-profile
 * Returns the authenticated user's client record for the current tenant, if
 * one exists. Used by /brief/new to skip the team-info step for returning
 * clients.
 */
export async function GET() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ client: null });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ client: null });

  const admin = createAdminClient();

  // Try user_id match first (fastest), fall back to email match
  let { data: client } = await admin
    .from("clients")
    .select("id, name, contact_name, email, city")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .single();

  if (!client && user.email) {
    const { data: byEmail } = await admin
      .from("clients")
      .select("id, name, contact_name, email, city")
      .eq("tenant_id", tenant.id)
      .eq("email", user.email.toLowerCase())
      .single();
    client = byEmail ?? null;

    // Back-fill the user_id link while we're here
    if (client) {
      await admin
        .from("clients")
        .update({ user_id: user.id })
        .eq("id", client.id)
        .is("user_id", null);
    }
  }

  return NextResponse.json({ client: client ?? null });
}

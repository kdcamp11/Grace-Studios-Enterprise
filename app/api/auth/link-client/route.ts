import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * POST /api/auth/link-client
 * Called after login/signup. Finds any clients rows for this tenant whose
 * email matches the authenticated user's email and sets user_id, so
 * subsequent orders skip the team-info form.
 */
export async function POST() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user?.email) return NextResponse.json({ linked: false });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ linked: false });

  const admin = createAdminClient();

  const { error } = await admin
    .from("clients")
    .update({ user_id: user.id })
    .eq("tenant_id", tenant.id)
    .eq("email", user.email.toLowerCase())
    .is("user_id", null);

  if (error) {
    console.error("[link-client] update error:", error.message);
    return NextResponse.json({ linked: false });
  }

  return NextResponse.json({ linked: true });
}

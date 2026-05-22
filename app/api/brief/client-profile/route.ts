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
  /** True when this record comes from the profiles table (first-timer prefill),
   *  not from a persisted clients row. The brief form should still show all
   *  fields so the user can confirm / correct before submitting. */
  is_prefill?: boolean;
}

/**
 * GET /api/brief/client-profile
 *
 * Returns the authenticated user's client record for the current tenant:
 *   - If a `clients` row exists (returning client) → full prefill, sport-only form.
 *   - If no `clients` row exists but the user has a `profiles` row with company
 *     data (first-time client who signed up via the normal flow) → partial prefill
 *     with `is_prefill: true` so the form pre-fills but stays editable.
 *   - Otherwise → null, show the blank new-client form.
 */
export async function GET() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ client: null });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ client: null });

  const admin = createAdminClient();

  // ── 1. Try existing clients row (user_id first, then email) ──────────────
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

  if (client) return NextResponse.json({ client });

  // ── 2. No clients row — check profiles for first-time prefill ────────────
  //    When a user signs up they provide full_name + company (team/org name).
  //    Use that to pre-fill the brief form so they don't have to re-type it.
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, company, email")
    .eq("id", user.id)
    .single();

  if (profile?.company) {
    const prefill: ClientProfile = {
      id:           profile.id,
      name:         profile.company,
      contact_name: profile.full_name ?? null,
      email:        profile.email ?? user.email ?? "",
      city:         null,
      is_prefill:   true,
    };
    return NextResponse.json({ client: prefill });
  }

  return NextResponse.json({ client: null });
}

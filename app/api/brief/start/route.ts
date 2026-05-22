import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * POST /api/brief/start
 * Creates (or upserts) a client row and a new order, both scoped to the
 * current tenant. Sets user_id on the client when the caller is authenticated,
 * so returning users skip the team-info form on future orders.
 */
export async function POST(req: NextRequest) {
  try {
    const { teamName, contactName, email, city, sport } = await req.json() as {
      teamName:    string;
      contactName: string;
      email:       string;
      city:        string;
      sport:       string;
    };

    if (!teamName || !email || !sport) {
      return NextResponse.json({ error: "teamName, email, and sport are required" }, { status: 400 });
    }

    const tenant = await getRequestTenant();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found for this domain" }, { status: 400 });
    }

    // Get the authenticated user (optional — brief/new requires auth, but be defensive)
    const serverClient = createServerClient();
    const { data: { user } } = await serverClient.auth.getUser();

    const admin = createAdminClient();

    // Upsert client — unique on (tenant_id, email)
    const { data: client, error: clientError } = await admin
      .from("clients")
      .upsert(
        {
          tenant_id:    tenant.id,
          name:         teamName,
          contact_name: contactName,
          email:        email.trim().toLowerCase(),
          sport,
          city,
          // Attach the auth user so future orders skip this form
          ...(user ? { user_id: user.id } : {}),
        },
        { onConflict: "tenant_id,email", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 });
    }

    // Create order
    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({ tenant_id: tenant.id, client_id: client.id, stage: "onboarding" })
      .select("id")
      .single();

    if (orderError) {
      return NextResponse.json({ error: orderError.message }, { status: 500 });
    }

    return NextResponse.json({ orderId: order.id, clientId: client.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

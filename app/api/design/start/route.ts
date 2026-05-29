import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * POST /api/design/start
 *
 * Creates (or upserts) a client row and a new designs row — but does NOT
 * touch the orders table. A real order is minted later by the Stripe webhook
 * when the client completes Creative Activation ($149).
 *
 * Auth: reads from Authorization: Bearer <token> header (same pattern as
 * /api/brief/start) so cookie-based auth failures never block the flow.
 *
 * Body: { teamName, contactName, email, city, sport, kind }
 *   kind: "ai" | "builder" | "upload"
 *
 * Returns: { designId, clientId }
 */
export async function POST(req: NextRequest) {
  try {
    const { teamName, contactName, email, city, sport, kind } = await req.json() as {
      teamName:    string;
      contactName: string;
      email:       string;
      city:        string;
      sport:       string;
      kind:        "ai" | "builder" | "upload";
    };

    if (!teamName || !email || !sport) {
      return NextResponse.json({ error: "teamName, email, and sport are required" }, { status: 400 });
    }

    if (!kind || !["ai", "builder", "upload"].includes(kind)) {
      return NextResponse.json({ error: "kind must be one of: ai, builder, upload" }, { status: 400 });
    }

    const tenant = await getRequestTenant();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found for this domain" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Resolve user from Bearer token so user_id is always set on the client row.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    let user: { id: string; email?: string } | null = null;
    if (token) {
      const { data } = await admin.auth.getUser(token);
      user = data.user ?? null;
    }

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
          ...(user ? { user_id: user.id } : {}),
        },
        { onConflict: "tenant_id,email", ignoreDuplicates: false },
      )
      .select("id")
      .single();

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 });
    }

    // Create the design row — no order created here.
    const { data: design, error: designError } = await admin
      .from("designs")
      .insert({ tenant_id: tenant.id, client_id: client.id, kind })
      .select("id")
      .single();

    if (designError) {
      return NextResponse.json({ error: designError.message }, { status: 500 });
    }

    return NextResponse.json({ designId: design.id, clientId: client.id });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

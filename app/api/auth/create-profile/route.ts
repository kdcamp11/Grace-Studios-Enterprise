import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

/**
 * Creates or updates a profile row for a newly signed-up user.
 * Resolves the tenant from the request hostname so profiles are always
 * scoped to the correct tenant at signup time.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, email, fullName, company, role } = await req.json() as {
      userId:    string;
      email:     string;
      fullName?: string;
      company?:  string;
      role?:     string;
    };

    if (!userId || !email) {
      return NextResponse.json({ error: "userId and email are required" }, { status: 400 });
    }

    const tenant = await getRequestTenant();
    if (!tenant) {
      return NextResponse.json({ error: "Tenant not found for this domain" }, { status: 400 });
    }

    const validRoles = ["client", "supplier", "admin"];
    const safeRole   = validRoles.includes(role ?? "") ? role : "client";

    const admin = createAdminClient();

    const { error } = await admin.from("profiles").upsert(
      {
        id:        userId,
        tenant_id: tenant.id,
        email:     email.trim().toLowerCase(),
        full_name: fullName || null,
        company:   company  || null,
        role:      safeRole,
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("[create-profile] upsert error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[create-profile] error:", message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

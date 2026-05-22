import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

const VALID_ROLES = ["client", "supplier", "admin", "designer", "sales_rep"] as const;
type Role = typeof VALID_ROLES[number];

export async function POST(req: NextRequest) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  try {
    const { email, role } = await req.json() as { email?: string; role?: string };

    if (!email || !role) {
      return NextResponse.json({ error: "email and role are required" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role as Role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const admin = createAdminClient();

    // ── 1. Verify the user exists in auth ─────────────────────────────────
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const authUser = listData.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail,
    );
    if (!authUser) {
      return NextResponse.json(
        { error: "No account found with that email. They need to sign up first." },
        { status: 404 },
      );
    }

    // ── 2. Upsert profile row (handles missing profiles from signup failures) ──
    const { data: profile, error: upsertError } = await admin
      .from("profiles")
      .upsert(
        {
          id:         authUser.id,
          email:      authUser.email,
          role,
          tenant_id:  ctx.tenant.id,
          full_name:  authUser.user_metadata?.full_name ?? null,
          company:    authUser.user_metadata?.company   ?? null,
        },
        { onConflict: "id" },
      )
      .select("id, email, full_name, company, created_at")
      .single();

    if (upsertError) {
      console.error("[set-user-role] upsert error:", upsertError.message);
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: { ...profile, role } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[set-user-role] error:", message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

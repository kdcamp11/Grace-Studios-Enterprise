import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

export async function POST(req: NextRequest) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  try {
    const { email, password } = await req.json() as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Service-role client — can list users and update any account
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // ── Look up the user by email ─────────────────────────────────────────
    const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) {
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    const target = listData.users.find(
      (u) => u.email?.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!target) {
      return NextResponse.json(
        { error: "No account found with that email address" },
        { status: 404 },
      );
    }

    // ── Set new password directly ─────────────────────────────────────────
    const { error: updateError } = await admin.auth.admin.updateUserById(
      target.id,
      { password },
    );
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reset-user-password] error:", message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

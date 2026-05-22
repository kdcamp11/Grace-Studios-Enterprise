import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";
import type { UserRole } from "@/lib/supabase/types";

const INVITABLE_ROLES: UserRole[] = ["admin", "designer", "sales_rep"];

export async function POST(req: NextRequest) {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  const { email, role } = await req.json() as { email?: string; role?: string };

  if (!email || !role) {
    return NextResponse.json({ error: "email and role are required" }, { status: 400 });
  }
  if (!INVITABLE_ROLES.includes(role as UserRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Send Supabase invite email — creates auth user if they don't exist
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    normalizedEmail,
    { redirectTo: `${appUrl}/auth/callback` },
  );

  if (inviteError) {
    // If user already exists, fall through to just update their role
    if (!inviteError.message.includes("already been registered")) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
  }

  // Upsert their profile with the requested role + tenant
  const userId = invited?.user?.id;
  if (!userId) {
    // User already exists — look them up
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = list?.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (!existing) {
      return NextResponse.json({ error: "Could not locate user account." }, { status: 404 });
    }

    const { data: profile, error: upsertError } = await admin
      .from("profiles")
      .upsert(
        { id: existing.id, email: normalizedEmail, role: role as UserRole, tenant_id: ctx.tenant.id },
        { onConflict: "id" },
      )
      .select("id, email, full_name, role, created_at")
      .single();

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
    return NextResponse.json({ member: profile, already_existed: true });
  }

  const { data: profile, error: upsertError } = await admin
    .from("profiles")
    .upsert(
      { id: userId, email: normalizedEmail, role: role as UserRole, tenant_id: ctx.tenant.id },
      { onConflict: "id" },
    )
    .select("id, email, full_name, role, created_at")
    .single();

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  return NextResponse.json({ member: profile });
}

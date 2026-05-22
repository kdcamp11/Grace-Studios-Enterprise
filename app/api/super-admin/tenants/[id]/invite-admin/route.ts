import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { isSuperAdmin } from "@/lib/super-admin";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user || !isSuperAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Fetch the tenant
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id, name, owner_email")
    .eq("id", params.id)
    .single();

  if (tenantError || !tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as { email?: string };
  const inviteEmail = (body.email || tenant.owner_email)?.trim().toLowerCase();

  if (!inviteEmail) {
    return NextResponse.json({ error: "No email address to invite" }, { status: 400 });
  }

  // Check if a Supabase auth user already exists for this email
  const { data: listData } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const existing = listData?.users.find((u) => u.email?.toLowerCase() === inviteEmail);

  let userId: string;

  if (existing) {
    userId = existing.id;
  } else {
    // Send invitation email — user clicks link, sets password, lands on platform
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      inviteEmail,
      {
        data: { role: "admin" },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`,
      }
    );
    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }
    userId = invited.user.id;
  }

  // Upsert the profile row scoped to this tenant with admin role
  const { error: profileError } = await admin
    .from("profiles")
    .upsert(
      {
        id:        userId,
        email:     inviteEmail,
        role:      "admin",
        tenant_id: tenant.id,
      },
      { onConflict: "id" },
    );

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    invited: !existing,
    email: inviteEmail,
  });
}

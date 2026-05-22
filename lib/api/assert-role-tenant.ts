import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";
import type { Tenant } from "@/lib/supabase/types";
import type { UserRole } from "@/lib/profile";

export type RoleContext = {
  userId: string;
  tenant: Tenant;
  role: UserRole;
};

/** Asserts the caller is one of the allowed roles and belongs to this tenant. */
export async function assertRoleTenant(
  allowedRoles: UserRole[]
): Promise<RoleContext | NextResponse> {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getRequestTenant();
  if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile || !allowedRoles.includes(profile.role as UserRole)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (profile.role !== "super_admin" && profile.tenant_id !== tenant.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { userId: user.id, tenant, role: profile.role as UserRole };
}

export function isErrorResponse(v: RoleContext | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

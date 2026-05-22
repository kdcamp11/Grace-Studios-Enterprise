import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";
import type { Tenant } from "@/lib/supabase/types";

export type AdminContext = {
  userId: string;
  tenant: Tenant;
  role: "admin" | "super_admin";
};

/**
 * Verifies the caller is authenticated, has admin or super_admin role,
 * and belongs to the request tenant (super_admins are exempt from the
 * tenant membership check — they operate across tenants).
 *
 * Returns an AdminContext on success or a 401/403 NextResponse on failure.
 */
export async function assertAdminTenant(): Promise<AdminContext | NextResponse> {
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

  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Super admins can act on any tenant; regular admins must belong to this one
  if (profile.role !== "super_admin" && profile.tenant_id !== tenant.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return {
    userId: user.id,
    tenant,
    role: profile.role as "admin" | "super_admin",
  };
}

export function isErrorResponse(v: AdminContext | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

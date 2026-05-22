import { createAdminClient } from "@/lib/supabase/admin";
import type { Tenant } from "@/lib/supabase/types";

// Fallback tenant used in local dev when there's no subdomain
export const DEV_TENANT_SLUG = "dev";

export async function resolveTenant(hostname: string): Promise<Tenant | null> {
  const admin = createAdminClient();
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost:3000";

  // 1. Exact custom domain match  →  "app.rivalathletics.com"
  const { data: byDomain } = await admin
    .from("tenants")
    .select("*")
    .eq("custom_domain", hostname)
    .eq("active", true)
    .single();

  if (byDomain) return byDomain as Tenant;

  // 2. Subdomain match  →  "rival.yourplatform.com"
  const subdomain = hostname.replace(`.${platformDomain}`, "");
  if (subdomain && subdomain !== hostname) {
    const { data: bySlug } = await admin
      .from("tenants")
      .select("*")
      .eq("slug", subdomain)
      .eq("active", true)
      .single();

    if (bySlug) return bySlug as Tenant;
  }

  // 3. Local dev fallback
  if (hostname === "localhost" || hostname.startsWith("localhost:")) {
    const { data: devTenant } = await admin
      .from("tenants")
      .select("*")
      .eq("slug", DEV_TENANT_SLUG)
      .eq("active", true)
      .single();

    if (devTenant) return devTenant as Tenant;
  }

  return null;
}

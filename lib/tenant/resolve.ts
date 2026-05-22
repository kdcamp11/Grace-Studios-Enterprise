import { createAdminClient } from "@/lib/supabase/admin";
import type { Tenant } from "@/lib/supabase/types";

// Fallback tenant used in local dev when there's no subdomain
export const DEV_TENANT_SLUG = "dev";

// Strip protocol + trailing slash from a URL string so we can compare to
// a raw hostname (e.g. "https://grace-studios-enterprise.vercel.app" → "grace-studios-enterprise.vercel.app")
function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

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

  // 4. Platform main-domain fallback
  //    Matches the primary production URL (e.g. grace-studios-enterprise.vercel.app)
  //    or any hostname listed in PLATFORM_HOSTNAME (comma-separated for multiple).
  //    Set PLATFORM_HOSTNAME and PLATFORM_SLUG in your Vercel environment variables.
  //
  //    PLATFORM_HOSTNAME=grace-studios-enterprise.vercel.app
  //    PLATFORM_SLUG=grace-studios          ← the slug of your root tenant in Supabase
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const platformHostnames = [
    appUrl ? stripProtocol(appUrl) : "",
    ...(process.env.PLATFORM_HOSTNAME ?? "").split(",").map((h) => h.trim()),
  ].filter(Boolean);

  if (platformHostnames.includes(hostname)) {
    const platformSlug = process.env.PLATFORM_SLUG ?? DEV_TENANT_SLUG;
    const { data: platformTenant } = await admin
      .from("tenants")
      .select("*")
      .eq("slug", platformSlug)
      .eq("active", true)
      .single();

    if (platformTenant) return platformTenant as Tenant;
  }

  // 5. Single-tenant last-resort fallback
  //    When the deployment has exactly one active tenant (typical for this platform),
  //    return it automatically regardless of hostname. Eliminates the need for
  //    PLATFORM_HOSTNAME / PLATFORM_SLUG env vars on Vercel.
  //    Safe because if multiple tenants exist, this step is skipped.
  const { data: allTenants } = await admin
    .from("tenants")
    .select("*")
    .eq("active", true)
    .limit(2);

  if (allTenants?.length === 1) return allTenants[0] as Tenant;

  return null;
}

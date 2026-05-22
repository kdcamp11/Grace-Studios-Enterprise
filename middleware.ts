import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") ?? "localhost:3000";
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "localhost:3000";

  // Derive tenant slug from subdomain or custom domain.
  // The actual DB lookup happens in layout.tsx (server component) using resolveTenant().
  // Here we just forward the hostname so layout has it without re-reading the header.
  let tenantSlug = "dev";

  const isLocalhost = hostname === "localhost" || hostname.startsWith("localhost:");
  if (!isLocalhost) {
    // Could be "rival.platform.com" or "app.rivalathletics.com"
    const subdomain = hostname.replace(`.${platformDomain}`, "");
    if (subdomain && subdomain !== hostname) {
      tenantSlug = subdomain;
    }
    // Custom domain — slug resolved server-side via DB, just pass the full hostname
    else {
      tenantSlug = hostname;
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-slug", tenantSlug);
  requestHeaders.set("x-hostname", hostname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // Skip static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)).*)",
  ],
};

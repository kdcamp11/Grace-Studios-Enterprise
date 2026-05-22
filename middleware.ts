import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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

  // Build the initial response (carries tenant headers forward)
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  // Refresh the Supabase session on every request so the access token stays
  // fresh in cookies. Without this, an expired token would cause 401s on
  // all protected API routes even when the user is logged in.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Forward updated cookies to both the forwarded request and the response
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Calling getUser() triggers a token refresh if the access token is expired.
  // We intentionally ignore the result here — auth checks happen in route handlers.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    // Skip static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2)).*)",
  ],
};

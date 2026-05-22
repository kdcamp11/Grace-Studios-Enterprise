import { createServerClient as _createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client that reads the authenticated user's session
 * from request cookies. Use this in all API route handlers so
 * auth.getUser() returns the real logged-in user instead of null.
 *
 * Uses getAll/setAll (non-deprecated) so the server can also refresh
 * an expired access token and write updated cookies back to the response.
 */
export const createServerClient = () => {
  const cookieStore = cookies();
  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Read-only in some contexts (e.g. Server Components) — safe to ignore
          }
        },
      },
    }
  );
};

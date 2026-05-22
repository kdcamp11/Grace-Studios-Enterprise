import { createServerClient as _createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client that reads the authenticated user's session
 * from request cookies. Use this in all API route handlers so
 * auth.getUser() returns the real logged-in user instead of null.
 */
export const createServerClient = () => {
  const cookieStore = cookies();
  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set(name: string, value: string, options: any) {
          try { cookieStore.set(name, value, options); } catch { /* read-only in some contexts */ }
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        remove(name: string, options: any) {
          try { cookieStore.delete(name); } catch { /* read-only in some contexts */ }
        },
      },
    }
  );
};

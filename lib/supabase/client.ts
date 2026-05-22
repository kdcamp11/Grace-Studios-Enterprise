import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

let instance: SupabaseClient | null = null;

/**
 * Browser-side Supabase client.
 * Uses createBrowserClient (from @supabase/ssr / auth-helpers-nextjs v0.15)
 * which automatically syncs the auth session to cookies so server-side
 * route handlers can read it via createServerClient.
 */
export const createClient = () => {
  if (instance) return instance;
  instance = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return instance;
};

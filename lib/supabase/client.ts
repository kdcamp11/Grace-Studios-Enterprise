import { createBrowserClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";

let instance: SupabaseClient | null = null;

// Resolves once any one-time localStorage → cookie session migration is done.
// Await sessionReady() before calling auth.getUser() in client components to
// ensure sessions from before the createBrowserClient upgrade aren't lost.
let _migrationResolve: (() => void) | null = null;
const _migrationPromise: Promise<void> = new Promise((res) => { _migrationResolve = res; });

export const sessionReady = (): Promise<void> => _migrationPromise;

/**
 * Browser-side Supabase client.
 * Uses createBrowserClient (from @supabase/ssr / auth-helpers-nextjs v0.15)
 * which syncs the auth session to cookies so server-side route handlers
 * can read it via createServerClient.
 *
 * On first call, silently migrates any existing localStorage session
 * (stored by the old supabase-js createClient) to cookie-based storage
 * so users don't need to re-login after the upgrade.
 */
export const createClient = (): SupabaseClient => {
  if (instance) return instance;

  instance = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  if (typeof window !== "undefined") {
    void migrateLocalStorageSession(instance).finally(() => {
      _migrationResolve?.();
    });
  } else {
    // SSR context — no migration needed, resolve immediately
    _migrationResolve?.();
  }

  return instance;
};

/**
 * One-time migration: if there's a legacy supabase-js localStorage session
 * (sb-<projectRef>-auth-token) but no cookie session, call setSession() to
 * transfer it. createBrowserClient then persists it in document.cookie so
 * the server can read it on subsequent requests.
 */
async function migrateLocalStorageSession(client: SupabaseClient): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const ref = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!ref) return;

  const lsKey = `sb-${ref}-auth-token`;
  const raw = window.localStorage.getItem(lsKey);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      refresh_token?: string;
    };
    const { access_token, refresh_token } = parsed;
    if (!access_token || !refresh_token) return;

    // If the cookie-based client already has a valid session, just clean up.
    const { data: { session: existing } } = await client.auth.getSession();
    if (existing) {
      window.localStorage.removeItem(lsKey);
      return;
    }

    // Transfer the session. setSession() refreshes an expired access_token
    // via the refresh_token, then persists the result to document.cookie.
    await client.auth.setSession({ access_token, refresh_token });
    window.localStorage.removeItem(lsKey);
  } catch {
    // Non-fatal — the user will be prompted to sign in again naturally.
    window.localStorage.removeItem(lsKey);
  }
}

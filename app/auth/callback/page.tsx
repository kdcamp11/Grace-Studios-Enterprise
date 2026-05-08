"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile, rolePortal } from "@/lib/profile";
import { Suspense } from "react";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function resolve() {
      const supabase = createClient();

      // Supabase JS v2 auto-exchanges the PKCE code on session detection
      let { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        // Give the PKCE exchange a moment to complete
        await new Promise((r) => setTimeout(r, 1500));
        ({ data: { session } } = await supabase.auth.getSession());
      }

      if (!session) {
        router.replace("/login?error=auth_failed");
        return;
      }

      // Respect explicit ?next= overrides (e.g. deep links)
      const next = searchParams.get("next");
      if (next) { router.replace(next); return; }

      // Route to the portal matching the user's role
      const profile = await getProfile();
      router.replace(profile ? rolePortal(profile.role) : "/portal");
    }

    resolve();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-gs-dark flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-gs-gold border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-gs-muted font-barlow text-sm">Signing you in…</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}

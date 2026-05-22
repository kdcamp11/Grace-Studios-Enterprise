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

      // Link the auth user to any matching client rows for this tenant
      await fetch("/api/auth/link-client", { method: "POST" }).catch(() => {});

      // Respect explicit ?next= overrides (e.g. deep links)
      const next = searchParams.get("next");
      if (next) { router.replace(next); return; }

      // Route to the portal matching the user's role
      const profile = await getProfile();
      if (!profile) { router.replace("/portal"); return; }

      // First-time admin: send to onboarding wizard
      if (profile.role === "admin") {
        const onboardingRes = await fetch("/api/onboarding").catch(() => null);
        if (onboardingRes?.ok) {
          const { tenant } = await onboardingRes.json();
          if (tenant && !tenant.onboarding_complete) {
            router.replace("/onboarding");
            return;
          }
        }
      }

      router.replace(rolePortal(profile.role));
    }

    resolve();
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-brand-bg flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-brand-muted font-barlow text-sm">Signing you in…</p>
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

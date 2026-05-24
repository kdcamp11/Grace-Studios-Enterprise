"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";

// Dynamic import keeps Three.js / R3F out of the SSR bundle entirely
const JerseyBuilder = dynamic(
  () => import("@/components/JerseyBuilder"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-brand-bg flex flex-col items-center justify-center gap-4">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-barlow text-brand-muted uppercase tracking-widest">Loading builder…</p>
      </div>
    ),
  }
);

export default function JerseyBuilderPage() {
  const router  = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      await sessionReady();
      const profile = await getProfile();
      if (!profile) { router.replace("/login"); return; }
      if (profile.role === "supplier") { router.replace("/supplier"); return; }
      setReady(true);
    }
    check();
  }, [router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <JerseyBuilder />;
}

"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import { BUILDER_STEPS } from "@/components/brief/BriefProgress";
import { saveBriefState } from "@/lib/brief-state";
import { createClient } from "@/lib/supabase/client";
import type { ClientProfile } from "@/app/api/brief/client-profile/route";

const SPORTS = [
  "Basketball",
  "Tracksuits",
];

function TeamInfoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // path=ai → go straight to AI brief after order creation
  // path=builder → go straight to jersey builder after order creation
  // (no path) → fall back to /brief/[orderId]/choose (legacy)
  const designPath = searchParams.get("path") ?? null;

  // Shared state
  const [sport, setSport]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [authChecked, setAuthChecked] = useState(false);

  // Returning-client state (has a clients row — only ask for sport)
  const [existingClient, setExistingClient] = useState<ClientProfile | null>(null);

  // New-client form state (also used for is_prefill — pre-filled but editable)
  const [teamName, setTeamName]       = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail]             = useState("");
  const [city, setCity]               = useState("");

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/portal"); return; }

      // Check for existing client profile (returns null if first-time)
      const res = await fetch("/api/brief/client-profile");
      if (res.ok) {
        const { client } = await res.json() as { client: ClientProfile | null };
        if (client) {
          if (client.is_prefill) {
            // First-timer: pre-fill the new-client form fields but keep them editable
            setTeamName(client.name ?? "");
            setContactName(client.contact_name ?? "");
            setEmail(client.email ?? "");
            setCity(client.city ?? "");
          } else {
            // Returning client: they have a full clients row → sport-only form
            setExistingClient(client);
          }
        }
      }
      setAuthChecked(true);
    }
    init();
  }, [router]);

  async function startOrder(payload: {
    teamName: string;
    contactName: string;
    email: string;
    city: string;
    sport: string;
  }) {
    setLoading(true);
    setError("");
    try {
      // Get the in-memory access token so the server can reliably link this
      // order to the user's account even if cookie-based auth doesn't read correctly.
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch("/api/brief/start", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start brief");

      saveBriefState({
        teamName:    payload.teamName,
        contactName: payload.contactName,
        email:       payload.email,
        city:        payload.city,
        sport:       payload.sport,
        orderId:     data.orderId,
        clientId:    data.clientId,
      });

      // Route based on design path chosen before Team Info
      if (designPath === "ai") {
        router.push(`/brief/${data.orderId}/style`);
      } else if (designPath === "builder-review") {
        // User already built the jersey (design saved in brief state) — go straight to review
        router.push(`/brief/${data.orderId}/builder-review`);
      } else if (designPath === "builder") {
        router.push(`/jersey-builder?orderId=${data.orderId}&sport=${encodeURIComponent(payload.sport)}`);
      } else if (designPath === "upload") {
        // Client-provided concept — skip AI generation, go to upload page
        router.push(`/orders/${data.orderId}/upload-concept`);
      } else {
        // Legacy fallback — direct links to /brief/new without a path param
        router.push(`/brief/${data.orderId}/choose?sport=${encodeURIComponent(payload.sport)}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Returning client: submit sport only ──────────────────────────────────
  async function handleReturningSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!existingClient || !sport) return;
    await startOrder({
      teamName:    existingClient.name,
      contactName: existingClient.contact_name ?? "",
      email:       existingClient.email,
      city:        existingClient.city ?? "",
      sport,
    });
  }

  // ── New client: submit full form ─────────────────────────────────────────
  async function handleNewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName || !contactName || !email || !city || !sport) return;
    await startOrder({ teamName, contactName, email, city, sport });
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RETURNING CLIENT — just pick a sport
  // ─────────────────────────────────────────────────────────────────────────
  const isBuilderPath = designPath === "builder" || designPath === "builder-review";

  if (existingClient) {
    return (
      <BriefLayout
        currentStep={1}
        {...(isBuilderPath ? { steps: BUILDER_STEPS } : {})}
        title="New order"
        subtitle="Your team info is saved. Just pick a sport and we'll get started."
      >
        {/* Saved profile summary */}
        <div className="bg-brand-surface border border-brand-border rounded-xl px-5 py-4 mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="font-display font-bold uppercase tracking-wide text-brand-text text-sm">
              {existingClient.name}
            </p>
            <p className="text-xs text-brand-muted font-barlow mt-0.5">
              {existingClient.contact_name && `${existingClient.contact_name} · `}
              {existingClient.email}
              {existingClient.city && ` · ${existingClient.city}`}
            </p>
          </div>
          <a
            href="/settings"
            className="text-[11px] font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors flex-shrink-0"
          >
            Edit →
          </a>
        </div>

        <form onSubmit={handleReturningSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-3">
              Sport
            </label>
            <div className="flex flex-wrap gap-2">
              {SPORTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSport(s)}
                  className={`px-4 py-2 rounded-full text-sm font-barlow font-medium transition-all duration-150
                    ${sport === s
                      ? "bg-brand-primary text-brand-bg"
                      : "bg-brand-surface border border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-text"
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm font-barlow bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={!sport || loading}
              className="w-full py-3.5 rounded-lg font-display font-bold text-base uppercase tracking-widest transition-all duration-200
                bg-brand-primary text-brand-bg hover:bg-brand-secondary
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "Setting up your order…" : "Continue to Design System →"}
            </button>
          </div>
        </form>
      </BriefLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NEW CLIENT — full team-info form (pre-filled from profile if available)
  // ─────────────────────────────────────────────────────────────────────────
  const canSubmit = teamName && contactName && email && city && sport;
  const hasPrefill = Boolean(teamName || contactName || email);

  return (
    <BriefLayout
      currentStep={1}
      {...(isBuilderPath ? { steps: BUILDER_STEPS } : {})}
      title="Tell us about your team"
      subtitle={
        hasPrefill
          ? "We pre-filled your info from your account. Update anything that's changed."
          : "This information will appear on your order and design brief."
      }
    >
      <form onSubmit={handleNewSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">
              Team / Program Name
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Westside Warriors"
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">
              Contact Name
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Coach Johnson"
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coach@school.edu"
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Atlanta, GA"
              className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-3">
            Sport
          </label>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSport(s)}
                className={`px-4 py-2 rounded-full text-sm font-barlow font-medium transition-all duration-150
                  ${sport === s
                    ? "bg-brand-primary text-brand-bg"
                    : "bg-brand-surface border border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-text"
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm font-barlow bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="pt-2">
          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full py-3.5 rounded-lg font-display font-bold text-base uppercase tracking-widest transition-all duration-200
              bg-brand-primary text-brand-bg hover:bg-brand-secondary
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Setting up your order…" : "Continue →"}
          </button>
        </div>
      </form>
    </BriefLayout>
  );
}

export default function TeamInfoPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <TeamInfoPage />
    </Suspense>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import { saveBriefState } from "@/lib/brief-state";
import { createClient } from "@/lib/supabase/client";

const SPORTS = [
  "Basketball",
  "Football",
  "Soccer",
  "Baseball",
  "Softball",
  "Volleyball",
  "Lacrosse",
  "Hockey",
  "Wrestling",
  "Track & Field",
  "Other",
];

export default function TeamInfoPage() {
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [teamName, setTeamName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [sport, setSport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/portal");
      } else {
        setAuthChecked(true);
      }
    });
  }, [supabase, router]);

  const canSubmit = teamName && contactName && email && city && sport;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    try {
      // Upsert client record
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .upsert(
          { name: teamName, contact_name: contactName, email, sport, city },
          { onConflict: "email", ignoreDuplicates: false }
        )
        .select("id")
        .single();

      if (clientError) throw clientError;

      // Create order at onboarding stage
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({ client_id: client.id, stage: "onboarding" })
        .select("id")
        .single();

      if (orderError) throw orderError;

      // Persist to localStorage for subsequent screens
      saveBriefState({
        teamName,
        contactName,
        email,
        city,
        sport,
        orderId: order.id,
        clientId: client.id,
      });

      router.push(`/brief/${order.id}/style`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gs-dark flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BriefLayout
      currentStep={1}
      title="Tell us about your team"
      subtitle="This information will appear on your order and design brief."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-gs-muted mb-2">
              Team / Program Name
            </label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. Westside Warriors"
              className="w-full bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-gs-muted mb-2">
              Contact Name
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="e.g. Coach Johnson"
              className="w-full bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors"
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-gs-muted mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="coach@school.edu"
              className="w-full bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-gs-muted mb-2">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Atlanta, GA"
              className="w-full bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-display uppercase tracking-wider text-gs-muted mb-3">
            Sport
          </label>
          <div className="flex flex-wrap gap-2">
            {SPORTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSport(s)}
                className={`px-4 py-2 rounded-full text-sm font-barlow font-medium transition-all duration-150
                  ${
                    sport === s
                      ? "bg-gs-gold text-gs-dark"
                      : "bg-gs-dark-3 border border-gs-border text-gs-muted hover:border-gs-gold hover:text-gs-white"
                  }
                `}
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
              bg-gs-gold text-gs-dark hover:bg-gs-gold-light
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Setting up your order…" : "Continue to Design System →"}
          </button>
        </div>
      </form>
    </BriefLayout>
  );
}

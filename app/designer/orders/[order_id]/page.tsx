"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo";

interface Brief {
  id: string;
  design_system: string | null;
  primary_colors: string | null;
  secondary_colors: string | null;
  accent_color: string | null;
  colors_to_avoid: string | null;
  hex_confirmed: boolean;
  brand_match: boolean;
  negative_references: string | null;
  jersey_cut: string | null;
  sublimated: boolean | null;
  home_colorway: string | null;
  away_colorway: string | null;
  number_style: string | null;
  player_names: boolean;
  logo_placement: string | null;
  logos_to_include: string | null;
  sponsor_text: string | null;
  reference_image_url: string | null;
  vision_prompt: string | null;
  ai_prompt: string | null;
}

interface Concept {
  id: string;
  concept_number: number;
  image_url: string;
  selected: boolean;
  client_feedback: string | null;
  created_at: string;
}

interface OrderDetail {
  id: string;
  order_number: string | null;
  stage: string;
  created_at: string;
  deposit_paid: boolean;
  design_fee_paid: boolean;
  approved_at: string | null;
  clients: { name: string; sport: string | null; city: string | null; email: string } | null;
  briefs: Brief | Brief[] | null;
  concepts: Concept[] | null;
}

function getBrief(order: OrderDetail): Brief | null {
  if (!order.briefs) return null;
  return Array.isArray(order.briefs) ? order.briefs[0] ?? null : order.briefs;
}

const DESIGN_SYSTEM_LABELS: Record<string, string> = {
  bold: "Bold", gradient: "Gradient", program: "Program", culture: "Culture",
};

export default function DesignerOrderPage() {
  const router      = useRouter();
  const { order_id } = useParams<{ order_id: string }>();
  const supabaseRef = useRef(createClient());
  const supabase    = supabaseRef.current;

  const [order, setOrder]     = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]     = useState("");

  useEffect(() => {
    getProfile().then((profile) => {
      if (!profile || (profile.role !== "designer" && profile.role !== "admin" && profile.role !== "super_admin")) {
        router.replace("/portal");
        return;
      }
      void supabase; // suppress unused warning
      fetch(`/api/designer/orders/${order_id}`)
        .then((r) => r.json())
        .then(({ order }) => { setOrder(order); setLoading(false); });
    });
  }, [router, order_id, supabase]);

  async function generateConcepts() {
    setGenerating(true); setGenError("");
    const res = await fetch(`/api/generate-concepts?order_id=${order_id}`);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setGenError((d as { error?: string }).error ?? "Generation failed");
    } else {
      // Reload order to show new concepts
      const data = await fetch(`/api/designer/orders/${order_id}`).then((r) => r.json());
      setOrder(data.order);
    }
    setGenerating(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <p className="text-brand-muted font-barlow">Order not found.</p>
      </div>
    );
  }

  const b        = getBrief(order);
  const concepts = order.concepts ?? [];
  const selected = concepts.find((c) => c.selected);

  const row   = "grid grid-cols-2 gap-x-6 py-2.5 border-b border-brand-border last:border-b-0";
  const lbl   = "text-[10px] font-display uppercase tracking-widest text-brand-muted self-center";
  const val   = "text-sm font-barlow text-brand-text";
  const check = (v: boolean | null) => v ? "Yes" : "No";

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center gap-4">
        <TenantLogo className="h-7" href="/designer" />
        <button
          onClick={() => router.push("/designer")}
          className="text-xs font-display uppercase tracking-wider text-brand-muted hover:text-brand-text transition-colors"
        >
          ← Queue
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-display uppercase tracking-[0.25em] text-brand-muted">Order</p>
          <h1 className="font-display text-base font-bold uppercase tracking-wide text-brand-text truncate">
            {order.clients?.name ?? "—"}
            {order.order_number && <span className="text-brand-muted ml-2 font-normal">#{order.order_number}</span>}
          </h1>
        </div>
        <span className={`flex-shrink-0 px-3 py-1 rounded-full text-[10px] font-display uppercase tracking-wider border ${
          order.stage === "onboarding"
            ? "bg-brand-primary/10 text-brand-primary border-brand-primary/30"
            : "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
        }`}>
          {order.stage === "onboarding" ? "Brief Ready" : "Concept Approved"}
        </span>
      </header>

      <main className="flex-1 px-4 py-6 flex justify-center">
        <div className="w-full max-w-4xl space-y-6">

          {/* Generate / concepts panel */}
          <div className="rounded-xl border border-brand-border bg-brand-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-display font-bold uppercase tracking-widest text-xs text-brand-muted mb-1">Concepts</p>
                <p className="text-sm font-barlow text-brand-text">
                  {concepts.length === 0
                    ? "No concepts generated yet"
                    : `${concepts.length} concept${concepts.length !== 1 ? "s" : ""} generated${selected ? ", 1 selected by client" : ""}`}
                </p>
              </div>
              {order.stage === "onboarding" && (
                <button
                  onClick={generateConcepts}
                  disabled={generating || !b}
                  className="px-5 py-2.5 rounded-lg bg-brand-primary text-white text-xs font-display font-bold uppercase tracking-widest transition-opacity hover:opacity-80 disabled:opacity-40"
                >
                  {generating ? "Generating…" : concepts.length > 0 ? "Regenerate" : "Generate Concepts"}
                </button>
              )}
            </div>
            {genError && <p className="text-red-500 text-xs font-barlow">{genError}</p>}
            {generating && (
              <div className="flex items-center gap-3 text-sm font-barlow text-brand-muted">
                <div className="w-4 h-4 border-2 border-brand-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                Generating AI concepts. This takes ~30 seconds…
              </div>
            )}

            {concepts.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {concepts.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-xl overflow-hidden border-2 transition-colors ${
                      c.selected ? "border-brand-primary" : "border-brand-border"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.image_url} alt={`Concept ${c.concept_number}`} className="w-full aspect-square object-cover" />
                    <div className="px-3 py-2 bg-brand-surface border-t border-brand-border">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-display uppercase tracking-wider text-brand-muted">
                          Concept {c.concept_number}
                        </p>
                        {c.selected && (
                          <span className="text-[10px] font-display uppercase tracking-wider text-brand-primary">
                            Selected ✓
                          </span>
                        )}
                      </div>
                      {c.client_feedback && (
                        <p className="text-xs font-barlow text-brand-muted mt-1 line-clamp-2">&ldquo;{c.client_feedback}&rdquo;</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Brief */}
          {b ? (
            <div className="rounded-xl border border-brand-border bg-brand-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
                <p className="font-display font-bold uppercase tracking-widest text-xs text-brand-muted">Brief</p>
                {b.reference_image_url && (
                  <a
                    href={b.reference_image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-display uppercase tracking-wider text-brand-primary hover:opacity-70 transition-opacity"
                  >
                    Reference Image ↗
                  </a>
                )}
              </div>
              <div className="px-5 py-2">

                {b.design_system && (
                  <div className={row}>
                    <p className={lbl}>Design System</p>
                    <p className={val}>{DESIGN_SYSTEM_LABELS[b.design_system] ?? b.design_system}</p>
                  </div>
                )}

                {b.vision_prompt && (
                  <div className="py-3 border-b border-brand-border">
                    <p className={`${lbl} mb-1.5`}>Vision</p>
                    <p className="text-sm font-barlow text-brand-text leading-relaxed">{b.vision_prompt}</p>
                  </div>
                )}

                {(b.primary_colors || b.secondary_colors || b.accent_color) && (
                  <div className={row}>
                    <p className={lbl}>Colors</p>
                    <div className="space-y-0.5">
                      {b.primary_colors   && <p className={val}><span className="text-brand-muted">Primary: </span>{b.primary_colors}</p>}
                      {b.secondary_colors && <p className={val}><span className="text-brand-muted">Secondary: </span>{b.secondary_colors}</p>}
                      {b.accent_color     && <p className={val}><span className="text-brand-muted">Accent: </span>{b.accent_color}</p>}
                      {b.colors_to_avoid  && <p className={val}><span className="text-brand-muted">Avoid: </span>{b.colors_to_avoid}</p>}
                    </div>
                  </div>
                )}

                <div className={row}>
                  <p className={lbl}>Hex Confirmed</p>
                  <p className={val}>{check(b.hex_confirmed)}</p>
                </div>
                <div className={row}>
                  <p className={lbl}>Brand Match</p>
                  <p className={val}>{check(b.brand_match)}</p>
                </div>

                {b.jersey_cut && (
                  <div className={row}>
                    <p className={lbl}>Jersey Cut</p>
                    <p className={val}>{b.jersey_cut}</p>
                  </div>
                )}
                <div className={row}>
                  <p className={lbl}>Sublimated</p>
                  <p className={val}>{check(b.sublimated)}</p>
                </div>

                {(b.home_colorway || b.away_colorway) && (
                  <div className={row}>
                    <p className={lbl}>Colorways</p>
                    <div>
                      {b.home_colorway && <p className={val}><span className="text-brand-muted">Home: </span>{b.home_colorway}</p>}
                      {b.away_colorway && <p className={val}><span className="text-brand-muted">Away: </span>{b.away_colorway}</p>}
                    </div>
                  </div>
                )}

                {b.number_style && (
                  <div className={row}>
                    <p className={lbl}>Number Style</p>
                    <p className={val}>{b.number_style}</p>
                  </div>
                )}
                <div className={row}>
                  <p className={lbl}>Player Names</p>
                  <p className={val}>{check(b.player_names)}</p>
                </div>

                {b.logo_placement && (
                  <div className={row}>
                    <p className={lbl}>Logo Placement</p>
                    <p className={val} style={{ textTransform: "capitalize" }}>{b.logo_placement.replace(/_/g, " ")}</p>
                  </div>
                )}

                {b.logos_to_include && (
                  <div className={row}>
                    <p className={lbl}>Logos to Include</p>
                    <p className={val}>{b.logos_to_include}</p>
                  </div>
                )}

                {b.sponsor_text && (
                  <div className={row}>
                    <p className={lbl}>Sponsor Text</p>
                    <p className={val}>{b.sponsor_text}</p>
                  </div>
                )}

                {b.negative_references && (
                  <div className={row}>
                    <p className={lbl}>Avoid / Negative Refs</p>
                    <p className={val}>{b.negative_references}</p>
                  </div>
                )}

                {b.ai_prompt && (
                  <div className="py-3">
                    <p className={`${lbl} mb-1.5`}>AI Prompt</p>
                    <pre className="text-xs font-mono text-brand-muted bg-brand-bg border border-brand-border rounded-lg px-4 py-3 whitespace-pre-wrap overflow-x-auto">
                      {b.ai_prompt}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-brand-border bg-brand-surface px-6 py-10 text-center">
              <p className="text-sm font-barlow text-brand-muted">Brief not yet submitted by client.</p>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";

interface Concept {
  id: string;
  concept_number: number;
  image_url: string;
  selected: boolean;
  created_at: string;
}

const CONCEPT_LABELS: Record<number, { title: string; sub: string }> = {
  1: { title: "Home Colorway",  sub: "Primary palette, home design" },
  2: { title: "Away Colorway",  sub: "Alternate palette, road design" },
  3: { title: "Bold Graphic",   sub: "High-contrast statement look" },
  4: { title: "Minimal Clean",  sub: "Refined, understated execution" },
};

function ConceptCard({
  concept,
  isSelected,
  onSelect,
}: {
  concept: Concept;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError]   = useState(false);
  const meta = CONCEPT_LABELS[concept.concept_number] ?? {
    title: `Concept ${concept.concept_number}`,
    sub:   "Design concept",
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative rounded-xl border overflow-hidden transition-all duration-200 text-left w-full
        ${isSelected
          ? "border-gs-gold ring-1 ring-gs-gold/20"
          : "border-gs-border hover:border-gs-gold"
        }
      `}
    >
      {/* Selected badge */}
      {isSelected && (
        <span className="absolute top-3 right-3 z-10 w-6 h-6 bg-gs-gold rounded-full flex items-center justify-center shadow-lg">
          <svg className="w-3.5 h-3.5 text-gs-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}

      {/* Image area — portrait ratio for jersey renders */}
      <div className="relative w-full aspect-[4/5] bg-[#0d0d0d] overflow-hidden">
        {/* Skeleton shimmer while loading */}
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#161616] via-[#1c1c1c] to-[#131313]" />
        )}

        {/* Error fallback */}
        {imgError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/20">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] font-barlow">Image unavailable</span>
          </div>
        )}

        {/* Actual concept image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={concept.image_url}
          alt={meta.title}
          className={`w-full h-full object-contain transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setImgLoaded(true)}
          onError={() => { setImgError(true); setImgLoaded(true); }}
        />

        {/* Selection overlay glow */}
        {isSelected && (
          <div className="absolute inset-0 ring-inset ring-2 ring-gs-gold/20 pointer-events-none" />
        )}
      </div>

      {/* Card footer */}
      <div className="px-3.5 py-3 bg-gs-dark-2 border-t border-gs-border">
        <p className={`font-display font-bold uppercase tracking-wide text-xs ${isSelected ? "text-gs-gold" : "text-gs-white"}`}>
          {meta.title}
        </p>
        <p className="text-[10px] text-gs-muted font-barlow mt-0.5">{meta.sub}</p>
      </div>
    </button>
  );
}

export default function ConceptsPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [concepts, setConcepts]       = useState<Concept[]>([]);
  const [selected, setSelected]       = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [retrying, setRetrying]       = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchConcepts = useCallback(async () => {
    const { data } = await supabase
      .from("concepts")
      .select("id, concept_number, image_url, selected, created_at")
      .eq("order_id", order_id)
      .order("concept_number");

    if (data && data.length > 0) {
      setConcepts(data);
      const already = data.find((c) => c.selected);
      if (already) setSelected(already.id);
      setGenerating(false);
      setLoading(false);
      if (pollRef.current) clearInterval(pollRef.current);
      return true;
    }
    return false;
  }, [order_id, supabase]);

  async function triggerGeneration() {
    setGenerating(true);
    fetch("/api/generate-concepts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id }),
    }).then(() => fetchConcepts());
    pollRef.current = setInterval(fetchConcepts, 5000);
  }

  useEffect(() => {
    async function init() {
      const profile = await getProfile();
      if (profile) {
        if (profile.role === "supplier") { router.replace("/supplier"); return; }
        if (profile.role === "admin") setIsAdminView(true);
      }
      const hasExisting = await fetchConcepts();
      if (!hasExisting) {
        setLoading(false);
        await triggerGeneration();
      }
    }
    init();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  async function handleSelect(conceptId: string) {
    setSelected(conceptId);
    setSaving(true);
    await supabase.from("concepts").update({ selected: false }).eq("order_id", order_id);
    await supabase.from("concepts").update({ selected: true  }).eq("id", conceptId);
    setSaving(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleRetry() {
    setRetrying(true);
    await triggerGeneration();
    setRetrying(false);
  }

  function handleProceed() {
    if (!selected) return;
    router.push(`/orders/${order_id}/approve`);
  }

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">
      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">Admin View — Client Portal</span>
        </div>
      )}
      <header className="border-b border-gs-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <GraceLogo className="h-7" href="/portal" />
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-widest text-gs-gold hover:text-gs-gold-light transition-colors">
            Client Portal
          </a>
        </div>
        <div className="flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">Sign Out</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-3xl">

          <div className="mb-7">
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-gs-white">
              Your Concepts
            </h1>
            <p className="mt-1.5 text-sm text-gs-muted font-barlow">
              {generating
                ? "Our AI is designing your jersey — this usually takes 1–3 minutes."
                : "Select the concept you want to move forward with."}
            </p>
          </div>

          {/* Generating state */}
          {generating && (
            <div className="py-24 flex flex-col items-center justify-center gap-5">
              <div className="relative w-16 h-16">
                <div className="w-16 h-16 border border-gs-border rounded-full" />
                <div className="absolute inset-0 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-gs-white font-barlow font-medium">Designing your jersey</p>
                <p className="text-xs text-gs-muted font-barlow">4 unique concepts · Generated via AI</p>
              </div>
              <p className="text-[10px] text-gs-muted font-barlow mt-4 text-center max-w-xs">
                Your concepts will appear here automatically when ready. You can leave and come back.
              </p>
            </div>
          )}

          {/* Loading */}
          {loading && !generating && (
            <div className="py-24 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* No concepts — generation may have failed */}
          {!loading && !generating && concepts.length === 0 && (
            <div className="py-20 flex flex-col items-center gap-5 text-center">
              <div className="w-12 h-12 rounded-xl border border-gs-border flex items-center justify-center">
                <svg className="w-5 h-5 text-gs-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-gs-white font-barlow font-medium">No concepts generated yet</p>
                <p className="text-xs text-gs-muted font-barlow mt-1">Generation may still be in progress or encountered an issue.</p>
              </div>
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="px-5 py-2.5 rounded-lg border border-gs-border text-xs font-display uppercase tracking-wider text-gs-muted hover:border-gs-gold hover:text-gs-gold transition-colors disabled:opacity-50"
              >
                {retrying ? "Retrying…" : "Retry Generation"}
              </button>
            </div>
          )}

          {/* Concept grid — real images render here when concepts exist in DB */}
          {!loading && !generating && concepts.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                {concepts.map((concept) => (
                  <ConceptCard
                    key={concept.id}
                    concept={concept}
                    isSelected={selected === concept.id}
                    onSelect={() => handleSelect(concept.id)}
                  />
                ))}
              </div>

              {selected && (
                <p className="text-[10px] text-gs-muted font-barlow text-center mb-3">
                  {saving ? "Saving selection…" : "Selection saved. Proceed when ready."}
                </p>
              )}

              <button
                type="button"
                onClick={handleProceed}
                disabled={!selected || saving}
                className="w-full py-4 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                  bg-gs-white text-gs-dark hover:bg-gs-gold hover:text-white
                  disabled:opacity-35 disabled:cursor-not-allowed"
              >
                {saving ? "Saving…" : !selected ? "Select a Concept to Continue" : "Proceed to Approval →"}
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

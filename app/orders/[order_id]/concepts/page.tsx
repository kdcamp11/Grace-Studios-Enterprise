"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";
import type { DesignMetadata } from "@/app/api/generate-concepts/route";

interface Concept {
  id: string;
  concept_number: number;
  image_url: string;
  selected: boolean;
}

interface BoardData {
  teamName: string;
  orderNumber: string;
  metadata: DesignMetadata | null;
  concepts: Concept[];
}

// ─── Product Board ────────────────────────────────────────────────────────────

function ColorSwatch({ role, name, hex, pantone }: { role: string; name: string; hex: string; pantone?: string }) {
  return (
    <div className="flex items-start gap-2.5 mb-3">
      <div
        className="w-7 h-7 rounded-sm border border-black/10 flex-shrink-0 mt-0.5"
        style={{ backgroundColor: hex || "#cccccc" }}
      />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-800 leading-tight">{role}</p>
        <p className="text-[9px] text-gray-500 leading-tight">{pantone || name}</p>
      </div>
    </div>
  );
}

function BoardImage({ url, alt, className }: { url?: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError]   = useState(false);

  if (!url) return (
    <div className={`bg-[#111] flex items-center justify-center ${className ?? ""}`}>
      <span className="text-white/20 text-[10px] font-barlow">No image</span>
    </div>
  );

  return (
    <div className={`relative bg-[#111] overflow-hidden ${className ?? ""}`}>
      {!loaded && !error && (
        <div className="absolute inset-0 animate-pulse bg-[#1a1a1a]" />
      )}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white/20 text-[10px] font-barlow">Unavailable</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className={`w-full h-full object-contain transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setLoaded(true)}
          onError={() => { setError(true); setLoaded(true); }}
        />
      )}
    </div>
  );
}

function ProductBoard({ data }: { data: BoardData }) {
  const { teamName, orderNumber, metadata, concepts } = data;

  const front  = concepts.find(c => c.concept_number === 1);
  const back   = concepts.find(c => c.concept_number === 2);
  const detail1 = concepts.find(c => c.concept_number === 3);
  const detail2 = concepts.find(c => c.concept_number === 4);

  const garmentType   = metadata?.garmentType  ?? "Sports Uniform";
  const colorway      = metadata?.colorway     ?? [];
  const materials     = metadata?.materials    ?? [];
  const features      = metadata?.features     ?? [];
  const logoPlacement = metadata?.logoPlacement ?? "";

  return (
    <div className="bg-[#f5f3ee] rounded-2xl overflow-hidden shadow-xl border border-gray-200">

      {/* Board header bar */}
      <div className="px-6 py-3 bg-white border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-px h-5 bg-gray-300" />
          <span className="text-[9px] font-display uppercase tracking-[0.25em] text-gray-400">
            Grace Athletics — AI Concept
          </span>
        </div>
        <span className="text-[9px] font-mono text-gray-400">{orderNumber}</span>
      </div>

      {/* Main board body */}
      <div className="flex min-h-[520px]">

        {/* ── LEFT PANEL: Metadata ── */}
        <div className="w-[220px] flex-shrink-0 border-r border-gray-200 p-5 space-y-5 bg-white/60">

          {/* Team + Garment */}
          <div>
            <p className="font-display font-bold uppercase text-lg leading-tight tracking-wide text-gray-900">
              {teamName}
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 mt-0.5">{garmentType}</p>
            <div className="w-12 h-0.5 bg-gray-800 mt-3" />
          </div>

          {/* Colorway */}
          {colorway.length > 0 && (
            <div>
              <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 mb-3 font-semibold">Colorway</p>
              {colorway.map((c, i) => (
                <ColorSwatch key={i} {...c} />
              ))}
            </div>
          )}

          {/* Material */}
          {materials.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 mb-2 font-semibold">Material</p>
              {materials.map((m, i) => (
                <p key={i} className="text-[10px] text-gray-600 font-barlow leading-relaxed">{m}</p>
              ))}
            </div>
          )}

          {/* Features */}
          {features.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 mb-2 font-semibold">Features</p>
              {features.map((f, i) => (
                <p key={i} className="text-[10px] text-gray-600 font-barlow leading-snug">• {f}</p>
              ))}
            </div>
          )}

          {/* Logo placement */}
          {logoPlacement && (
            <div className="border-t border-gray-200 pt-4">
              <p className="text-[9px] uppercase tracking-[0.2em] text-gray-400 mb-1.5 font-semibold">Logo</p>
              <p className="text-[10px] text-gray-600 font-barlow capitalize">{logoPlacement.replace(/_/g, " ")}</p>
            </div>
          )}
        </div>

        {/* ── CENTER: Front + Back renders ── */}
        <div className="flex-1 bg-[#0f0f0f] flex items-stretch gap-px">
          <div className="flex-1 flex flex-col">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 text-center pt-3 pb-1 font-semibold">
              Front
            </p>
            <BoardImage
              url={front?.image_url}
              alt="Front view"
              className="flex-1"
            />
          </div>
          <div className="w-px bg-white/5" />
          <div className="flex-1 flex flex-col">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 text-center pt-3 pb-1 font-semibold">
              Back
            </p>
            <BoardImage
              url={back?.image_url}
              alt="Back view"
              className="flex-1"
            />
          </div>
        </div>

        {/* ── RIGHT PANEL: Detail callouts ── */}
        <div className="w-[160px] flex-shrink-0 border-l border-gray-200 bg-white/60 flex flex-col divide-y divide-gray-200">
          {[
            { concept: detail1, label: "Detail — Logo & Collar" },
            { concept: detail2, label: "Detail — Sleeve & Panel" },
          ].map(({ concept, label }, i) => (
            <div key={i} className="flex-1 p-3 flex flex-col">
              <p className="text-[8px] uppercase tracking-[0.15em] text-gray-400 mb-2 font-semibold leading-tight">
                {label}
              </p>
              <div className="flex-1 rounded overflow-hidden">
                <BoardImage
                  url={concept?.image_url}
                  alt={label}
                  className="w-full h-full min-h-[100px]"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer footer */}
      <div className="border-t border-gray-200 bg-white/40 px-5 py-2.5 flex items-center justify-between">
        <p className="text-[9px] text-gray-400 font-barlow italic leading-relaxed max-w-lg">
          AI concept is for visual direction only and may not exactly match final production artwork. Colors, proportions, and details are subject to change during production.
        </p>
        <div className="flex-shrink-0 ml-4 opacity-40">
          <GraceLogo className="h-4" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConceptsPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router = useRouter();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [boardData, setBoardData]     = useState<BoardData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [generating, setGenerating]   = useState(false);
  const [approving, setApproving]     = useState(false);
  const [retrying, setRetrying]       = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBoard = useCallback(async (): Promise<boolean> => {
    // Fetch concepts
    const { data: conceptRows } = await supabase
      .from("concepts")
      .select("id, concept_number, image_url, selected")
      .eq("order_id", order_id)
      .order("concept_number");

    if (!conceptRows || conceptRows.length === 0) return false;

    // Fetch order + client + brief in parallel
    const [{ data: orderRow }, { data: briefRow }] = await Promise.all([
      supabase
        .from("orders")
        .select("order_number, clients(name)")
        .eq("id", order_id)
        .single(),
      supabase
        .from("briefs")
        .select("ai_prompt")
        .eq("order_id", order_id)
        .single(),
    ]);

    const clientData = Array.isArray(orderRow?.clients)
      ? orderRow?.clients[0]
      : orderRow?.clients;
    const teamName    = (clientData as { name?: string })?.name ?? "Your Team";
    const orderNumber = orderRow?.order_number ?? order_id.slice(0, 8).toUpperCase();

    // Parse metadata JSON (if available)
    let metadata: DesignMetadata | null = null;
    if (briefRow?.ai_prompt) {
      try {
        metadata = JSON.parse(briefRow.ai_prompt) as DesignMetadata;
        // Validate it has the expected shape (not old plain-text)
        if (typeof metadata.description !== "string") metadata = null;
      } catch {
        metadata = null;
      }
    }

    setBoardData({ teamName, orderNumber, metadata, concepts: conceptRows });
    setGenerating(false);
    setLoading(false);
    if (pollRef.current) clearInterval(pollRef.current);
    return true;
  }, [order_id, supabase]);

  async function triggerGeneration() {
    setGenerating(true);
    fetch("/api/generate-concepts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_id }),
    }).then(() => fetchBoard());
    pollRef.current = setInterval(fetchBoard, 5000);
  }

  useEffect(() => {
    async function init() {
      const profile = await getProfile();
      if (profile) {
        if (profile.role === "supplier") { router.replace("/supplier"); return; }
        if (profile.role === "admin") setIsAdminView(true);
      }
      const hasExisting = await fetchBoard();
      if (!hasExisting) {
        setLoading(false);
        await triggerGeneration();
      }
    }
    init();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  async function handleApprove() {
    if (!boardData?.concepts.length) return;
    setApproving(true);
    // Mark concept 1 as the selected concept
    const concept1 = boardData.concepts.find(c => c.concept_number === 1) ?? boardData.concepts[0];
    await supabase.from("concepts").update({ selected: false }).eq("order_id", order_id);
    await supabase.from("concepts").update({ selected: true }).eq("id", concept1.id);
    router.push(`/orders/${order_id}/approve`);
  }

  async function handleRetry() {
    setRetrying(true);
    setBoardData(null);
    await triggerGeneration();
    setRetrying(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const hasConcepts = !!boardData && boardData.concepts.length > 0;

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
        <div className="w-full max-w-5xl">

          <div className="mb-7">
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-gs-white">
              Your Design Concept
            </h1>
            <p className="mt-1.5 text-sm text-gs-muted font-barlow">
              {generating
                ? "Our AI is designing your uniform — this usually takes 1–3 minutes."
                : hasConcepts
                ? "Review your concept board below. Approve to move into production."
                : "Preparing your concept…"}
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
                <p className="text-gs-white font-barlow font-medium">Building your product board</p>
                <p className="text-xs text-gs-muted font-barlow">AI design in progress · Front, back & detail renders</p>
              </div>
              <p className="text-[10px] text-gs-muted font-barlow mt-4 text-center max-w-xs">
                Your board will appear here automatically. You can leave and come back.
              </p>
            </div>
          )}

          {/* Loading */}
          {loading && !generating && (
            <div className="py-24 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* No concepts */}
          {!loading && !generating && !hasConcepts && (
            <div className="py-20 flex flex-col items-center gap-5 text-center">
              <div className="w-12 h-12 rounded-xl border border-gs-border flex items-center justify-center">
                <svg className="w-5 h-5 text-gs-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-gs-white font-barlow font-medium">No concept generated yet</p>
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

          {/* Product Board */}
          {!loading && !generating && hasConcepts && (
            <div className="space-y-5">
              <ProductBoard data={boardData!} />

              {/* Action row */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying || approving}
                  className="text-xs font-display uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors disabled:opacity-40"
                >
                  {retrying ? "Regenerating…" : "↺ Regenerate"}
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={approving}
                  className="px-8 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                    bg-gs-white text-gs-dark hover:bg-gs-gold hover:text-white
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {approving ? "Saving…" : "Approve This Design →"}
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

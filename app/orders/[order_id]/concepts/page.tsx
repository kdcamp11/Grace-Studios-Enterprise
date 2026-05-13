"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";
import type { DesignMetadata, GenerationStatus } from "@/app/api/generate-concepts/route";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerationProgress {
  status: GenerationStatus | "not_started";
  progress: number;
  total: number;
  error: string | null;
}

interface BoardData {
  teamName: string;
  orderNumber: string;
  metadata: DesignMetadata;
}

// ─── Color Swatch ─────────────────────────────────────────────────────────────

function ColorSwatch({ role, name, hex, pantone }: {
  role: string; name: string; hex: string; pantone?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-2.5">
      <div
        className="w-8 h-8 rounded-sm border border-black/10 flex-shrink-0"
        style={{ backgroundColor: hex || "#cccccc" }}
      />
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-700 leading-tight">{role}</p>
        <p className="text-[9px] text-gray-500 leading-tight mt-0.5">{pantone || name}</p>
      </div>
    </div>
  );
}

// ─── Board Image ──────────────────────────────────────────────────────────────

function BoardImage({ url, alt, className }: { url?: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError]   = useState(false);

  if (!url) return (
    <div className={`bg-[#111] flex items-center justify-center ${className ?? ""}`}>
      <span className="text-white/20 text-[10px]">No image</span>
    </div>
  );

  return (
    <div className={`relative bg-[#111] overflow-hidden ${className ?? ""}`}>
      {!loaded && !error && <div className="absolute inset-0 animate-pulse bg-[#1a1a1a]" />}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white/20 text-[10px]">Unavailable</span>
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

// ─── Generation Progress Bar ──────────────────────────────────────────────────

const STEP_LABELS = [
  "Analyzing brief",
  "Generating front view",
  "Generating back view",
  "Generating collar & logo detail",
  "Generating sleeve & panel detail",
];

function GeneratingState({ gen }: { gen: GenerationProgress }) {
  // progress 0 = Claude finished, images not started
  // progress 1-4 = images 1-4 done
  const stepIndex  = gen.status === "generating" ? gen.progress : 0;
  const label      = STEP_LABELS[Math.min(stepIndex, STEP_LABELS.length - 1)];
  const pct        = Math.round((stepIndex / gen.total) * 100);

  return (
    <div className="py-20 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto text-center">
      {/* Spinner */}
      <div className="relative w-16 h-16">
        <div className="w-16 h-16 border border-gs-border rounded-full" />
        <div className="absolute inset-0 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
      </div>

      {/* Label */}
      <div className="space-y-1">
        <p className="text-gs-white font-barlow font-medium">Building your product board</p>
        <p className="text-xs text-gs-gold font-display uppercase tracking-widest">{label}</p>
        {gen.status === "generating" && (
          <p className="text-xs text-gs-muted font-barlow">
            Image {gen.progress + 1} of {gen.total}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gs-border rounded-full h-0.5 overflow-hidden">
        <div
          className="h-full bg-gs-gold transition-all duration-700 ease-out rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-[10px] text-gs-muted font-barlow">
        Your board will appear here automatically. You can leave and come back.
      </p>
    </div>
  );
}

// ─── Product Board ────────────────────────────────────────────────────────────

function ProductBoard({ data }: { data: BoardData }) {
  const { teamName, orderNumber, metadata } = data;
  const images        = metadata.images;
  const garmentType   = metadata.garmentType   ?? "Sports Uniform";
  const colorway      = metadata.colorway      ?? [];
  const materials     = metadata.materials     ?? [];
  const features      = metadata.features      ?? [];
  const logoPlacement = metadata.logoPlacement ?? "";

  const detailLabel1 = features[0]
    ? features[0].replace(/^[•\-–]\s*/, "").split(" ").slice(0, 5).join(" ")
    : "Logo & Collar";
  const detailLabel2 = features[1]
    ? features[1].replace(/^[•\-–]\s*/, "").split(" ").slice(0, 5).join(" ")
    : "Sleeve & Panel";

  return (
    <div className="rounded-xl overflow-hidden border border-gray-300 shadow-lg" style={{ backgroundColor: "#f0ede6" }}>

      {/* Header */}
      <div className="border-b border-gray-300 bg-white px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-0.5 h-5 bg-gray-800" />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-500">
            Grace Athletics — AI Concept
          </span>
        </div>
        <span className="text-[9px] font-mono text-gray-400 tracking-widest">{orderNumber}</span>
      </div>

      {/* Body */}
      <div className="flex" style={{ minHeight: 540 }}>

        {/* LEFT: Metadata */}
        <div className="flex-shrink-0 border-r border-gray-300 flex flex-col" style={{ width: 210, backgroundColor: "#f8f6f1" }}>
          <div className="px-5 pt-5 pb-4 border-b border-gray-200">
            <p className="text-[8px] uppercase tracking-[0.3em] text-gray-400 font-bold mb-1">Grace Athletics</p>
            <p className="text-base font-bold uppercase tracking-wider text-gray-900 leading-tight">{teamName}</p>
            <p className="text-[9px] uppercase tracking-[0.18em] text-gray-500 mt-1">{garmentType}</p>
          </div>

          {colorway.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-200">
              <p className="text-[8px] uppercase tracking-[0.28em] text-gray-400 font-bold mb-3">Colorway</p>
              {colorway.map((c, i) => <ColorSwatch key={i} {...c} />)}
            </div>
          )}

          {materials.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-200">
              <p className="text-[8px] uppercase tracking-[0.28em] text-gray-400 font-bold mb-2">Material</p>
              {materials.map((m, i) => <p key={i} className="text-[9px] text-gray-600 leading-relaxed">{m}</p>)}
            </div>
          )}

          {features.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-200">
              <p className="text-[8px] uppercase tracking-[0.28em] text-gray-400 font-bold mb-2">Features</p>
              {features.map((f, i) => (
                <p key={i} className="text-[9px] text-gray-600 leading-snug mb-1">• {f}</p>
              ))}
            </div>
          )}

          {logoPlacement && (
            <div className="px-5 py-4">
              <p className="text-[8px] uppercase tracking-[0.28em] text-gray-400 font-bold mb-1.5">Logo</p>
              <p className="text-[9px] text-gray-600 capitalize leading-snug">{logoPlacement.replace(/_/g, " ")}</p>
            </div>
          )}
        </div>

        {/* CENTER: Front + Back */}
        <div className="flex-1 flex bg-[#0f0f0f]">
          <div className="flex-1 flex flex-col border-r border-white/5">
            <p className="text-[8px] uppercase tracking-[0.28em] text-white/25 text-center py-2.5 font-bold">Front</p>
            <BoardImage url={images?.front} alt="Front view" className="flex-1" />
          </div>
          <div className="flex-1 flex flex-col">
            <p className="text-[8px] uppercase tracking-[0.28em] text-white/25 text-center py-2.5 font-bold">Back</p>
            <BoardImage url={images?.back} alt="Back view" className="flex-1" />
          </div>
        </div>

        {/* RIGHT: Details */}
        <div className="flex-shrink-0 border-l border-gray-300 flex flex-col divide-y divide-gray-200" style={{ width: 168, backgroundColor: "#f8f6f1" }}>
          <div className="flex-1 flex flex-col p-3">
            <p className="text-[7px] uppercase tracking-[0.22em] text-gray-400 font-bold mb-2 leading-tight">{detailLabel1}</p>
            <div className="flex-1 rounded overflow-hidden" style={{ minHeight: 120 }}>
              <BoardImage url={images?.detail1} alt={detailLabel1} className="w-full h-full" />
            </div>
          </div>
          <div className="flex-1 flex flex-col p-3">
            <p className="text-[7px] uppercase tracking-[0.22em] text-gray-400 font-bold mb-2 leading-tight">{detailLabel2}</p>
            <div className="flex-1 rounded overflow-hidden" style={{ minHeight: 120 }}>
              <BoardImage url={images?.detail2} alt={detailLabel2} className="w-full h-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-300 bg-white/50 px-5 py-2.5 flex items-center justify-between">
        <p className="text-[8px] text-gray-400 italic leading-relaxed max-w-lg">
          AI concept is for visual direction only and may not exactly match final production artwork.
          Colors, proportions, and details are subject to change during production.
        </p>
        <div className="flex-shrink-0 ml-4 opacity-25">
          <GraceLogo className="h-4" />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConceptsPage() {
  const { order_id }  = useParams<{ order_id: string }>();
  const router        = useRouter();
  const supabaseRef   = useRef(createClient());
  const supabase      = supabaseRef.current;

  const [boardData, setBoardData]     = useState<BoardData | null>(null);
  const [gen, setGen]                 = useState<GenerationProgress>({ status: "not_started", progress: 0, total: 4, error: null });
  const [approving, setApproving]     = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);

  // ── Duplicate-generation guard for React Strict Mode ─────────────────────
  // useEffect fires twice in dev Strict Mode. This ref ensures we only ever
  // call the generation API once per true page mount.
  const generationFiredRef = useRef(false);
  const pollIntervalRef    = useRef<NodeJS.Timeout | null>(null);

  // ── Poll status endpoint ──────────────────────────────────────────────────

  const pollStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/generate-concepts/status?order_id=${order_id}`);
      const data = await res.json() as GenerationProgress;

      setGen(data);

      if (data.status === "completed") {
        // Stop polling and fetch the full board
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        await loadBoard();
      } else if (data.status === "failed") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      }
    } catch { /* network blip — keep polling */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  // ── Load completed board from DB ──────────────────────────────────────────

  const loadBoard = useCallback(async (): Promise<boolean> => {
    const { data: conceptRows } = await supabase
      .from("concepts")
      .select("id, concept_number, image_url, selected")
      .eq("order_id", order_id)
      .order("concept_number");

    if (!conceptRows || conceptRows.length === 0) return false;

    const [{ data: orderRow }, { data: briefRow }] = await Promise.all([
      supabase.from("orders").select("order_number, clients(name)").eq("id", order_id).single(),
      supabase.from("briefs").select("ai_prompt").eq("order_id", order_id).single(),
    ]);

    const clientData  = Array.isArray(orderRow?.clients) ? orderRow?.clients[0] : orderRow?.clients;
    const teamName    = (clientData as { name?: string })?.name ?? "Your Team";
    const orderNumber = orderRow?.order_number ?? order_id.slice(0, 8).toUpperCase();

    let metadata: DesignMetadata | null = null;
    if (briefRow?.ai_prompt) {
      try {
        const parsed = JSON.parse(briefRow.ai_prompt as string) as DesignMetadata;
        if (typeof parsed.description === "string") {
          // Back-fill images from concepts table if not embedded
          if (!parsed.images) {
            parsed.images = {
              front:   conceptRows.find(r => r.concept_number === 1)?.image_url ?? "",
              back:    conceptRows.find(r => r.concept_number === 2)?.image_url ?? "",
              detail1: conceptRows.find(r => r.concept_number === 3)?.image_url ?? "",
              detail2: conceptRows.find(r => r.concept_number === 4)?.image_url ?? "",
            };
          }
          metadata = parsed;
        }
      } catch { /* ignore */ }
    }

    if (!metadata) {
      metadata = {
        garmentType: "Sports Uniform", colorway: [], materials: [], features: [],
        logoPlacement: "", description: "",
        images: {
          front:   conceptRows.find(r => r.concept_number === 1)?.image_url ?? "",
          back:    conceptRows.find(r => r.concept_number === 2)?.image_url ?? "",
          detail1: conceptRows.find(r => r.concept_number === 3)?.image_url ?? "",
          detail2: conceptRows.find(r => r.concept_number === 4)?.image_url ?? "",
        },
      };
    }

    setBoardData({ teamName, orderNumber, metadata });
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  // ── Trigger generation ────────────────────────────────────────────────────

  const triggerGeneration = useCallback(async () => {
    if (generationFiredRef.current) return;
    generationFiredRef.current = true;

    setGen({ status: "queued", progress: 0, total: 4, error: null });

    const res = await fetch("/api/generate-concepts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ order_id }),
    });

    if (res.status === 409) {
      // Already running or already completed — just start/keep polling
      const body = await res.json();
      if (body.status === "already_completed") {
        await loadBoard();
        return;
      }
      // already_running → fall through to poll
    }

    // Start polling every 4 seconds regardless of POST outcome
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(pollStatus, 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id, pollStatus, loadBoard]);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const profile = await getProfile();
      if (cancelled) return;

      if (profile) {
        if (profile.role === "supplier") { router.replace("/supplier"); return; }
        if (profile.role === "admin") setIsAdminView(true);
      }

      // Check if a completed board already exists
      const alreadyDone = await loadBoard();
      if (cancelled) return;

      if (alreadyDone) {
        setGen(prev => ({ ...prev, status: "completed" }));
        return;
      }

      // Check if generation is already in progress
      const statusRes  = await fetch(`/api/generate-concepts/status?order_id=${order_id}`);
      const statusData = await statusRes.json() as GenerationProgress;
      if (cancelled) return;

      if (statusData.status === "generating" || statusData.status === "queued") {
        // Pick up an in-progress generation — just poll
        setGen(statusData);
        generationFiredRef.current = true; // prevent re-fire
        pollIntervalRef.current = setInterval(pollStatus, 4000);
      } else {
        // Nothing in progress — trigger fresh generation
        await triggerGeneration();
      }
    }

    init();

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  // ── Approve ───────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!boardData) return;
    setApproving(true);
    const { data: conceptRows } = await supabase
      .from("concepts").select("id, concept_number").eq("order_id", order_id);
    if (conceptRows) {
      await supabase.from("concepts").update({ selected: false }).eq("order_id", order_id);
      const target = conceptRows.find(r => r.concept_number === 1) ?? conceptRows[0];
      if (target) await supabase.from("concepts").update({ selected: true }).eq("id", target.id);
    }
    router.push(`/orders/${order_id}/approve`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const isGenerating = gen.status === "generating" || gen.status === "queued";
  const isFailed     = gen.status === "failed";
  const hasBoard     = !!boardData;

  return (
    <div className="min-h-screen bg-gs-dark flex flex-col">

      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">
            Admin View — Client Portal
          </span>
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
              {isGenerating
                ? "Our AI is designing your uniform — this usually takes 1–3 minutes."
                : hasBoard
                ? "Review your concept board below. Approve to move into production."
                : isFailed
                ? "Generation encountered an issue."
                : "Preparing your concept…"}
            </p>
          </div>

          {/* Generating / queued */}
          {isGenerating && <GeneratingState gen={gen} />}

          {/* Initial loading (before first status check) */}
          {!isGenerating && !hasBoard && !isFailed && (
            <div className="py-24 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Failed */}
          {isFailed && (
            <div className="py-20 flex flex-col items-center gap-5 text-center">
              <div className="w-12 h-12 rounded-xl border border-red-900/50 bg-red-900/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="text-gs-white font-barlow font-medium">Generation failed</p>
                {gen.error && (
                  <p className="text-xs text-red-400 font-barlow mt-1 max-w-sm">{gen.error}</p>
                )}
                <p className="text-xs text-gs-muted font-barlow mt-2">Please contact Grace Studios support to retry.</p>
              </div>
            </div>
          )}

          {/* Completed board */}
          {hasBoard && (
            <div className="space-y-5">
              <ProductBoard data={boardData!} />

              <div className="flex items-center justify-between pt-1">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    disabled
                    className="text-xs font-display uppercase tracking-wider text-gs-muted/40 cursor-not-allowed"
                  >
                    ↺ Regenerate
                  </button>
                  <span className="text-[9px] text-gs-muted/40 font-barlow max-w-[220px] leading-tight">
                    Regeneration coming soon. Current concept is locked for review.
                  </span>
                </div>

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

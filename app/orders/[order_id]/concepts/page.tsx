"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import GraceLogo from "@/components/GraceLogo";
import type { ConceptVariation, MultiConceptMetadata } from "@/app/api/generate-concepts/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type ConceptWithImages = ConceptVariation & {
  images: { front: string; back: string; detail1: string; detail2: string };
};

interface PageState {
  teamName: string;
  orderNumber: string;
  boards: ConceptWithImages[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColorSwatch({
  role, name, hex, pantone,
}: { role: string; name: string; hex: string; pantone?: string }) {
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

function BoardImage({
  url, alt, className,
}: { url?: string; alt: string; className?: string }) {
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

// ─── Product Board ────────────────────────────────────────────────────────────

function ProductBoard({
  board,
  boardNumber,
  teamName,
  orderNumber,
  selected,
  onSelect,
  approving,
}: {
  board: ConceptWithImages;
  boardNumber: number;
  teamName: string;
  orderNumber: string;
  selected: boolean;
  onSelect: () => void;
  approving: boolean;
}) {
  const { direction, garmentType, colorway, materials, features, logoPlacement, images } = board;

  const detailLabel1 = features[0]
    ? features[0].replace(/^[•\-–]\s*/, "").split(" ").slice(0, 5).join(" ")
    : "Logo & Collar";
  const detailLabel2 = features[1]
    ? features[1].replace(/^[•\-–]\s*/, "").split(" ").slice(0, 5).join(" ")
    : "Sleeve & Panel";

  return (
    <div
      className={`rounded-xl overflow-hidden border shadow-lg transition-all duration-200 ${
        selected
          ? "border-gray-800 ring-2 ring-gray-800 ring-offset-2 ring-offset-gs-dark"
          : "border-gray-300 hover:border-gray-400"
      }`}
      style={{ backgroundColor: "#f0ede6" }}
    >
      {/* ── Board header ── */}
      <div className="border-b border-gray-300 bg-white px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-400">
            Concept {String(boardNumber).padStart(2, "0")}
          </span>
          <span className="text-gray-300">—</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-700">
            {direction}
          </span>
        </div>
        <span className="text-[9px] font-mono text-gray-400 tracking-widest">{orderNumber}</span>
      </div>

      {/* ── Body: Left | Center | Right ── */}
      <div className="flex" style={{ minHeight: 540 }}>

        {/* LEFT: Spec metadata */}
        <div
          className="flex-shrink-0 border-r border-gray-300 flex flex-col"
          style={{ width: 210, backgroundColor: "#f8f6f1" }}
        >
          {/* Brand + team + garment */}
          <div className="px-5 pt-5 pb-4 border-b border-gray-200">
            <p className="text-[8px] uppercase tracking-[0.3em] text-gray-400 font-bold mb-1">
              Grace Athletics
            </p>
            <p className="text-base font-bold uppercase tracking-wider text-gray-900 leading-tight">
              {teamName}
            </p>
            <p className="text-[9px] uppercase tracking-[0.18em] text-gray-500 mt-1">
              {garmentType}
            </p>
          </div>

          {/* Colorway */}
          {colorway.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-200">
              <p className="text-[8px] uppercase tracking-[0.28em] text-gray-400 font-bold mb-3">
                Colorway
              </p>
              {colorway.map((c, i) => (
                <ColorSwatch key={i} {...c} />
              ))}
            </div>
          )}

          {/* Material */}
          {materials.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-200">
              <p className="text-[8px] uppercase tracking-[0.28em] text-gray-400 font-bold mb-2">
                Material
              </p>
              {materials.map((m, i) => (
                <p key={i} className="text-[9px] text-gray-600 leading-relaxed">{m}</p>
              ))}
            </div>
          )}

          {/* Features */}
          {features.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-200">
              <p className="text-[8px] uppercase tracking-[0.28em] text-gray-400 font-bold mb-2">
                Features
              </p>
              {features.map((f, i) => (
                <p key={i} className="text-[9px] text-gray-600 leading-snug mb-1">• {f}</p>
              ))}
            </div>
          )}

          {/* Logo */}
          {logoPlacement && (
            <div className="px-5 py-4">
              <p className="text-[8px] uppercase tracking-[0.28em] text-gray-400 font-bold mb-1.5">
                Logo
              </p>
              <p className="text-[9px] text-gray-600 capitalize leading-snug">
                {logoPlacement.replace(/_/g, " ")}
              </p>
            </div>
          )}
        </div>

        {/* CENTER: Front + Back renders */}
        <div className="flex-1 flex bg-[#0f0f0f]">
          <div className="flex-1 flex flex-col border-r border-white/5">
            <p className="text-[8px] uppercase tracking-[0.28em] text-white/25 text-center py-2.5 font-bold">
              Front
            </p>
            <BoardImage url={images.front} alt="Front view" className="flex-1" />
          </div>
          <div className="flex-1 flex flex-col">
            <p className="text-[8px] uppercase tracking-[0.28em] text-white/25 text-center py-2.5 font-bold">
              Back
            </p>
            <BoardImage url={images.back} alt="Back view" className="flex-1" />
          </div>
        </div>

        {/* RIGHT: Detail callout panels */}
        <div
          className="flex-shrink-0 border-l border-gray-300 flex flex-col divide-y divide-gray-200"
          style={{ width: 168, backgroundColor: "#f8f6f1" }}
        >
          <div className="flex-1 flex flex-col p-3">
            <p className="text-[7px] uppercase tracking-[0.22em] text-gray-400 font-bold mb-2 leading-tight">
              {detailLabel1}
            </p>
            <div className="flex-1 rounded overflow-hidden" style={{ minHeight: 120 }}>
              <BoardImage url={images.detail1} alt={detailLabel1} className="w-full h-full" />
            </div>
          </div>
          <div className="flex-1 flex flex-col p-3">
            <p className="text-[7px] uppercase tracking-[0.22em] text-gray-400 font-bold mb-2 leading-tight">
              {detailLabel2}
            </p>
            <div className="flex-1 rounded overflow-hidden" style={{ minHeight: 120 }}>
              <BoardImage url={images.detail2} alt={detailLabel2} className="w-full h-full" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer: disclaimer + select action ── */}
      <div className="border-t border-gray-300 bg-white/50 px-5 py-3 flex items-center justify-between gap-4">
        <p className="text-[8px] text-gray-400 italic leading-relaxed max-w-sm">
          AI concept is for visual direction only. Colors, proportions, and details are subject to change during production.
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="opacity-25">
            <GraceLogo className="h-4" />
          </div>
          <button
            type="button"
            onClick={onSelect}
            disabled={approving}
            className={`px-5 py-2 rounded-lg text-[10px] font-display font-bold uppercase tracking-[0.15em] transition-all duration-200 ${
              selected
                ? "bg-gray-900 text-white"
                : "border border-gray-400 text-gray-600 hover:border-gray-800 hover:text-gray-900"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {selected ? "✓ Selected" : "Select This Concept"}
          </button>
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

  const [pageState, setPageState]       = useState<PageState | null>(null);
  const [loading, setLoading]           = useState(true);
  const [generating, setGenerating]     = useState(false);
  const [selectedBoard, setSelectedBoard] = useState<number | null>(null); // 1-indexed
  const [approving, setApproving]       = useState(false);
  const [isAdminView, setIsAdminView]   = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ── Fetch board data ────────────────────────────────────────────────────────

  const fetchBoards = useCallback(async (): Promise<boolean> => {
    const { data: conceptRows } = await supabase
      .from("concepts")
      .select("id, concept_number, image_url, selected")
      .eq("order_id", order_id)
      .order("concept_number");

    if (!conceptRows || conceptRows.length === 0) return false;

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

    const clientData  = Array.isArray(orderRow?.clients) ? orderRow?.clients[0] : orderRow?.clients;
    const teamName    = (clientData as { name?: string })?.name ?? "Your Team";
    const orderNumber = orderRow?.order_number ?? order_id.slice(0, 8).toUpperCase();

    // ── Parse ai_prompt — handle multi-concept and legacy single formats ──────
    let boards: ConceptWithImages[] = [];

    if (briefRow?.ai_prompt) {
      try {
        const parsed = JSON.parse(briefRow.ai_prompt as string);

        if (Array.isArray(parsed.concepts) && parsed.concepts.length > 0) {
          // New multi-concept format
          const multi = parsed as MultiConceptMetadata;
          boards = multi.concepts.map((c) => ({
            ...c,
            images: c.images ?? { front: "", back: "", detail1: "", detail2: "" },
          }));
        } else if (typeof parsed.description === "string") {
          // Legacy single-concept format — wrap in a single board using concepts table images
          const front   = conceptRows.find((r) => r.concept_number === 1)?.image_url ?? "";
          const back    = conceptRows.find((r) => r.concept_number === 2)?.image_url ?? "";
          const detail1 = conceptRows.find((r) => r.concept_number === 3)?.image_url ?? "";
          const detail2 = conceptRows.find((r) => r.concept_number === 4)?.image_url ?? "";
          boards = [{
            ...parsed,
            direction: "Concept",
            images: { front, back, detail1, detail2 },
          }];
        }
      } catch {
        // ai_prompt unreadable — fall back to images from concepts table only
      }
    }

    // Last-resort fallback: build stub boards from concepts table
    if (boards.length === 0 && conceptRows.length > 0) {
      boards = conceptRows.map((row) => ({
        direction:     `Concept ${row.concept_number}`,
        garmentType:   "Sports Uniform",
        colorway:      [],
        materials:     [],
        features:      [],
        logoPlacement: "",
        description:   "",
        images: { front: row.image_url, back: "", detail1: "", detail2: "" },
      }));
    }

    // Restore any previously selected board
    const prevSelected = conceptRows.find((r) => r.selected);
    if (prevSelected) setSelectedBoard(prevSelected.concept_number);

    setPageState({ teamName, orderNumber, boards });
    setGenerating(false);
    setLoading(false);
    if (pollRef.current) clearInterval(pollRef.current);
    return true;
  }, [order_id, supabase]);

  // ── Trigger generation ──────────────────────────────────────────────────────

  async function triggerGeneration() {
    setGenerating(true);
    fetch("/api/generate-concepts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ order_id }),
    }).then(() => fetchBoards());
    pollRef.current = setInterval(fetchBoards, 5000);
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const profile = await getProfile();
      if (profile) {
        if (profile.role === "supplier") { router.replace("/supplier"); return; }
        if (profile.role === "admin") setIsAdminView(true);
      }
      const hasExisting = await fetchBoards();
      if (!hasExisting) {
        setLoading(false);
        await triggerGeneration();
      }
    }
    init();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  // ── Approve selected board ──────────────────────────────────────────────────

  async function handleApprove() {
    if (!selectedBoard) return;
    setApproving(true);

    const { data: conceptRows } = await supabase
      .from("concepts")
      .select("id, concept_number")
      .eq("order_id", order_id);

    if (conceptRows) {
      await supabase.from("concepts").update({ selected: false }).eq("order_id", order_id);
      const target = conceptRows.find((r) => r.concept_number === selectedBoard);
      if (target) await supabase.from("concepts").update({ selected: true }).eq("id", target.id);
    }

    router.push(`/orders/${order_id}/approve`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const hasBoards = !!pageState && pageState.boards.length > 0;

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
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">
            Home
          </a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">
            ← Back
          </button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-gs-muted hover:text-gs-gold transition-colors">
            Sign Out
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-8 pb-32">
        <div className="w-full max-w-5xl">

          {/* ── Page header ── */}
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-gs-white">
              Your Design Concepts
            </h1>
            <p className="mt-1.5 text-sm text-gs-muted font-barlow">
              {generating
                ? "Our AI is building your concept boards — this usually takes 1–3 minutes."
                : hasBoards
                ? `${pageState!.boards.length} design directions generated. Select the concept that best fits your vision, then approve.`
                : "Preparing your concepts…"}
            </p>
          </div>

          {/* ── Generating ── */}
          {generating && (
            <div className="py-24 flex flex-col items-center justify-center gap-5">
              <div className="relative w-16 h-16">
                <div className="w-16 h-16 border border-gs-border rounded-full" />
                <div className="absolute inset-0 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-gs-white font-barlow font-medium">Building your concept boards</p>
                <p className="text-xs text-gs-muted font-barlow">
                  AI generating 4 design directions · Front, back & detail renders for each
                </p>
              </div>
              <p className="text-[10px] text-gs-muted font-barlow mt-4 text-center max-w-xs">
                Your boards will appear here automatically. You can leave and come back.
              </p>
            </div>
          )}

          {/* ── Loading ── */}
          {loading && !generating && (
            <div className="py-24 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-gs-gold border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* ── No boards ── */}
          {!loading && !generating && !hasBoards && (
            <div className="py-20 flex flex-col items-center gap-5 text-center">
              <div className="w-12 h-12 rounded-xl border border-gs-border flex items-center justify-center">
                <svg className="w-5 h-5 text-gs-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-gs-white font-barlow font-medium">No concepts generated yet</p>
                <p className="text-xs text-gs-muted font-barlow mt-1">
                  Generation may still be in progress or encountered an issue.
                </p>
              </div>
            </div>
          )}

          {/* ── 4 Concept boards ── */}
          {!loading && !generating && hasBoards && (
            <div className="space-y-10">
              {pageState!.boards.map((board, i) => (
                <ProductBoard
                  key={i}
                  board={board}
                  boardNumber={i + 1}
                  teamName={pageState!.teamName}
                  orderNumber={pageState!.orderNumber}
                  selected={selectedBoard === i + 1}
                  onSelect={() => setSelectedBoard(i + 1)}
                  approving={approving}
                />
              ))}
            </div>
          )}

        </div>
      </main>

      {/* ── Sticky approval bar — appears once a concept is selected ── */}
      {hasBoards && !generating && (
        <div
          className={`fixed bottom-0 left-0 right-0 border-t border-gs-border bg-gs-dark/95 backdrop-blur px-6 py-4 flex items-center justify-between transition-all duration-300 ${
            selectedBoard ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
          }`}
        >
          <div>
            {selectedBoard && (
              <>
                <p className="text-xs font-display font-bold uppercase tracking-widest text-gs-gold">
                  Concept {String(selectedBoard).padStart(2, "0")} — {pageState?.boards[selectedBoard - 1]?.direction} Selected
                </p>
                <p className="text-[10px] text-gs-muted font-barlow mt-0.5">
                  Approving will lock this design and move it into production.
                </p>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              disabled
              className="text-[10px] font-display uppercase tracking-wider text-gs-muted/40 cursor-not-allowed"
              title="Regeneration not available at this stage"
            >
              ↺ Regeneration coming soon
            </button>

            <button
              type="button"
              onClick={handleApprove}
              disabled={!selectedBoard || approving}
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
  );
}

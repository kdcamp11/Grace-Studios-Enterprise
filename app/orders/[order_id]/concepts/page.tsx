"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import TenantLogo from "@/components/TenantLogo"; // kept for studio watermarks
import OrgLogo from "@/components/OrgLogo";
import MobileDropdown from "@/components/MobileDropdown";
import { useTenant } from "@/lib/tenant/context";
import type { DesignMetadata, GenerationStatus } from "@/app/api/generate-concepts/route";
import { RendersBoard, RenderImage, ColorSwatch, type BoardData } from "@/components/concepts/RendersBoard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerationProgress {
  status:       GenerationStatus | "not_started";
  progress:     number;
  total:        number;
  error:        string | null;
  boardFormat?: "specboard" | "multiview" | "renders";
}

// ─── Generating state UI ──────────────────────────────────────────────────────

const STEP_LABELS = [
  "Analyzing brief & design references",
  "Rendering front jersey",
  "Rendering back jersey",
  "Rendering front shorts",
  "Rendering back shorts",
];

function GeneratingState({ gen }: { gen: GenerationProgress }) {
  // progress 0 = queued/analyzing, 1–4 = renders complete
  const total     = gen.total ?? 4;
  const completed = gen.progress ?? 0;

  // percentage: queued = 5%, each render adds ~22%
  const pct = gen.status === "queued"
    ? 5
    : Math.round(5 + (completed / total) * 90);

  const stepIndex = gen.status === "queued" ? 0 : Math.min(completed + 1, STEP_LABELS.length - 1);
  const label     = STEP_LABELS[stepIndex] ?? STEP_LABELS[0];

  return (
    <div className="py-20 flex flex-col items-center justify-center gap-6 max-w-sm mx-auto text-center">
      <div className="relative w-16 h-16">
        <div className="w-16 h-16 border border-brand-border rounded-full" />
        <div className="absolute inset-0 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>

      <div className="space-y-1">
        <p className="text-brand-text font-barlow font-medium">Building your concept board</p>
        <p className="text-xs text-brand-primary font-display uppercase tracking-widest">{label}</p>
        {completed > 0 && (
          <p className="text-xs text-brand-muted font-barlow">
            {completed} of {total} renders complete
          </p>
        )}
        {gen.status === "generating" && completed === 0 && (
          <p className="text-xs text-brand-muted font-barlow">
            Generating garment renders, takes 2–3 minutes
          </p>
        )}
      </div>

      <div className="w-full bg-brand-border rounded-full h-0.5 overflow-hidden">
        <div
          className="h-full bg-brand-primary transition-all duration-1000 ease-out rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="text-[10px] text-brand-muted font-barlow">
        You can leave and come back. Your board saves automatically.
      </p>
    </div>
  );
}

// ─── Spec board (renders format) lives in @/components/concepts/RendersBoard ───


// ─── Legacy boards (backward compat) ─────────────────────────────────────────

function BoardImage({ url, alt, className }: { url?: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error,  setError]  = useState(false);
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

// ─── Premium single spec-board display (current format) ──────────────────────

function SpecBoardDisplay({ data }: { data: BoardData }) {
  const { teamName, orderNumber, metadata } = data;
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError,  setImgError]  = useState(false);

  const imageUrl = metadata.boardImage ?? metadata.images?.front ?? "";

  return (
    <div className="rounded-xl overflow-hidden border border-gray-300 shadow-xl">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-5 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-px h-5 bg-gray-800" />
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-400">
            Concept Board
          </span>
        </div>
        <span className="text-[9px] font-mono text-gray-300 tracking-widest">{orderNumber}</span>
      </div>

      {/* Full-width spec-board image */}
      <div className="relative bg-[#f0ede6]" style={{ minHeight: 320 }}>
        {!imgLoaded && !imgError && (
          <div className="absolute inset-0 animate-pulse bg-[#e8e5de]" />
        )}
        {imgError ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-gray-400 text-sm font-barlow">Image unavailable</p>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${teamName} spec board`}
            className={`w-full block transition-opacity duration-500 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgError(true); setImgLoaded(true); }}
          />
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 bg-white px-5 py-2.5 flex items-center justify-between">
        <p className="text-[7px] text-gray-400 italic leading-relaxed max-w-lg">
          AI concept is for visual direction only. Colors, proportions, and details are subject to
          refinement during production. Logos are composited separately.
        </p>
        <div className="flex-shrink-0 ml-4 opacity-20">
          <TenantLogo className="h-4" />
        </div>
      </div>
    </div>
  );
}

// ─── Legacy boards (backward compat) ─────────────────────────────────────────

function LegacyBoard({ data, studioName }: { data: BoardData; studioName?: string }) {
  const { metadata, teamName, orderNumber } = data;
  const isSingleImage = metadata.boardFormat === "specboard" || !!metadata.boardImage;

  if (isSingleImage) {
    const imageUrl = metadata.boardImage ?? metadata.images?.front ?? "";
    return (
      <div className="rounded-xl overflow-hidden border border-gray-300 shadow-lg">
        <div className="border-b border-gray-300 bg-white px-5 py-2.5 flex items-center justify-between">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-500">Concept Board</span>
          <span className="text-[9px] font-mono text-gray-400 tracking-widest">{orderNumber}</span>
        </div>
        <div className="relative bg-[#f0ede6]" style={{ minHeight: 300 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`${teamName} spec board`} className="w-full block" />
        </div>
        <div className="border-t border-gray-300 bg-white/60 px-5 py-2.5 flex items-center justify-between">
          <p className="text-[8px] text-gray-400 italic max-w-lg">
            AI concept is for visual direction only. Colors and details subject to change.
          </p>
          <div className="flex-shrink-0 ml-4 opacity-25"><TenantLogo className="h-4" /></div>
        </div>
      </div>
    );
  }

  // Old 4-image multiview
  const images      = metadata.images;
  const colorway    = metadata.colorway ?? [];
  const materials   = metadata.materials ?? [];
  const features    = metadata.features ?? [];
  const garmentType = metadata.garmentType ?? "Sports Uniform";

  return (
    <div className="rounded-xl overflow-hidden border border-gray-300 shadow-lg" style={{ backgroundColor: "#f0ede6" }}>
      <div className="border-b border-gray-300 bg-white px-5 py-2.5 flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-gray-500">AI Concept</span>
        <span className="text-[9px] font-mono text-gray-400 tracking-widest">{orderNumber}</span>
      </div>
      <div className="flex" style={{ minHeight: 540 }}>
        <div className="flex-shrink-0 border-r border-gray-300 flex flex-col" style={{ width: 210, backgroundColor: "#f8f6f1" }}>
          <div className="px-5 pt-5 pb-4 border-b border-gray-200">
            <p className="text-[8px] uppercase tracking-[0.3em] text-gray-400 font-bold mb-1">{studioName ?? "Custom Sportswear"}</p>
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
            <div className="px-5 py-4">
              <p className="text-[8px] uppercase tracking-[0.28em] text-gray-400 font-bold mb-2">Features</p>
              {features.map((f, i) => <p key={i} className="text-[9px] text-gray-600 leading-snug mb-1">• {f}</p>)}
            </div>
          )}
        </div>
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
      </div>
      <div className="border-t border-gray-300 bg-white/50 px-5 py-2.5 flex items-center justify-between">
        <p className="text-[8px] text-gray-400 italic max-w-lg">AI concept for visual direction only. Details subject to change.</p>
        <div className="flex-shrink-0 ml-4 opacity-25"><TenantLogo className="h-4" /></div>
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
  const tenant        = useTenant();

  const [boardData, setBoardData]     = useState<BoardData | null>(null);
  const [gen, setGen]                 = useState<GenerationProgress>({ status: "not_started", progress: 0, total: 4, error: null });
  const [approving, setApproving]       = useState(false);
  const [confirmStep, setConfirmStep]   = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [declineStep, setDeclineStep]   = useState(false);
  const [declineNote, setDeclineNote]   = useState("");
  const [declining, setDeclining]       = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false);
  const [feePaid, setFeePaid]         = useState<boolean | null>(null); // null = loading
  const [isBuilderOrder, setIsBuilderOrder] = useState(false);

  const generationFiredRef = useRef(false);
  const pollIntervalRef    = useRef<NodeJS.Timeout | null>(null);

  // ── Poll status ───────────────────────────────────────────────────────────

  const pollStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/generate-concepts/status?order_id=${order_id}`);
      const data = await res.json() as GenerationProgress;
      setGen(data);
      if (data.status === "completed") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        await loadBoard();
      } else if (data.status === "failed") {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      }
    } catch { /* network blip — keep polling */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  // ── Load board from DB (via admin API to bypass RLS) ─────────────────────

  const loadBoard = useCallback(async (): Promise<boolean> => {
    let res: Response;
    try {
      res = await fetch(`/api/portal/board-data?order_id=${order_id}`);
    } catch {
      return false;
    }
    if (!res.ok) return false;

    const { brief: briefRow, conceptRows, order: orderRow } =
      await res.json() as {
        brief: { ai_prompt?: string; logo_urls?: unknown; logo_placement?: string } | null;
        conceptRows: { concept_number: number; image_url: string }[];
        order: { order_number?: string; clients?: { name?: string } | { name?: string }[] } | null;
      };

    let metadata: DesignMetadata | null = null;

    if (briefRow?.ai_prompt) {
      try {
        const parsed = JSON.parse(briefRow.ai_prompt as string) as DesignMetadata;
        // Show the design whenever a finished render actually exists — don't
        // gate on the status flag. A later failed re-run (e.g. OpenAI billing
        // limit) merge-patches status to "failed" while leaving the original
        // renders intact, so the concepts are still valid and viewable.
        const hasRenders   = !!parsed.renders?.frontJersey;
        const hasBoardImage = !!parsed.boardImage;
        if (parsed.status === "completed" || hasRenders || hasBoardImage) {
          metadata = parsed;
        }
      } catch { /* ignore */ }
    }

    // Legacy fallback: concepts table (old multiview format)
    if (!metadata) {
      if (!conceptRows || conceptRows.length === 0) return false;

      const findUrl = (n: number) => conceptRows.find(r => r.concept_number === n)?.image_url ?? "";

      if (conceptRows.length >= 4) {
        // New renders format stored in concepts table (4 rows)
        metadata = {
          garmentType:   "Sports Uniform",
          boardFormat:   "renders",
          colorway:      [],
          materials:     [],
          features:      [],
          logoPlacement: "",
          description:   "",
          renders: {
            frontJersey: findUrl(1),
            backJersey:  findUrl(2),
            frontShorts: findUrl(3),
            backShorts:  findUrl(4),
          },
        };
      } else {
        // Old 2-image multiview
        metadata = {
          garmentType:   "Sports Uniform",
          boardFormat:   "multiview",
          colorway:      [],
          materials:     [],
          features:      [],
          logoPlacement: "",
          description:   "",
          images: {
            front:   findUrl(1),
            back:    findUrl(2),
            detail1: findUrl(3),
            detail2: findUrl(4),
          },
        };
      }
    }

    const clientData  = Array.isArray(orderRow?.clients) ? orderRow?.clients[0] : orderRow?.clients;
    const teamName    = (clientData as { name?: string })?.name ?? "Your Team";
    const orderNumber = orderRow?.order_number ?? order_id.slice(0, 8).toUpperCase();

    // Extract exact uploaded logos from the brief — composited by the app, not the AI
    const logoUrls: string[] = Array.isArray(briefRow?.logo_urls)
      ? (briefRow.logo_urls as unknown[]).filter((u): u is string => typeof u === "string" && u.startsWith("http"))
      : [];

    const gsLogoPlacement = (briefRow?.logo_placement as string | null) ?? "chest";

    setBoardData({ teamName, orderNumber, metadata, logoUrls, gsLogoPlacement });
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  // ── Trigger generation ────────────────────────────────────────────────────

  const triggerGeneration = useCallback(async (force = false) => {
    if (generationFiredRef.current) return;
    generationFiredRef.current = true;
    setGen({ status: "queued", progress: 0, total: 4, error: null });

    const res = await fetch("/api/generate-concepts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ order_id, ...(force ? { force: true } : {}) }),
    });

    if (res.status === 409) {
      const body = await res.json();
      if (body.status === "already_completed") {
        // Previous generation is done — reload the board and clear the spinner.
        await loadBoard();
        setGen(prev => ({ ...prev, status: "completed" }));
        return;
      }
      // already_running — just start polling
    } else if (!res.ok) {
      // Show a real error rather than an infinite spinner
      let errMsg = "Concept generation failed. Please try again.";
      try {
        const body = await res.json() as { error?: string };
        if (body.error) errMsg = body.error;
      } catch { /* ignore */ }
      if (res.status === 429) errMsg = "Too many requests. Please wait a few minutes and try again.";
      setGen({ status: "failed", progress: 0, total: 4, error: errMsg });
      generationFiredRef.current = false; // allow retry
      return;
    }

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(pollStatus, 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id, pollStatus, loadBoard]);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Ensure localStorage→cookie session migration is complete before any
      // auth-gated fetch (generate-concepts, status) — prevents silent 401s
      await sessionReady();
      const profile = await getProfile();
      if (cancelled) return;
      if (profile) {
        if (profile.role === "supplier") { router.replace("/supplier"); return; }
        if (profile.role === "admin") setIsAdminView(true);
      }

      // Check payment status and order kind via service-role API
      const infoRes  = await fetch(`/api/orders/info?orderId=${order_id}`);
      if (!cancelled && infoRes.ok) {
        const info = await infoRes.json() as { design_fee_paid: boolean; concept_source?: string; is_builder?: boolean };
        setFeePaid(info.design_fee_paid);
        setIsBuilderOrder(info.is_builder ?? info.concept_source === "client_provided");
      } else if (!cancelled) {
        setFeePaid(false);
      }

      const alreadyDone = await loadBoard();
      if (cancelled) return;

      if (alreadyDone) {
        setGen(prev => ({ ...prev, status: "completed" }));
        return;
      }

      // Is there a brief at all for this order? An order can be created (stage
      // "creative_started") before any design exists — e.g. the user filled in
      // Team Info then abandoned before choosing/finishing a design path. Such
      // orders have NO brief row, so there's nothing to generate or display.
      // Send them back to choose a design path (reusing this order) rather than
      // showing "Generation failed / Brief not found".
      const boardRes = await fetch(`/api/portal/board-data?order_id=${order_id}`);
      if (!cancelled && boardRes.ok) {
        const { brief: briefRow } = await boardRes.json() as { brief: unknown };
        if (!briefRow) {
          router.replace(`/brief/${order_id}/choose`);
          return;
        }
      }

      const statusRes  = await fetch(`/api/generate-concepts/status?order_id=${order_id}`);
      const statusData = await statusRes.json() as GenerationProgress;
      if (cancelled) return;

      // Drive purely off the persisted generation status. Only auto-start
      // generation when this order has NEVER been generated — never re-run for
      // a "completed" order (viewing should show existing concepts) or a
      // "failed" one (the user retries explicitly via Regenerate).
      if (statusData.status === "generating" || statusData.status === "queued") {
        setGen(statusData);
        generationFiredRef.current = true;
        pollIntervalRef.current = setInterval(pollStatus, 5000);
      } else if (statusData.status === "completed") {
        // Concepts exist but loadBoard didn't surface them (transient fetch
        // issue). Retry the load — do NOT regenerate.
        generationFiredRef.current = true; // guard against any later auto-trigger
        const ok = await loadBoard();
        if (cancelled) return;
        setGen(prev => ({ ...prev, status: ok ? "completed" : "failed",
          error: ok ? null : "Couldn't load your concepts. Please refresh." }));
      } else if (statusData.status === "failed") {
        // Surface the failure with a manual retry — don't silently re-run.
        setGen(statusData.error ? statusData : { ...statusData, status: "failed",
          error: "Concept generation failed. Please try again." });
      } else {
        // not_started — genuine first run.
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

  // ── Regenerate ────────────────────────────────────────────────────────────
  async function handleRegenerate() {
    if (regenerating || approving || declining) return;
    setRegenerating(true);
    setBoardData(null);
    setGen({ status: "not_started", progress: 0, total: 4, error: null });
    generationFiredRef.current = false;
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    await triggerGeneration(true);
    setRegenerating(false);
  }

  // ── Decline ───────────────────────────────────────────────────────────────
  async function handleConfirmDecline() {
    setDeclining(true);
    setDeclineError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/decline-concept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ order_id, note: declineNote || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Decline failed (${res.status})`);
      }
      // Reset UI to regeneration state
      setDeclineStep(false);
      setDeclineNote("");
      setBoardData(null);
      setGen({ status: "not_started", progress: 0, total: 4, error: null });
      generationFiredRef.current = false;
    } catch (err: unknown) {
      setDeclineError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setDeclining(false);
    }
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  function handleApprove() {
    if (!boardData) return;
    setConfirmStep(true);
    setApproveError(null);
  }

  async function handleConfirmApprove() {
    setApproving(true);
    setApproveError(null);
    try {
      // Mark the concept as selected (best-effort, don't block on failure)
      const boardRes = await fetch(`/api/portal/board-data?order_id=${order_id}`);
      if (boardRes.ok) {
        const { conceptRows } = await boardRes.json() as {
          conceptRows: { id: string; concept_number: number; image_url: string }[];
        };
        const target = conceptRows?.find(r => r.concept_number === 1) ?? conceptRows?.[0];
        if (target?.id) {
          await fetch(`/api/orders/${order_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "select_concept", concept_id: target.id }),
          }).catch(() => {});
        }
      }

      // Call approve-order directly — no separate page needed
      const { data: { session } } = await supabase.auth.getSession();
      const approveRes = await fetch("/api/approve-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ order_id }),
      });

      if (!approveRes.ok) {
        const body = await approveRes.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Approval failed (${approveRes.status})`);
      }

      // Success — go to tracker
      router.push(`/orders/${order_id}/tracker`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setApproveError(msg);
      setApproving(false);
      setConfirmStep(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const isGenerating = gen.status === "generating" || gen.status === "queued";
  const isFailed     = gen.status === "failed";
  const hasBoard     = !!boardData;

  // Board format routing
  // "renders" is now the current format. "specboard" and "multiview" are legacy.
  const boardFormat = boardData?.metadata.boardFormat;
  const isRenders   = boardFormat === "renders" || (!boardFormat && !!boardData?.metadata.renders);
  const isSpecBoard = !isRenders && (boardFormat === "specboard" || (!boardFormat && !!boardData?.metadata.boardImage));

  // Payment gate: admin always sees full board; clients need feePaid === true
  const paymentGated = !isAdminView && feePaid === false;

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {isAdminView && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-xs font-display font-bold uppercase tracking-widest text-amber-700">
            Admin View: Client Portal
          </span>
        </div>
      )}

      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <OrgLogo href="/portal" />
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Client Portal
          </a>
        </div>
        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
        {/* Mobile nav */}
        <div className="lg:hidden">
          <MobileDropdown
            groups={[
              [{ label: "Home", href: "/portal" }, { label: "← Back", onClick: () => router.back() }],
              [{ label: "Sign Out", onClick: signOut }],
            ]}
          />
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-5xl">

          <div className="mb-7">
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text">
              Your Design Concept
            </h1>
            <p className="mt-1.5 text-sm text-brand-muted font-barlow">
              {isGenerating
                ? "Our AI is building your spec board from your design brief. This takes 60–90 seconds."
                : hasBoard
                ? "Review your concept board. Approve to move into production."
                : isFailed
                ? "Generation encountered an issue."
                : "Preparing your concept…"}
            </p>
          </div>

          {/* Generating / queued */}
          {isGenerating && <GeneratingState gen={gen} />}

          {/* Initial loading */}
          {!isGenerating && !hasBoard && !isFailed && (
            <div className="py-24 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
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
                <p className="text-brand-text font-barlow font-medium">Generation failed</p>
                {gen.error && <p className="text-xs text-red-400 font-barlow mt-1 max-w-sm">{gen.error}</p>}
                <p className="text-xs text-brand-muted font-barlow mt-2">Try again, or contact {tenant.name} support if it keeps failing.</p>
              </div>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="px-6 py-2.5 rounded-lg font-display font-bold text-xs uppercase tracking-widest border border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white disabled:opacity-50 transition-colors"
              >
                {regenerating ? "Retrying…" : "↺ Try Again"}
              </button>
            </div>
          )}

          {/* Board display */}
          {hasBoard && (
            <div className="space-y-5">

              {/* ── Payment teaser: front image + 3 locked ──────────────────── */}
              {paymentGated && isRenders && boardData?.metadata.renders && (
                <div className="space-y-4">
                  {/* Teaser header */}
                  <div className="rounded-xl border border-brand-primary/20 bg-brand-surface px-5 py-4 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-display font-bold uppercase tracking-wider text-brand-text">
                        Your design is ready
                      </p>
                      <p className="text-[10px] text-brand-muted font-barlow mt-0.5">
                        Pay the design deposit to unlock all 4 views and approve for production.
                      </p>
                    </div>
                    <a
                      href={`/orders/${order_id}/checkout`}
                      className="flex-shrink-0 px-5 py-2.5 rounded-xl font-display font-bold text-xs uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-all whitespace-nowrap"
                    >
                      Unlock →
                    </a>
                  </div>

                  {/* Front jersey — visible preview */}
                  <div className="rounded-xl overflow-hidden border border-gray-200 shadow-lg bg-gray-50">
                    <div className="border-b border-gray-100 bg-white px-4 py-2 flex items-center justify-between">
                      <span className="text-[8px] font-bold uppercase tracking-[0.28em] text-gray-400">Preview: Front View</span>
                      <span className="text-[8px] font-mono text-gray-300">{boardData.orderNumber}</span>
                    </div>
                    <RenderImage
                      url={boardData.metadata.renders?.frontJersey}
                      alt="Front view preview"
                      className="w-full"
                      style={{ height: "min(60vw, 420px)" }}
                    />
                  </div>

                  {/* Locked grid — 3 blurred placeholders */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: "Back View" },
                      { label: "Front Shorts / Pants" },
                      { label: "Back Shorts / Pants" },
                    ].map(({ label }) => (
                      <div
                        key={label}
                        className="relative rounded-xl overflow-hidden border border-brand-border bg-brand-surface aspect-square flex items-center justify-center"
                      >
                        {/* Blurred preview using front jersey as placeholder texture */}
                        <div
                          className="absolute inset-0 bg-cover bg-center"
                          style={{
                            backgroundImage: boardData.metadata.renders?.frontJersey
                              ? `url(${boardData.metadata.renders.frontJersey})`
                              : undefined,
                            filter: "blur(14px) brightness(0.35)",
                            transform: "scale(1.1)",
                          }}
                        />
                        <div className="relative z-10 flex flex-col items-center gap-2">
                          <svg className="w-6 h-6 text-brand-muted/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                          </svg>
                          <span className="text-[8px] font-display uppercase tracking-wider text-brand-muted/60">{label}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <a
                    href={`/orders/${order_id}/checkout`}
                    className="block w-full py-4 rounded-xl text-center font-display font-bold text-sm uppercase tracking-[0.15em]
                      bg-brand-primary text-white hover:bg-brand-secondary transition-all duration-200
                      shadow-[0_4px_24px_rgba(212,175,55,0.2)] hover:shadow-[0_4px_32px_rgba(212,175,55,0.35)]"
                  >
                    Activate Your Project →
                  </a>
                </div>
              )}

              {/* ── Full board: paid or non-renders format ───────────────────── */}
              {(!paymentGated || !isRenders) && (
                <>
                  {isSpecBoard  ? <SpecBoardDisplay data={boardData!} />
                   : isRenders   ? <RendersBoard     data={boardData!} studioName={tenant.name} isBuilder={isBuilderOrder} />
                   :               <LegacyBoard      data={boardData!} studioName={tenant.name} />
                  }

                  {/* ── Action section ────────────────────────────────── */}

                  {/* Error messages */}
                  {approveError && (
                    <p className="text-xs text-red-400 font-barlow bg-red-950/30 border border-red-800 rounded-xl px-4 py-3">
                      {approveError}
                    </p>
                  )}
                  {declineError && (
                    <p className="text-xs text-red-400 font-barlow bg-red-950/30 border border-red-800 rounded-xl px-4 py-3">
                      {declineError}
                    </p>
                  )}

                  {/* Approve confirmation */}
                  {confirmStep && (
                    <div className="rounded-xl border border-brand-primary/40 bg-brand-surface px-5 py-4 flex flex-col gap-3">
                      <p className="text-sm font-barlow text-brand-text font-medium">
                        Ready to approve this design and move into production?
                      </p>
                      <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                        Once approved, your studio will begin production. This cannot be undone.
                      </p>
                      <div className="flex gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => { setConfirmStep(false); setApproveError(null); }}
                          disabled={approving}
                          className="px-8 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200 border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted disabled:opacity-40"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmApprove}
                          disabled={approving}
                          className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200 bg-brand-primary text-white hover:bg-brand-secondary disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {approving ? "Approving…" : "Yes, Approve →"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Decline confirmation */}
                  {declineStep && (
                    <div className="rounded-xl border border-red-800/40 bg-red-950/10 px-5 py-4 flex flex-col gap-3">
                      <p className="text-sm font-barlow text-brand-text font-medium">
                        Request revisions on this design?
                      </p>
                      <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                        Your studio will be notified and can revise or regenerate the concept.
                      </p>
                      <textarea
                        value={declineNote}
                        onChange={(e) => setDeclineNote(e.target.value)}
                        rows={2}
                        placeholder="Describe what you'd like changed (optional)…"
                        className="w-full bg-brand-bg border border-brand-border rounded-lg px-3 py-2.5 text-brand-text font-barlow text-sm placeholder-brand-muted/50 focus:outline-none focus:border-red-600 transition-colors resize-none"
                      />
                      <div className="flex gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => { setDeclineStep(false); setDeclineNote(""); setDeclineError(null); }}
                          disabled={declining}
                          className="px-8 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200 border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted disabled:opacity-40"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleConfirmDecline}
                          disabled={declining}
                          className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200 bg-red-700 text-white hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {declining ? "Sending…" : "Yes, Request Revisions →"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 1 — main action row (hidden while a confirm step is open) */}
                  {!confirmStep && !declineStep && (
                    <div className="flex items-center gap-3 pt-1 flex-wrap">
                      {/* Regenerate — hidden for builder orders */}
                      {!isBuilderOrder && (
                        <button
                          type="button"
                          onClick={handleRegenerate}
                          disabled={regenerating || approving || declining}
                          className="px-8 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                            border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-primary
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {regenerating ? "Regenerating…" : "↺ Regenerate"}
                        </button>
                      )}

                      {/* Decline — builder goes back to jersey builder; AI opens revision flow */}
                      {isBuilderOrder ? (
                        <button
                          type="button"
                          onClick={() => router.push(`/jersey-builder?orderId=${order_id}`)}
                          disabled={approving}
                          className="px-8 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                            border border-red-800/50 text-red-400 hover:bg-red-900/20 hover:border-red-600
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Decline This Design
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setDeclineStep(true); setDeclineError(null); }}
                          disabled={approving || declining || regenerating}
                          className="px-8 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                            border border-red-800/50 text-red-400 hover:bg-red-900/20 hover:border-red-600
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Decline This Design
                        </button>
                      )}

                      {/* Approve */}
                      <button
                        type="button"
                        onClick={handleApprove}
                        disabled={approving || declining || regenerating}
                        className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                          bg-brand-primary text-white hover:bg-brand-secondary
                          disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Approve This Design →
                      </button>
                    </div>
                  )}
                </>
              )}

            </div>
          )}

        </div>
      </main>
    </div>
  );
}

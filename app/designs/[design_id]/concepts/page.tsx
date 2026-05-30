"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";
import MobileDropdown from "@/components/MobileDropdown";
import { useTenant } from "@/lib/tenant/context";
import type { DesignMetadata, GenerationStatus } from "@/app/api/generate-concepts/route";
import { RendersBoard } from "@/components/concepts/RendersBoard";

/**
 * /designs/[design_id]/concepts
 *
 * Pre-payment concept view for the AI brief flow. After the brief is submitted,
 * concept generation runs against the DESIGN (no order exists yet). This page
 * shows live generation progress, then a locked teaser preview (front view +
 * 3 blurred views) with a "Creative Activation — $149" CTA that routes to the
 * design-keyed checkout. After payment, the Stripe webhook mints a real order
 * and the activated bridge redirects to /orders/[order_id]/concepts where the
 * full unlocked board is shown.
 */

interface GenerationProgress {
  status:       GenerationStatus | "not_started";
  progress:     number;
  total:        number;
  error:        string | null;
  boardFormat?: "specboard" | "multiview" | "renders";
}

interface BoardData {
  teamName:    string;
  orderNumber: string;
  metadata:    DesignMetadata;
  logoUrls:    string[];
}

const STEP_LABELS = [
  "Analyzing brief & design references",
  "Rendering front jersey",
  "Rendering back jersey",
  "Rendering front shorts",
  "Rendering back shorts",
];

function GeneratingState({ gen }: { gen: GenerationProgress }) {
  const total     = gen.total ?? 4;
  const completed = gen.progress ?? 0;
  const pct       = gen.status === "queued" ? 5 : Math.round(5 + (completed / total) * 90);
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
          <p className="text-xs text-brand-muted font-barlow">{completed} of {total} renders complete</p>
        )}
        {gen.status === "generating" && completed === 0 && (
          <p className="text-xs text-brand-muted font-barlow">Generating garment renders, takes 2–3 minutes</p>
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

export default function DesignConceptsPage() {
  const { design_id } = useParams<{ design_id: string }>();
  const router        = useRouter();
  const supabaseRef   = useRef(createClient());
  const supabase      = supabaseRef.current;
  const tenant        = useTenant();

  const [boardData, setBoardData] = useState<BoardData | null>(null);
  const [gen, setGen]             = useState<GenerationProgress>({ status: "not_started", progress: 0, total: 4, error: null });

  const [regenerating, setRegenerating] = useState(false);
  const [confirmStep, setConfirmStep]   = useState(false);
  const [declineStep, setDeclineStep]   = useState(false);
  const [declineNote, setDeclineNote]   = useState("");
  const [declining, setDeclining]       = useState(false);
  const [actionError, setActionError]   = useState<string | null>(null);

  const generationFiredRef = useRef(false);
  const pollIntervalRef    = useRef<NodeJS.Timeout | null>(null);

  // ── Load board from DB (via admin API to bypass RLS) ──────────────────────
  const loadBoard = useCallback(async (): Promise<boolean> => {
    let res: Response;
    try {
      res = await fetch(`/api/portal/board-data?design_id=${design_id}`);
    } catch {
      return false;
    }
    if (!res.ok) return false;

    const { brief: briefRow, conceptRows, order: designRow } =
      await res.json() as {
        brief: { ai_prompt?: string; logo_urls?: unknown } | null;
        conceptRows: { concept_number: number; image_url: string }[];
        order: { clients?: { name?: string } | { name?: string }[] } | null;
      };

    let metadata: DesignMetadata | null = null;

    if (briefRow?.ai_prompt) {
      try {
        const parsed = JSON.parse(briefRow.ai_prompt as string) as DesignMetadata;
        const hasRenders = !!parsed.renders?.frontJersey;
        if (parsed.status === "completed" || hasRenders) metadata = parsed;
      } catch { /* ignore */ }
    }

    // Fallback: concepts table (renders stored as 4 rows)
    if (!metadata && conceptRows && conceptRows.length >= 4) {
      const findUrl = (n: number) => conceptRows.find(r => r.concept_number === n)?.image_url ?? "";
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
    }

    if (!metadata) return false;

    const clientData = Array.isArray(designRow?.clients) ? designRow?.clients[0] : designRow?.clients;
    const teamName   = (clientData as { name?: string })?.name ?? "Your Team";

    const logoUrls: string[] = Array.isArray(briefRow?.logo_urls)
      ? (briefRow.logo_urls as unknown[]).filter((u): u is string => typeof u === "string" && u.startsWith("http"))
      : [];

    const orderNumber = design_id.slice(0, 8).toUpperCase();

    setBoardData({ teamName, orderNumber, metadata, logoUrls });
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design_id]);

  // ── Poll status ───────────────────────────────────────────────────────────
  const pollStatus = useCallback(async () => {
    try {
      const res  = await fetch(`/api/generate-concepts/status?design_id=${design_id}`);
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
  }, [design_id]);

  // ── Trigger generation ────────────────────────────────────────────────────
  const triggerGeneration = useCallback((force = false) => {
    if (generationFiredRef.current) return;
    generationFiredRef.current = true;
    setGen({ status: "queued", progress: 0, total: 4, error: null });

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    // Fire the generation request without blocking — it can take 2–3 min.
    // Polling starts immediately so progress updates appear during generation.
    fetch("/api/generate-concepts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ design_id, ...(force ? { force: true } : {}) }),
    }).then(async (res) => {
      if (res.status === 409) {
        const body = await res.json() as { status?: string };
        if (body.status === "already_completed") {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          await loadBoard();
        }
        // already_running: polling already handles it
      } else if (!res.ok) {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        let errMsg = "Concept generation failed. Please try again.";
        try {
          const body = await res.json() as { error?: string };
          if (body.error) errMsg = body.error;
        } catch { /* ignore */ }
        if (res.status === 429) errMsg = "Too many requests. Please wait a few minutes and try again.";
        setGen({ status: "failed", progress: 0, total: 4, error: errMsg });
        generationFiredRef.current = false;
      }
    }).catch(() => {
      // Network error — polling will see failed status or keep retrying
    });

    // Polling detects queued → generating → completed and loads the board.
    pollIntervalRef.current = setInterval(pollStatus, 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design_id, pollStatus, loadBoard]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      await sessionReady();
      const profile = await getProfile();
      if (cancelled) return;
      if (profile?.role === "supplier") { router.replace("/supplier"); return; }

      const alreadyDone = await loadBoard();
      if (cancelled) return;
      if (alreadyDone) {
        setGen(prev => ({ ...prev, status: "completed" }));
        return;
      }

      const statusRes  = await fetch(`/api/generate-concepts/status?design_id=${design_id}`);
      const statusData = await statusRes.json() as GenerationProgress;
      if (cancelled) return;

      if (statusData.status === "generating" || statusData.status === "queued") {
        setGen(statusData);
        generationFiredRef.current = true;
        pollIntervalRef.current = setInterval(pollStatus, 5000);
      } else {
        await triggerGeneration();
      }
    }

    init();

    return () => {
      cancelled = true;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design_id]);

  // Clear regenerating/declining flags once generation resolves
  useEffect(() => {
    if (gen.status === "completed" || gen.status === "failed") {
      setRegenerating(false);
      setDeclining(false);
    }
  }, [gen.status]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // ── Regenerate — force a fresh concept from the same brief ────────────────
  function handleRegenerate() {
    if (regenerating || declining) return;
    setRegenerating(true);
    setActionError(null);
    setBoardData(null);
    setGen({ status: "not_started", progress: 0, total: 4, error: null });
    generationFiredRef.current = false;
    triggerGeneration(true);
    // regenerating cleared when polling detects completion or failure via useEffect below
  }

  // ── Decline — capture a revision note, fold it into the brief vision, then
  //    regenerate so the new concept reflects the requested changes ──────────
  async function handleConfirmDecline() {
    setDeclining(true);
    setActionError(null);
    try {
      const note = declineNote.trim();
      if (note) {
        // Merge the revision note into the brief's vision so regeneration uses it.
        let existingVision = "";
        try {
          const dRes = await fetch(`/api/portal/design?order_id=${encodeURIComponent(design_id)}`);
          if (dRes.ok) {
            const d = await dRes.json() as { visionPrompt?: string | null };
            existingVision = (d.visionPrompt ?? "").trim();
          }
        } catch { /* best effort */ }

        const combinedVision = [existingVision, `Revision request: ${note}`]
          .filter(Boolean)
          .join("\n\n");

        await fetch("/api/brief/submit", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ design_id, vision_prompt: combinedVision }),
        });
      }

      setDeclineStep(false);
      setDeclineNote("");
      // Regenerate with the updated brief
      setBoardData(null);
      setGen({ status: "not_started", progress: 0, total: 4, error: null });
      generationFiredRef.current = false;
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      triggerGeneration(true);
    } catch {
      setActionError("Couldn't request changes. Please try again.");
    } finally {
      setDeclining(false);
    }
  }

  // ── Approve — commit to this concept by moving into Creative Activation ───
  function handleApprove() {
    setConfirmStep(true);
    setActionError(null);
  }

  const isGenerating = gen.status === "generating" || gen.status === "queued";
  const isFailed     = gen.status === "failed";
  const hasBoard     = !!boardData;
  const renders      = boardData?.metadata.renders;
  const checkoutHref = `/designs/${design_id}/checkout`;

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <OrgLogo href="/portal" />
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors">
            Client Portal
          </a>
        </div>
        <div className="hidden lg:flex items-center gap-5">
          <a href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Home</a>
          <button type="button" onClick={() => router.back()} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Back</button>
          <button type="button" onClick={signOut} className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Sign Out</button>
        </div>
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
                ? "Our AI is building your concept board from your design brief. This takes 2–3 minutes."
                : hasBoard
                ? "Review your concept. Approve to move into activation, regenerate for a fresh take, or decline to request changes."
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
                <p className="text-xs text-brand-muted font-barlow mt-2">Please contact {tenant.name} support to retry.</p>
              </div>
            </div>
          )}

          {/* Board ready — full render board + activate */}
          {hasBoard && renders && (
            <div className="space-y-4">
              {/* Activation header */}
              <div className="rounded-xl border border-brand-primary/20 bg-brand-surface px-5 py-4 flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-display font-bold uppercase tracking-wider text-brand-text">
                    Your design is ready
                  </p>
                  <p className="text-[10px] text-brand-muted font-barlow mt-0.5">
                    Activate your project to put a Grace Studios designer on it and move into production.
                  </p>
                </div>
                <a
                  href={checkoutHref}
                  className="flex-shrink-0 px-5 py-2.5 rounded-xl font-display font-bold text-xs uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-all whitespace-nowrap"
                >
                  Activate →
                </a>
              </div>

              {/* Full concept board */}
              <RendersBoard data={boardData} studioName={tenant.name} />

              {/* Error */}
              {actionError && (
                <p className="text-xs text-red-400 font-barlow bg-red-950/30 border border-red-800 rounded-xl px-4 py-3">
                  {actionError}
                </p>
              )}

              {/* Approve confirmation */}
              {confirmStep && (
                <div className="rounded-xl border border-brand-primary/40 bg-brand-surface px-5 py-4 flex flex-col gap-3">
                  <p className="text-sm font-barlow text-brand-text font-medium">
                    Approve this concept and move into activation?
                  </p>
                  <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                    Creative Activation ($149, applied toward your final order) puts a Grace Studios
                    designer on your project and unlocks production.
                  </p>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmStep(false)}
                      className="px-8 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200 border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted"
                    >
                      Cancel
                    </button>
                    <a
                      href={checkoutHref}
                      className="flex-1 py-3.5 rounded-xl text-center font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200 bg-brand-primary text-white hover:bg-brand-secondary"
                    >
                      Proceed to Activation →
                    </a>
                  </div>
                </div>
              )}

              {/* Decline confirmation */}
              {declineStep && (
                <div className="rounded-xl border border-red-800/40 bg-red-950/10 px-5 py-4 flex flex-col gap-3">
                  <p className="text-sm font-barlow text-brand-text font-medium">
                    Request changes to this concept?
                  </p>
                  <p className="text-xs font-barlow text-brand-muted leading-relaxed">
                    Tell us what to change and we&apos;ll generate a fresh concept that reflects your notes.
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
                      onClick={() => { setDeclineStep(false); setDeclineNote(""); }}
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
                      {declining ? "Regenerating…" : "Request Changes & Regenerate →"}
                    </button>
                  </div>
                </div>
              )}

              {/* Action row — Regenerate · Decline · Approve */}
              {!confirmStep && !declineStep && (
                <div className="flex items-center gap-3 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={handleRegenerate}
                    disabled={regenerating || declining}
                    className="px-8 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                      border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-primary
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {regenerating ? "Regenerating…" : "↺ Regenerate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setDeclineStep(true); setActionError(null); }}
                    disabled={regenerating || declining}
                    className="px-8 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                      border border-red-800/50 text-red-400 hover:bg-red-900/20 hover:border-red-600
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Decline This Design
                  </button>
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={regenerating || declining}
                    className="flex-1 py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-200
                      bg-brand-primary text-white hover:bg-brand-secondary
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Approve This Design →
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

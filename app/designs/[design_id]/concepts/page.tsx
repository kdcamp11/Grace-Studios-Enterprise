"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import OrgLogo from "@/components/OrgLogo";
import MobileDropdown from "@/components/MobileDropdown";
import { useTenant } from "@/lib/tenant/context";
import type { DesignMetadata, GenerationStatus } from "@/app/api/generate-concepts/route";

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
  teamName: string;
  metadata: DesignMetadata;
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

function RenderImage({ url, alt, className, style }: { url?: string; alt: string; className?: string; style?: React.CSSProperties }) {
  const [loaded, setLoaded] = useState(false);
  const [error,  setError]  = useState(false);

  if (!url) return (
    <div className={`bg-gray-50 flex items-center justify-center ${className ?? ""}`} style={style}>
      <span className="text-gray-300 text-[10px] font-display uppercase tracking-wider">Rendering…</span>
    </div>
  );

  return (
    <div className={`relative bg-gray-50 overflow-hidden ${className ?? ""}`} style={style}>
      {!loaded && !error && <div className="absolute inset-0 animate-pulse bg-gray-100" />}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-gray-300 text-[10px]">Unavailable</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`w-full h-full object-contain transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      )}
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
        brief: { ai_prompt?: string } | null;
        conceptRows: { concept_number: number; image_url: string }[];
        order: { clients?: { name?: string } | { name?: string }[] } | null;
      };

    let metadata: DesignMetadata | null = null;

    if (briefRow?.ai_prompt) {
      try {
        const parsed = JSON.parse(briefRow.ai_prompt as string) as DesignMetadata;
        if (parsed.status === "completed") metadata = parsed;
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

    setBoardData({ teamName, metadata });
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
  const triggerGeneration = useCallback(async () => {
    if (generationFiredRef.current) return;
    generationFiredRef.current = true;
    setGen({ status: "queued", progress: 0, total: 4, error: null });

    const res = await fetch("/api/generate-concepts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ design_id }),
    });

    if (res.status === 409) {
      const body = await res.json();
      if (body.status === "already_completed") { await loadBoard(); return; }
      // already_running — fall through to polling
    } else if (!res.ok) {
      let errMsg = "Concept generation failed. Please try again.";
      try {
        const body = await res.json() as { error?: string };
        if (body.error) errMsg = body.error;
      } catch { /* ignore */ }
      if (res.status === 429) errMsg = "Too many requests. Please wait a few minutes and try again.";
      setGen({ status: "failed", progress: 0, total: 4, error: errMsg });
      generationFiredRef.current = false;
      return;
    }

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
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

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
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
                ? "Here's a first look. Activate your project to unlock all views and move into production."
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

          {/* Board ready — locked teaser + activate */}
          {hasBoard && renders && (
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
                    Activate your project to unlock all 4 views and move into production.
                  </p>
                </div>
                <a
                  href={checkoutHref}
                  className="flex-shrink-0 px-5 py-2.5 rounded-xl font-display font-bold text-xs uppercase tracking-widest bg-brand-primary text-white hover:bg-brand-secondary transition-all whitespace-nowrap"
                >
                  Activate →
                </a>
              </div>

              {/* Front jersey — visible preview */}
              <div className="rounded-xl overflow-hidden border border-gray-200 shadow-lg bg-gray-50">
                <div className="border-b border-gray-100 bg-white px-4 py-2 flex items-center justify-between">
                  <span className="text-[8px] font-bold uppercase tracking-[0.28em] text-gray-400">Preview: Front View</span>
                  <span className="text-[8px] font-display uppercase tracking-wider text-gray-300">{boardData.teamName}</span>
                </div>
                <RenderImage
                  url={renders.frontJersey}
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
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{
                        backgroundImage: renders.frontJersey ? `url(${renders.frontJersey})` : undefined,
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
                href={checkoutHref}
                className="block w-full py-4 rounded-xl text-center font-display font-bold text-sm uppercase tracking-[0.15em]
                  bg-brand-primary text-white hover:bg-brand-secondary transition-all duration-200
                  shadow-[0_4px_24px_rgba(212,175,55,0.2)] hover:shadow-[0_4px_32px_rgba(212,175,55,0.35)]"
              >
                Creative Activation — $149 →
              </a>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

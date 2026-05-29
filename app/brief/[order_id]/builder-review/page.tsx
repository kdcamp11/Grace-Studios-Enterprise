"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import { loadBriefState, clearBriefState } from "@/lib/brief-state";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant/context";
import { BUILDER_STEPS } from "@/components/brief/BriefProgress";
import type { BriefState } from "@/types/database";

// Zone label display map
const ZONE_LABELS: Record<string, string> = {
  jerseyTop:         "Jersey Top",
  collar:            "Collar",
  jerseyShorts:      "Shorts",
  jerseySidePanels:  "Jersey Side Panels",
  jerseyLowerPanels: "Jersey Lower Side Panels",
  sleevePanels:      "Sleeve Panels",
  shortSidePanels:   "Shorts Side Panels",
};

function ColorSwatch({ label, hex }: { label: string; hex: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-brand-border last:border-b-0">
      <div
        className="w-7 h-7 rounded-lg flex-shrink-0 border border-black/10 shadow-sm"
        style={{ backgroundColor: hex }}
      />
      <span className="text-xs font-display uppercase tracking-wider text-brand-muted flex-1">{label}</span>
      <span className="text-xs font-barlow font-mono text-brand-muted">{hex.toUpperCase()}</span>
    </div>
  );
}

export default function BuilderReviewPage() {
  const router         = useRouter();
  const { order_id }   = useParams<{ order_id: string }>();
  const tenant         = useTenant();

  const [brief, setBrief]             = useState<BriefState | null>(null);
  const [notes, setNotes]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  // Read-only when the design is already submitted/paid (set from the server).
  const [submitted, setSubmitted]     = useState(false);
  const [ready, setReady]             = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      // 1. Try localStorage first (normal first-time flow).
      const local = loadBriefState();
      const hasLocalForThisOrder =
        !!local &&
        local.orderId === order_id &&
        (!!local.teamName || (local.zoneColors && Object.keys(local.zoneColors).length > 0));

      // 2. Fetch the persisted design from the server. We always do this so we
      //    can determine submitted/paid state and fall back when localStorage is
      //    empty (post-submit, or a fresh device).
      let serverBrief: BriefState | null = null;
      try {
        const res = await fetch(`/api/portal/design?order_id=${encodeURIComponent(order_id)}`);
        if (res.ok) {
          const d = await res.json() as {
            teamName: string | null;
            sport: string | null;
            zoneColors: BriefState["zoneColors"];
            logosToInclude: string | null;
            visionPrompt: string | null;
            hasBrief: boolean;
            stage: string;
            designFeePaid: boolean;
          };
          const isSubmitted =
            d.hasBrief || d.designFeePaid || (d.stage !== "creative_started" && d.stage !== "onboarding");
          if (active) setSubmitted(isSubmitted);
          if (active && d.visionPrompt) setNotes(d.visionPrompt);
          if (d.teamName || d.zoneColors) {
            serverBrief = {
              ...(local ?? ({} as BriefState)),
              orderId:        order_id,
              teamName:       d.teamName ?? local?.teamName ?? "",
              sport:          d.sport ?? local?.sport ?? "",
              zoneColors:     d.zoneColors ?? local?.zoneColors ?? null,
              logosToInclude: d.logosToInclude ?? local?.logosToInclude ?? "",
            } as BriefState;
          }
        }
      } catch {
        // Network failure — fall back to localStorage if present.
      }

      if (!active) return;
      setBrief(hasLocalForThisOrder ? local : (serverBrief ?? local));
      setReady(true);
    }

    load();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  async function handleSubmit() {
    if (!order_id) return;
    setLoading(true);
    setError("");

    try {
      const aiPrompt = JSON.stringify({
        garmentType: "Basketball Jersey & Shorts",
        sport:       brief?.sport || "Basketball",
        renders:     { frontJersey: brief?.renderUrl ?? null },
      });

      const res = await fetch("/api/brief/submit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id:          order_id,
          concept_source:    "client_provided",
          zone_colors:       brief?.zoneColors ?? null,
          logos_to_include:  brief?.logosToInclude || null,
          vision_prompt:     notes.trim() || null,
          logo_placement:    "chest",
          ai_prompt:         aiPrompt,
        }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? "Submission failed. Please try again.");
      }

      // Notify admin
      fetch("/api/notify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ event: "brief_submitted", order_id }),
      }).catch(() => {});

      clearBriefState();
      router.push(`/orders/${order_id}/checkout`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!ready || !brief) {
    return (
      <BriefLayout currentStep={3} steps={BUILDER_STEPS} title="Review & Submit">
        <div className="py-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </BriefLayout>
    );
  }

  const zoneColors  = brief.zoneColors ?? {};
  const logoNames   = brief.logosToInclude
    ? brief.logosToInclude.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const canSubmit   = termsAgreed && privacyAgreed;

  return (
    <BriefLayout
      currentStep={3}
      steps={BUILDER_STEPS}
      title="Review Your Design"
      subtitle="Confirm your jersey colors and logos before submitting to Grace Studios."
    >
      <div className="space-y-6">

        {/* ── Team Info ──────────────────────────────────────────────────────── */}
        <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Team</p>
          {brief.teamName    && <InfoRow label="Team"    value={brief.teamName} />}
          {brief.contactName && <InfoRow label="Contact" value={brief.contactName} />}
          {brief.city        && <InfoRow label="City"    value={brief.city} />}
          {brief.sport       && <InfoRow label="Sport"   value={brief.sport} />}
        </div>

        {/* ── Zone Colors ────────────────────────────────────────────────────── */}
        {Object.keys(zoneColors).length > 0 && (
          <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Jersey Colors</p>
            {Object.entries(zoneColors).map(([key, hex]) => (
              <ColorSwatch
                key={key}
                label={ZONE_LABELS[key] ?? key}
                hex={hex as string}
              />
            ))}
          </div>
        )}

        {/* ── Logos ──────────────────────────────────────────────────────────── */}
        {logoNames.length > 0 && (
          <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Logos</p>
            <div className="space-y-2">
              {logoNames.map((name, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-brand-border last:border-b-0">
                  <div className="w-2 h-2 rounded-full bg-brand-primary flex-shrink-0" />
                  <span className="text-xs font-barlow text-brand-muted">{name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Production Notes ───────────────────────────────────────────────── */}
        {(!submitted || notes) && (
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">
              Production Notes <span className="normal-case tracking-normal text-brand-muted/60">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              readOnly={submitted}
              rows={3}
              placeholder="Pantone codes, placement instructions, number style, sponsor text, anything specific for the designer…"
              className="w-full bg-brand-surface border border-brand-border rounded-xl px-4 py-3 text-brand-text font-barlow text-sm
                placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors resize-none
                read-only:opacity-70 read-only:cursor-default"
            />
          </div>
        )}

        {submitted ? (
          /* ── Read-only: design already submitted ──────────────────────────── */
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 px-5 py-4 flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 font-display font-bold text-[10px] uppercase tracking-widest border border-emerald-500/30">
                Submitted
              </span>
              <p className="text-sm font-barlow text-brand-muted">
                This design has been submitted to Grace Studios. You can always view it here.
              </p>
            </div>
            <a
              href="/portal"
              className="inline-block px-6 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
            >
              ← Back to Orders
            </a>
          </div>
        ) : (
        <>
        {/* ── What Happens Next ──────────────────────────────────────────────── */}
        <div className="rounded-xl border border-brand-border bg-brand-surface px-5 py-4">
          <p className="text-[9px] font-display font-bold uppercase tracking-[0.28em] text-brand-muted mb-3">
            What happens next
          </p>
          <ol className="space-y-3">
            {[
              "Submit your builder design (you're here)",
              "Activate your project. $149 Creative Activation applied toward your final order total.",
              "A Grace Studios designer executes your color layout",
              "You approve the final artwork before production begins",
              "Production and delivery managed by Grace Studios",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className={`
                  w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-display font-bold
                  ${i === 0 ? "bg-brand-primary text-white" : "bg-brand-border text-brand-muted"}
                `}>
                  {i + 1}
                </span>
                <span className={`text-[10px] font-barlow leading-tight pt-0.5 ${i === 0 ? "text-brand-text font-medium" : "text-brand-muted"}`}>
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* ── Agreements ─────────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <AgreementCheckbox
            checked={termsAgreed}
            onChange={setTermsAgreed}
            title="Terms of Service"
          >
            I have read and agree to the {tenant.name}{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-primary underline underline-offset-2 hover:text-brand-secondary">
              Terms of Service
            </a>
            , including payment terms, revision fees, turnaround time estimates, and the limitation of liability.
          </AgreementCheckbox>

          <AgreementCheckbox
            checked={privacyAgreed}
            onChange={setPrivacyAgreed}
            title="Privacy Policy"
          >
            I have read and agree to the {tenant.name}{" "}
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-primary underline underline-offset-2 hover:text-brand-secondary">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/refund-policy" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-brand-primary underline underline-offset-2 hover:text-brand-secondary">
              Refund &amp; Cancellation Policy
            </a>
            , including how my personal information, design data, and uploaded assets are collected and used.
          </AgreementCheckbox>
        </div>

        {error && (
          <p className="text-red-400 text-sm font-barlow bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        {/* ── Actions ────────────────────────────────────────────────────────── */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className="flex-1 py-3.5 rounded-lg font-display font-bold text-base uppercase tracking-widest transition-all duration-200
              bg-brand-primary text-brand-bg hover:bg-brand-secondary
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting…" : "Submit & Proceed to Payment →"}
          </button>
        </div>
        </>
        )}

      </div>
    </BriefLayout>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-brand-border last:border-b-0">
      <span className="text-xs font-display uppercase tracking-wider text-brand-muted w-24 flex-shrink-0">{label}</span>
      <span className="text-sm font-barlow text-brand-text">{value}</span>
    </div>
  );
}

function AgreementCheckbox({
  checked, onChange, title, children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex gap-4 bg-brand-surface border border-brand-border rounded-xl p-4 cursor-pointer group hover:border-brand-primary/40 transition-colors">
      <div className="flex-shrink-0 mt-0.5">
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
            ${checked ? "bg-brand-primary border-brand-primary" : "border-brand-border group-hover:border-brand-primary/60"}`}
        >
          {checked && (
            <svg className="w-3 h-3 text-brand-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <div>
        <p className="text-xs font-display uppercase tracking-wider text-brand-primary mb-1">{title}</p>
        <p className="text-sm font-barlow text-brand-muted leading-relaxed">{children}</p>
      </div>
    </label>
  );
}

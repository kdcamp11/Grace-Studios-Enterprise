"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import { loadBriefState, clearBriefState } from "@/lib/brief-state";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant/context";
import type { BriefState } from "@/types/database";

function SummaryRow({ label, value }: { label: string; value: string | null | undefined | boolean }) {
  if (!value && value !== false) return null;
  const display = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
  return (
    <div className="flex gap-4 py-2.5 border-b border-brand-border last:border-b-0">
      <span className="text-xs font-display uppercase tracking-wider text-brand-muted w-36 flex-shrink-0">{label}</span>
      <span className="text-sm font-barlow text-brand-text">{display}</span>
    </div>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const { order_id } = useParams<{ order_id: string }>();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const tenant = useTenant();

  const [brief, setBrief] = useState<BriefState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ipAgreed, setIpAgreed] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);

  useEffect(() => {
    setBrief(loadBriefState());
  }, []);

  async function handleSubmit() {
    if (!order_id) return;
    setLoading(true);
    setError("");

    // If briefState has a designId matching the URL param, we're in pre-payment design flow
    const isDesignFlow = !!(brief?.designId && brief.designId === order_id);

    try {
      const logoUrls = brief?.logoUrls ?? [];
      const refUrls = brief?.referenceImageUrls ?? [];

      const idField = isDesignFlow ? { design_id: order_id } : { order_id };

      const submitRes = await fetch("/api/brief/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...idField,
          logo_url: logoUrls[0] || null,
          logo_urls: logoUrls.length ? logoUrls : null,
          reference_image_url: refUrls[0] || null,
          reference_image_urls: refUrls.length ? refUrls : null,
          hex_confirmed: false,
          brand_match: false,
          design_system: brief?.designSystem || null,
          negative_references: brief?.negativeReferences || null,
          jersey_cut: brief?.jerseycut || null,
          sublimated: brief?.sublimated ?? null,
          number_style: brief?.numberStyle || null,
          player_names: brief?.playerNames ?? false,
          logo_placement: brief?.gsLogoPlacement || null,
          logos_to_include: brief?.logosToInclude || null,
          sponsor_text: brief?.sponsorText || null,
          vision_prompt: brief?.visionPrompt || null,
          primary_colors: brief?.primaryColor || null,
          secondary_colors: brief?.secondaryColor || null,
          accent_color: brief?.accentColor || null,
          player_roster: brief?.playerRoster?.length ? brief.playerRoster : null,
          zone_colors: brief?.zoneColors ?? null,
        }),
      });

      if (!submitRes.ok) {
        const { error } = await submitRes.json() as { error: string };
        throw new Error(error);
      }

      fetch("/api/generate-concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(idField),
      }).then(res => {
        if (!res.ok) {
          console.warn("[brief/review] generate-concepts returned", res.status);
        }
      }).catch(err => {
        console.warn("[brief/review] generate-concepts failed:", err);
      });

      // Notify admin that a new brief was submitted
      fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "brief_submitted", order_id }),
      }).catch(() => {});

      // Route to roster step — it finalises player data then routes to checkout (design flow) or concepts (order flow)
      router.push(`/brief/${order_id}/roster`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (!brief) {
    return (
      <BriefLayout currentStep={4} title="Review & Submit">
        <div className="py-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </BriefLayout>
    );
  }

  const canSubmit = ipAgreed && termsAgreed && privacyAgreed;

  return (
    <BriefLayout
      currentStep={4}
      title="Review & Submit"
      subtitle="Everything look right? Once submitted, AI concept generation begins automatically."
    >
      <div className="space-y-6">

        {/* Summary grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_160px] gap-5 items-start">
          <div className="space-y-4">
            {/* Team */}
            <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Team</p>
              <SummaryRow label="Team" value={brief.teamName} />
              <SummaryRow label="Contact" value={brief.contactName} />
              <SummaryRow label="City" value={brief.city} />
              <SummaryRow label="Sport" value={brief.sport} />
            </div>

            {/* Design */}
            <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
              <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Design</p>
              <SummaryRow label="System" value={brief.designSystem} />
              <SummaryRow label="Cut" value={brief.jerseycut} />
              <SummaryRow
                label="Construction"
                value={brief.sublimated === null ? null : brief.sublimated ? "Sublimated" : "Tackle Twill"}
              />
              <SummaryRow label="Logo Placement" value={brief.gsLogoPlacement?.replace("_", " ")} />
              <SummaryRow label="Number Style" value={brief.numberStyle} />
            </div>

            {/* Details */}
            {(brief.logosToInclude || brief.sponsorText || brief.negativeReferences || brief.visionPrompt) && (
              <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
                <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Details</p>
                <SummaryRow label="Logos" value={brief.logosToInclude} />
                <SummaryRow label="Sponsor" value={brief.sponsorText} />
                <SummaryRow label="Avoid" value={brief.negativeReferences} />
                <SummaryRow label="Vision" value={brief.visionPrompt} />
              </div>
            )}
          </div>

          {/* Logo + reference previews */}
          {((brief.logoUrls?.length ?? 0) > 0 || (brief.referenceImageUrls?.length ?? 0) > 0) && (
            <div className="space-y-4">
              {(brief.logoUrls?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-display uppercase tracking-wider text-brand-muted mb-2">Logos</p>
                  <div className="flex flex-wrap gap-2">
                    {brief.logoUrls!.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt={`Logo ${i + 1}`} className="w-16 h-16 object-contain rounded-lg border border-brand-border bg-brand-surface p-1" />
                    ))}
                  </div>
                </div>
              )}
              {(brief.referenceImageUrls?.length ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-display uppercase tracking-wider text-brand-muted mb-2">References</p>
                  <div className="flex flex-wrap gap-2">
                    {brief.referenceImageUrls!.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={url} alt={`Ref ${i + 1}`} className="w-16 h-16 object-cover rounded-lg border border-brand-border" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lock notice */}
        <div className="bg-brand-surface border border-brand-border rounded-xl p-4">
          <p className="text-xs font-display uppercase tracking-wider text-brand-primary mb-2">Design Lock Notice</p>
          <p className="text-sm text-brand-muted font-barlow leading-relaxed">
            Once submitted, concept generation begins and your design direction is locked.
            <span className="text-brand-text"> One revision round is included. Additional revision rounds are billed at $125 per round.</span>
          </p>
        </div>

        {/* Agreements */}
        <div className="space-y-3">
          {/* IP ownership */}
          <label className="flex gap-4 bg-brand-surface border border-brand-border rounded-xl p-4 cursor-pointer group hover:border-brand-primary/40 transition-colors">
            <div className="flex-shrink-0 mt-0.5">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                  ${ipAgreed ? "bg-brand-primary border-brand-primary" : "border-brand-border group-hover:border-brand-primary/60"}`}
              >
                {ipAgreed && (
                  <svg className="w-3 h-3 text-brand-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={ipAgreed}
              onChange={(e) => setIpAgreed(e.target.checked)}
              className="sr-only"
            />
            <div>
              <p className="text-xs font-display uppercase tracking-wider text-brand-primary mb-1">Intellectual Property Agreement</p>
              <p className="text-sm font-barlow text-brand-muted leading-relaxed">
                I understand that all design concepts, artwork, and creative materials generated through {tenant.name}
                remain the exclusive intellectual property of {tenant.name}. These designs may not be reproduced,
                transferred, or used without a separate written agreement. By submitting this brief, I grant {tenant.name}
                a license to create and retain these designs on my behalf.
              </p>
            </div>
          </label>

          {/* Terms of service */}
          <label className="flex gap-4 bg-brand-surface border border-brand-border rounded-xl p-4 cursor-pointer group hover:border-brand-primary/40 transition-colors">
            <div className="flex-shrink-0 mt-0.5">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                  ${termsAgreed ? "bg-brand-primary border-brand-primary" : "border-brand-border group-hover:border-brand-primary/60"}`}
              >
                {termsAgreed && (
                  <svg className="w-3 h-3 text-brand-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              className="sr-only"
            />
            <div>
              <p className="text-xs font-display uppercase tracking-wider text-brand-primary mb-1">Terms of Service</p>
              <p className="text-sm font-barlow text-brand-muted leading-relaxed">
                I have read and agree to the {tenant.name}{" "}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-brand-primary underline underline-offset-2 hover:text-brand-secondary"
                >
                  Terms of Service
                </a>
                , including payment terms, revision fees, turnaround time estimates, and the limitation of liability.
              </p>
            </div>
          </label>

          {/* Privacy policy */}
          <label className="flex gap-4 bg-brand-surface border border-brand-border rounded-xl p-4 cursor-pointer group hover:border-brand-primary/40 transition-colors">
            <div className="flex-shrink-0 mt-0.5">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                  ${privacyAgreed ? "bg-brand-primary border-brand-primary" : "border-brand-border group-hover:border-brand-primary/60"}`}
              >
                {privacyAgreed && (
                  <svg className="w-3 h-3 text-brand-bg" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={privacyAgreed}
              onChange={(e) => setPrivacyAgreed(e.target.checked)}
              className="sr-only"
            />
            <div>
              <p className="text-xs font-display uppercase tracking-wider text-brand-primary mb-1">Privacy Policy</p>
              <p className="text-sm font-barlow text-brand-muted leading-relaxed">
                I have read and agree to the {tenant.name}{" "}
                <a
                  href="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-brand-primary underline underline-offset-2 hover:text-brand-secondary"
                >
                  Privacy Policy
                </a>{" "}
                and{" "}
                <a
                  href="/refund-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-brand-primary underline underline-offset-2 hover:text-brand-secondary"
                >
                  Refund &amp; Cancellation Policy
                </a>
                , including how my personal information, design data, and uploaded assets are collected and used to
                process my order.
              </p>
            </div>
          </label>
        </div>

        {error && (
          <p className="text-red-400 text-sm font-barlow bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push(`/brief/${order_id}/reference`)}
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
            {loading ? "Submitting brief…" : "Approve & Generate Concepts →"}
          </button>
        </div>
      </div>
    </BriefLayout>
  );
}

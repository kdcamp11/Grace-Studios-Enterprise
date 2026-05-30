"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import { createClient } from "@/lib/supabase/client";

/**
 * Upload-concept review page.
 *
 * The companion of builder-review, but for the upload-concept flow: the client
 * uploaded a production-ready file (.ai/.eps/.pdf/.svg) instead of building a
 * jersey or generating AI concepts. This page shows the uploaded file, team
 * info, and notes — and lets them open or replace the file before activation.
 *
 * Reached from the portal for orders tagged concept_source = "client_provided"
 * that have a client_concept_url.
 */

interface UploadDesign {
  teamName:           string | null;
  sport:              string | null;
  clientConceptUrl:   string | null;
  clientPhotoUrl:     string | null;
  clientConceptNotes: string | null;
  hasBrief:           boolean;
  stage:              string;
  designFeePaid:      boolean;
}

function fileNameFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    return decodeURIComponent(path.split("/").pop() ?? "uploaded file");
  } catch {
    return "uploaded file";
  }
}

function fileExtFromUrl(url: string): string {
  return (url.split(".").pop()?.split("?")[0] ?? "").toUpperCase();
}

export default function UploadReviewPage() {
  const router       = useRouter();
  const { order_id } = useParams<{ order_id: string }>();

  const [design, setDesign] = useState<UploadDesign | null>(null);
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }

      try {
        const res = await fetch(`/api/portal/design?order_id=${encodeURIComponent(order_id)}`);
        if (res.ok && active) {
          setDesign(await res.json() as UploadDesign);
        }
      } catch { /* leave design null → empty state */ }
      finally {
        if (active) setReady(true);
      }
    }

    load();
    return () => { active = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order_id]);

  if (!ready) {
    return (
      <BriefLayout currentStep={3} title="Review Your Concept">
        <div className="py-16 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </BriefLayout>
    );
  }

  const conceptUrl = design?.clientConceptUrl ?? null;
  const fileName   = conceptUrl ? fileNameFromUrl(conceptUrl) : null;
  const fileExt    = conceptUrl ? fileExtFromUrl(conceptUrl) : null;
  const photoUrl   = design?.clientPhotoUrl ?? null;

  return (
    <BriefLayout
      currentStep={3}
      title="Review Your Concept"
      subtitle="Confirm your uploaded design file before submitting to Grace Studios."
    >
      <div className="space-y-6">

        {/* ── Uploaded Design File ───────────────────────────────────────────── */}
        <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Design File</p>
          {conceptUrl ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-display font-bold text-brand-primary">{fileExt}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-barlow text-brand-text truncate">{fileName}</p>
                <a
                  href={conceptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-display uppercase tracking-wider text-brand-primary hover:text-brand-secondary transition-colors"
                >
                  Open file →
                </a>
              </div>
            </div>
          ) : (
            <p className="text-sm font-barlow text-brand-muted">No file uploaded yet.</p>
          )}
        </div>

        {/* ── Reference Photo ────────────────────────────────────────────────── */}
        <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Reference Photo</p>
          {photoUrl ? (
            <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt="Reference photo"
                className="w-full max-h-80 object-contain rounded-lg border border-brand-border bg-brand-bg"
              />
            </a>
          ) : (
            <p className="text-sm font-barlow text-brand-muted">No photo uploaded yet.</p>
          )}
        </div>

        {/* ── Team Info ──────────────────────────────────────────────────────── */}
        <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
          <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Team</p>
          {design?.teamName && <InfoRow label="Team"  value={design.teamName} />}
          {design?.sport    && <InfoRow label="Sport" value={design.sport} />}
        </div>

        {/* ── Notes ──────────────────────────────────────────────────────────── */}
        {design?.clientConceptNotes && (
          <div className="bg-brand-surface rounded-xl border border-brand-border p-5">
            <p className="text-xs font-display uppercase tracking-widest text-brand-primary mb-3">Notes</p>
            <p className="text-sm font-barlow text-brand-muted whitespace-pre-wrap leading-relaxed">
              {design.clientConceptNotes}
            </p>
          </div>
        )}

        {/* ── Actions ────────────────────────────────────────────────────────── */}
        <div className="flex gap-3 pt-2">
          <a
            href="/portal"
            className="px-6 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
          >
            ← Back to Orders
          </a>
          <a
            href={`/orders/${order_id}/upload-concept`}
            className="px-6 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
          >
            Replace File
          </a>
          {!design?.designFeePaid && (
            <a
              href={`/orders/${order_id}/checkout`}
              className="flex-1 py-3.5 rounded-lg font-display font-bold text-base uppercase tracking-widest text-center transition-all duration-200
                bg-brand-primary text-brand-bg hover:bg-brand-secondary"
            >
              Proceed to Activation →
            </a>
          )}
        </div>

      </div>
    </BriefLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-2.5 border-b border-brand-border last:border-b-0">
      <span className="text-xs font-display uppercase tracking-wider text-brand-muted w-24 flex-shrink-0">{label}</span>
      <span className="text-sm font-barlow text-brand-text">{value}</span>
    </div>
  );
}

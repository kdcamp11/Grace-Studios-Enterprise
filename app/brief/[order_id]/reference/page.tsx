"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import { SYSTEM_DEFAULTS } from "@/components/brief/JerseyPreview";
import { loadBriefState, saveBriefState } from "@/lib/brief-state";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/lib/tenant/context";

// ── Constants ────────────────────────────────────────────────────────────────

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({
  label, hint, images, onAdd, onRemove, uploading, error,
}: {
  label: string;
  hint: string;
  images: string[];
  onAdd: (files: FileList) => void;
  onRemove: (url: string) => void;
  uploading: boolean;
  error: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div>
      <p className="text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-1">{label}</p>
      <p className="text-xs text-brand-muted font-barlow mb-3 leading-relaxed">{hint}</p>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mb-3">
          {images.map((url) => (
            <div key={url} className="relative w-16 h-16 rounded-xl overflow-hidden border border-brand-border group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onRemove(url)}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              >
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        onDragOver={(e)  => { e.preventDefault(); setDrag(true);  }}
        onDragLeave={()  => setDrag(false)}
        onDrop={(e)      => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) onAdd(e.dataTransfer.files); }}
        onClick={()      => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200
          flex items-center gap-3 py-5 px-4
          ${drag ? "border-brand-primary bg-brand-primary/5" : "border-brand-border bg-brand-surface hover:border-brand-muted"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ""; }}
        />
        {uploading ? (
          <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mx-auto" />
        ) : (
          <>
            <svg className="w-5 h-5 text-brand-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div>
              <p className="text-sm font-barlow text-brand-text">
                {images.length > 0 ? "Add more" : "Drop files here"}
              </p>
              <p className="text-xs text-brand-muted font-barlow">or click to browse — PNG, SVG, JPG</p>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="mt-2 text-red-500 text-xs font-barlow bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReferencePage() {
  const router = useRouter();
  const { order_id } = useParams<{ order_id: string }>();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const tenant = useTenant();

  // Brief state hydration
  const [designSystem, setDesignSystem] = useState("");
  const [teamName,     setTeamName]     = useState("");

  // Color state — initialized from brief or system defaults
  const [primaryColor,   setPrimaryColor]   = useState("#0C0C0C");
  const [secondaryColor, setSecondaryColor] = useState("#CC1B1B");
  const [accentColor,    setAccentColor]    = useState("#E5E5E5");

  // Upload state
  const [logoUrls, setLogoUrls] = useState<string[]>([]);
  const [refUrls,  setRefUrls]  = useState<string[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [refUploading,  setRefUploading]  = useState(false);
  const [logoError, setLogoError] = useState("");
  const [refError,  setRefError]  = useState("");

  // Form state
  const [logosToInclude,  setLogosToInclude]  = useState("");
  const [sponsorText,     setSponsorText]     = useState("");
  const [negativeReferences, setNegativeReferences] = useState("");
  const [visionPrompt,    setVisionPrompt]    = useState("");

  // Hydrate from localStorage on mount
  useEffect(() => {
    const state = loadBriefState();
    setDesignSystem(state.designSystem || "");
    setTeamName(state.teamName || "");
    setLogoUrls(state.logoUrls ?? []);
    setRefUrls(state.referenceImageUrls ?? []);
    setLogosToInclude(state.logosToInclude ?? "");
    setSponsorText(state.sponsorText ?? "");
    setNegativeReferences(state.negativeReferences ?? "");
    setVisionPrompt(state.visionPrompt ?? "");

    // Colors: use saved value, fall back to system default
    const defaults = SYSTEM_DEFAULTS[state.designSystem] ?? { primary: "#0C0C0C", secondary: "#CC1B1B", accent: "#E5E5E5" };
    setPrimaryColor(state.primaryColor     || defaults.primary);
    setSecondaryColor(state.secondaryColor || defaults.secondary);
    setAccentColor(state.accentColor       || defaults.accent);
  }, []);

  const canContinue = true;

  // ── Upload helpers ─────────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (
    files: FileList,
    prefix: string,
    existingUrls: string[],
    setUrls: (urls: string[]) => void,
    setUploading: (v: boolean) => void,
    setError: (s: string) => void,
  ) => {
    setUploading(true);
    setError("");
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) {
        setError("Only image files accepted (PNG, JPG, SVG)");
        continue;
      }
      try {
        const ext  = file.name.split(".").pop() ?? "png";
        const path = `${order_id}/${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("logos")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (uploadErr) throw uploadErr;
        const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(path);
        newUrls.push(publicUrl);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed");
      }
    }

    const updated = [...existingUrls, ...newUrls];
    setUrls(updated);
    setUploading(false);
    return updated;
  }, [supabase, order_id]);

  async function handleLogos(files: FileList) {
    const updated = await uploadFiles(files, "logo", logoUrls, setLogoUrls, setLogoUploading, setLogoError);
    saveBriefState({ logoUrls: updated });
  }

  async function handleRefs(files: FileList) {
    const updated = await uploadFiles(files, "ref", refUrls, setRefUrls, setRefUploading, setRefError);
    saveBriefState({ referenceImageUrls: updated });
  }

  function removeLogo(url: string) {
    const updated = logoUrls.filter((u) => u !== url);
    setLogoUrls(updated);
    saveBriefState({ logoUrls: updated });
  }

  function removeRef(url: string) {
    const updated = refUrls.filter((u) => u !== url);
    setRefUrls(updated);
    saveBriefState({ referenceImageUrls: updated });
  }

  // ── Color handlers (also persist to brief state) ────────────────────────────

  function handlePrimaryChange(v: string) {
    setPrimaryColor(v);
    saveBriefState({ primaryColor: v });
  }

  function handleSecondaryChange(v: string) {
    setSecondaryColor(v);
    saveBriefState({ secondaryColor: v });
  }

  function handleAccentChange(v: string) {
    setAccentColor(v);
    saveBriefState({ accentColor: v });
  }

  // ── Continue ───────────────────────────────────────────────────────────────

  function handleContinue() {
    if (!canContinue) return;
    saveBriefState({
      logosToInclude,
      sponsorText,
      negativeReferences,
      visionPrompt,
      primaryColor,
      secondaryColor,
      accentColor,
    });
    router.push(`/brief/${order_id}/review`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <BriefLayout
      currentStep={3}
      title="Logo & Details"
      subtitle="Upload your logo and set your colors — these feed directly into the AI."
    >
      <div className="space-y-8">

        {/* ── Color picker ─────────────────────────────────────────────── */}
        <div>
          <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-3">
            Color Palette
          </label>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Body",  value: primaryColor,   onChange: handlePrimaryChange   },
              { label: "Panel", value: secondaryColor, onChange: handleSecondaryChange },
              { label: "Trim",  value: accentColor,    onChange: handleAccentChange    },
            ].map(({ label, value, onChange }) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <label className="text-[10px] font-display uppercase tracking-widest text-brand-muted">{label}</label>
                <div className="relative w-12 h-12 rounded-xl overflow-hidden border-2 border-brand-border cursor-pointer hover:border-brand-primary transition-colors">
                  <input
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-full h-full rounded-xl" style={{ backgroundColor: value }} />
                </div>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v);
                  }}
                  maxLength={7}
                  className="w-full text-center bg-brand-surface border border-brand-border rounded-lg px-2 py-1.5 text-brand-text font-mono text-xs focus:outline-none focus:border-brand-primary transition-colors"
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Form fields ──────────────────────────────────────────────── */}
        <div className="space-y-8">

          {/* Team logos */}
          <UploadZone
            label="Team Logos"
            hint="Upload your team logo(s) — the AI extracts your color palette and brand language from these. The first logo appears on the jersey preview."
            images={logoUrls}
            onAdd={handleLogos}
            onRemove={removeLogo}
            uploading={logoUploading}
            error={logoError}
          />

          {/* Reference images */}
          <UploadZone
            label="Reference Images"
            hint="Upload inspiration images — jerseys, palettes, logos you like. The AI uses these for visual direction."
            images={refUrls}
            onAdd={handleRefs}
            onRemove={removeRef}
            uploading={refUploading}
            error={refError}
          />

          {/* Text fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                  Logos to Include <span className="normal-case font-barlow font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={logosToInclude}
                  onChange={(e) => setLogosToInclude(e.target.value)}
                  placeholder="e.g. school crest, conference patch"
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                  Sponsor Text / Patch <span className="normal-case font-barlow font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={sponsorText}
                  onChange={(e) => setSponsorText(e.target.value)}
                  placeholder="e.g. Powered by Nike"
                  className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                What to Avoid <span className="normal-case font-barlow font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={negativeReferences}
                onChange={(e) => setNegativeReferences(e.target.value)}
                placeholder="e.g. no camo, avoid busy graphics, keep it clean"
                className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-brand-muted mb-2">
                Vision Notes <span className="normal-case font-barlow font-normal">(optional)</span>
              </label>
              <textarea
                value={visionPrompt}
                onChange={(e) => setVisionPrompt(e.target.value)}
                placeholder="Describe your vision — vibe, inspiration, specific elements you want on the jersey…"
                rows={4}
                className="w-full bg-brand-surface border border-brand-border rounded-lg px-4 py-3 text-brand-text font-barlow text-sm placeholder-brand-muted focus:outline-none focus:border-brand-primary transition-colors resize-none"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push(`/brief/${order_id}/style`)}
              className="px-6 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue || logoUploading || refUploading}
              className="flex-1 py-3 rounded-lg font-display font-bold text-base uppercase tracking-widest transition-all duration-200
                bg-brand-primary text-brand-bg hover:bg-brand-secondary
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue to Review →
            </button>
          </div>

        </div>
      </div>
    </BriefLayout>
  );
}

"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import JerseyPreview, { SYSTEM_DEFAULTS } from "@/components/brief/JerseyPreview";
import { loadBriefState, saveBriefState } from "@/lib/brief-state";
import { createClient } from "@/lib/supabase/client";

// ── Constants ────────────────────────────────────────────────────────────────

const LOGO_PLACEMENTS = [
  { id: "chest",     label: "Chest",     description: "Front chest, visible when tucked in" },
  { id: "back_neck", label: "Back Neck", description: "Upper back near neckline" },
  { id: "sleeve",    label: "Sleeve",    description: "Left or right sleeve" },
] as const;

const NUMBER_STYLES = ["Block Bold", "Collegiate", "Old English", "Outline", "Varsity", "Custom"];

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
      <p className="text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-1">{label}</p>
      <p className="text-xs text-gs-muted font-barlow mb-3 leading-relaxed">{hint}</p>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mb-3">
          {images.map((url) => (
            <div key={url} className="relative w-16 h-16 rounded-xl overflow-hidden border border-gs-border group">
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
          ${drag ? "border-gs-gold bg-gs-gold/5" : "border-gs-border bg-gs-dark-3 hover:border-gs-muted"}`}
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
          <div className="w-5 h-5 border-2 border-gs-gold border-t-transparent rounded-full animate-spin mx-auto" />
        ) : (
          <>
            <svg className="w-5 h-5 text-gs-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <div>
              <p className="text-sm font-barlow text-gs-white">
                {images.length > 0 ? "Add more" : "Drop files here"}
              </p>
              <p className="text-xs text-gs-muted font-barlow">or click to browse — PNG, SVG, JPG</p>
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

  // Brief state hydration
  const [designSystem, setDesignSystem] = useState("");
  const [teamName,     setTeamName]     = useState("");

  // Color state — initialized from brief or system defaults
  const [primaryColor,   setPrimaryColor]   = useState("#0C0C0C");
  const [secondaryColor, setSecondaryColor] = useState("#CC1B1B");
  const [accentColor,    setAccentColor]    = useState("#E5E5E5");

  // Preview-only state
  const [jerseyNumber, setJerseyNumber] = useState("00");

  // Upload state
  const [logoUrls, setLogoUrls] = useState<string[]>([]);
  const [refUrls,  setRefUrls]  = useState<string[]>([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [refUploading,  setRefUploading]  = useState(false);
  const [logoError, setLogoError] = useState("");
  const [refError,  setRefError]  = useState("");

  // Form state
  const [gsLogoPlacement, setGsLogoPlacement] = useState<"chest" | "back_neck" | "sleeve" | "">("");
  const [numberStyle,     setNumberStyle]     = useState("");
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
    setGsLogoPlacement(state.gsLogoPlacement ?? "");
    setNumberStyle(state.numberStyle ?? "");
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

  const canContinue = !!gsLogoPlacement;

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
      gsLogoPlacement: gsLogoPlacement as "chest" | "back_neck" | "sleeve",
      numberStyle,
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
      title="Logo & Jersey Details"
      subtitle="Configure your jersey below — uploads and choices feed directly into the AI."
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-col lg:flex-row gap-8 items-start">

        {/* ── LEFT: sticky jersey preview ─────────────────────────────── */}
        <div className="w-full lg:w-[300px] xl:w-[320px] lg:sticky lg:top-8 flex-shrink-0">
          <JerseyPreview
            system={designSystem}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            accentColor={accentColor}
            onPrimaryChange={handlePrimaryChange}
            onSecondaryChange={handleSecondaryChange}
            onAccentChange={handleAccentChange}
            teamName={teamName}
            jerseyNumber={jerseyNumber}
            onNumberChange={setJerseyNumber}
            logoUrls={logoUrls}
            logoPlacement={gsLogoPlacement}
            numberStyle={numberStyle}
            orderId={order_id}
            supabase={supabase}
            onConceptSaved={() => {/* toast handled by button state */}}
          />
        </div>

        {/* ── RIGHT: form ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-8">

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

          {/* GS logo placement (required) */}
          <div>
            <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-3">
              Grace Athletics Logo Placement
              <span className="ml-2 text-red-500 normal-case font-barlow font-normal">Required</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {LOGO_PLACEMENTS.map((p) => {
                const isSelected = gsLogoPlacement === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setGsLogoPlacement(p.id);
                      saveBriefState({ gsLogoPlacement: p.id });
                    }}
                    className={`text-left p-4 rounded-xl border transition-all duration-200
                      ${isSelected
                        ? "border-gs-gold bg-gs-dark-3"
                        : "border-gs-border bg-gs-dark-3 hover:border-gs-muted"
                      }`}
                  >
                    <p className={`font-display font-bold uppercase tracking-wide text-sm ${isSelected ? "text-gs-gold" : "text-gs-white"}`}>
                      {p.label}
                    </p>
                    <p className="text-xs text-gs-muted font-barlow mt-1 leading-relaxed">{p.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Number style */}
          <div>
            <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-3">
              Number Style <span className="normal-case font-barlow font-normal">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {NUMBER_STYLES.map((ns) => (
                <button
                  key={ns}
                  type="button"
                  onClick={() => setNumberStyle(ns === numberStyle ? "" : ns)}
                  className={`px-4 py-2 rounded-full text-sm font-barlow transition-all duration-150
                    ${numberStyle === ns
                      ? "bg-gs-gold text-gs-dark font-medium"
                      : "bg-gs-dark-3 border border-gs-border text-gs-muted hover:border-gs-gold hover:text-gs-white"
                    }`}
                >
                  {ns}
                </button>
              ))}
            </div>
          </div>

          {/* Text fields */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2">
                  Logos to Include <span className="normal-case font-barlow font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={logosToInclude}
                  onChange={(e) => setLogosToInclude(e.target.value)}
                  placeholder="e.g. school crest, conference patch"
                  className="w-full bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors"
                />
              </div>
              <div>
                <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2">
                  Sponsor Text / Patch <span className="normal-case font-barlow font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={sponsorText}
                  onChange={(e) => setSponsorText(e.target.value)}
                  placeholder="e.g. Powered by Nike"
                  className="w-full bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2">
                What to Avoid <span className="normal-case font-barlow font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={negativeReferences}
                onChange={(e) => setNegativeReferences(e.target.value)}
                placeholder="e.g. no camo, avoid busy graphics, keep it clean"
                className="w-full bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-display uppercase tracking-[0.2em] text-gs-muted mb-2">
                Vision Notes <span className="normal-case font-barlow font-normal">(optional)</span>
              </label>
              <textarea
                value={visionPrompt}
                onChange={(e) => setVisionPrompt(e.target.value)}
                placeholder="Describe your vision — vibe, inspiration, specific elements you want on the jersey…"
                rows={4}
                className="w-full bg-gs-dark-3 border border-gs-border rounded-lg px-4 py-3 text-gs-white font-barlow text-sm placeholder-gs-muted focus:outline-none focus:border-gs-gold transition-colors resize-none"
              />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.push(`/brief/${order_id}/style`)}
              className="px-6 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest border border-gs-border text-gs-muted hover:text-gs-white hover:border-gs-muted transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!canContinue || logoUploading || refUploading}
              className="flex-1 py-3 rounded-lg font-display font-bold text-base uppercase tracking-widest transition-all duration-200
                bg-gs-gold text-gs-dark hover:bg-gs-gold-light
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

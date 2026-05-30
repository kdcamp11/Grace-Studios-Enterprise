"use client";

import { useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import OrgLogo from "@/components/OrgLogo";

const DESIGN_ACCEPTED = ".ai,.eps,.pdf,.svg";
const DESIGN_LABEL     = "Adobe Illustrator (.ai), EPS, PDF, or SVG";
const PHOTO_ACCEPTED   = ".jpg,.jpeg,.png,.webp";
const PHOTO_LABEL      = "JPG, PNG, or WEBP";
const MAX_MB = 50;

export default function UploadProductionFilePage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router        = useRouter();

  const [file, setFile]           = useState<File | null>(null);
  const [photo, setPhoto]         = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [notes, setNotes]         = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [dragOver, setDragOver]       = useState(false);
  const [photoDragOver, setPhotoDragOver] = useState(false);

  const inputRef      = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_MB}MB.`);
      return;
    }
    setFile(f);
    setError(null);
  }, []);

  const handlePhoto = useCallback((f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`Photo is too large. Maximum size is ${MAX_MB}MB.`);
      return;
    }
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
    setError(null);
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function handlePhotoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handlePhoto(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  function handlePhotoDrop(e: React.DragEvent) {
    e.preventDefault();
    setPhotoDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handlePhoto(f);
  }

  const fileExt = file?.name.split(".").pop()?.toUpperCase() ?? "";

  async function handleUpload() {
    if (!file || !photo) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("photo", photo);
      if (notes.trim()) formData.append("notes", notes.trim());

      const res = await fetch(`/api/orders/${order_id}/upload-concept`, {
        method: "POST",
        body:   formData,
      });

      const data = await res.json() as { url?: string; orderId?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Upload failed. Please try again.");
      }

      // Success — review the uploaded file before activation/checkout
      router.push(`/brief/${order_id}/upload-review`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <header className="border-b border-brand-border px-6 py-4 flex items-center justify-between">
        <OrgLogo href="/portal" />
        <button
          type="button"
          onClick={() => router.back()}
          className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors"
        >
          ← Back
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-lg space-y-7">

          {/* Heading */}
          <div>
            <p className="text-[10px] font-display uppercase tracking-[0.3em] text-brand-primary mb-1">
              Production File Upload
            </p>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text leading-tight">
              Upload Your Artwork
            </h1>
            <p className="mt-2 text-sm text-brand-muted font-barlow leading-relaxed">
              Upload your production-ready file. Grace Studios will handle sublimation output,
              supplier coordination, and delivery. Everything stays under your brand.
            </p>
          </div>

          {/* IP notice */}
          <div className="flex items-start gap-3 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-3.5">
            <svg className="w-4 h-4 text-brand-primary flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            <div>
              <p className="text-[10px] font-display font-bold uppercase tracking-wider text-brand-primary">Your IP, Protected</p>
              <p className="text-[10px] font-barlow text-brand-muted mt-0.5 leading-relaxed">
                All files you upload are and remain your intellectual property. Grace Studios will only
                use your artwork to fulfill your order and will never share, resell, or repurpose it.
              </p>
            </div>
          </div>

          {/* Helper note */}
          <div className="rounded-xl border border-brand-border bg-brand-surface px-4 py-3">
            <p className="text-[9px] font-barlow text-brand-muted/70 leading-relaxed">
              Both a <span className="text-brand-text font-medium">design file</span> and a{" "}
              <span className="text-brand-text font-medium">reference photo</span> are required.
              Need concept development from scratch?{" "}
              <a href="/contact" className="underline text-brand-primary hover:text-brand-secondary transition-colors">
                Try our Creative Direction path
              </a>{" "}
              — our team builds the concept with you.
            </p>
          </div>

          {/* ── Design file drop zone (required) ─────────────────────────── */}
          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-brand-text mb-2">
              1 · Design File <span className="text-brand-primary">*</span>
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`
                relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
                flex flex-col items-center justify-center gap-3 px-6 py-9
                ${dragOver
                  ? "border-brand-primary bg-brand-primary/5"
                  : file
                    ? "border-green-700/50 bg-green-950/5"
                    : "border-brand-border bg-brand-surface hover:border-brand-primary/50 hover:bg-brand-primary/5"
                }
              `}
            >
              <input
                ref={inputRef}
                type="file"
                accept={DESIGN_ACCEPTED}
                onChange={handleInputChange}
                className="hidden"
              />
              {file ? (
                <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center">
                  <span className="text-xs font-display font-bold uppercase tracking-widest text-brand-primary">{fileExt}</span>
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
              )}
              {file ? (
                <div className="text-center">
                  <p className="text-sm font-barlow font-medium text-brand-text truncate max-w-[260px]">{file.name}</p>
                  <p className="text-[10px] text-brand-muted font-barlow mt-0.5">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB, click to replace
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm font-barlow font-medium text-brand-text">
                    Drop your file here or <span className="text-brand-primary underline">browse</span>
                  </p>
                  <p className="text-[10px] text-brand-muted font-barlow mt-1">{DESIGN_LABEL}, up to {MAX_MB}MB</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Reference photo drop zone (required) ─────────────────────── */}
          <div>
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.22em] text-brand-text mb-2">
              2 · Reference Photo <span className="text-brand-primary">*</span>
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
              onDragLeave={() => setPhotoDragOver(false)}
              onDrop={handlePhotoDrop}
              onClick={() => photoInputRef.current?.click()}
              className={`
                relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
                flex flex-col items-center justify-center gap-3 px-6 py-9 overflow-hidden
                ${photoDragOver
                  ? "border-brand-primary bg-brand-primary/5"
                  : photo
                    ? "border-green-700/50 bg-green-950/5"
                    : "border-brand-border bg-brand-surface hover:border-brand-primary/50 hover:bg-brand-primary/5"
                }
              `}
            >
              <input
                ref={photoInputRef}
                type="file"
                accept={PHOTO_ACCEPTED}
                onChange={handlePhotoInputChange}
                className="hidden"
              />
              {photoPreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreview} alt="Reference preview" className="max-h-40 w-auto rounded-lg object-contain" />
                  <p className="text-[10px] text-brand-muted font-barlow truncate max-w-[260px]">
                    {photo?.name} · click to replace
                  </p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center">
                    <svg className="w-6 h-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-barlow font-medium text-brand-text">
                      Drop a photo here or <span className="text-brand-primary underline">browse</span>
                    </p>
                    <p className="text-[10px] text-brand-muted font-barlow mt-1">{PHOTO_LABEL}, up to {MAX_MB}MB</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Production notes */}
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">
              Production notes <span className="normal-case tracking-normal text-brand-muted/60">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Color references, sizing specs, placement instructions, pantone codes…"
              className="w-full bg-brand-surface border border-brand-border rounded-xl px-4 py-3 text-brand-text font-barlow text-sm
                placeholder-brand-muted/50 focus:outline-none focus:border-brand-primary transition-colors resize-none"
            />
          </div>

          {/* What happens next */}
          <div className="rounded-2xl border border-brand-border bg-brand-surface px-5 py-4">
            <p className="text-[9px] font-display font-bold uppercase tracking-[0.28em] text-brand-muted mb-3">
              What happens next
            </p>
            <ol className="space-y-3">
              {[
                "Upload your production file (you're here)",
                "Activate your project: $149 applied to your final order total",
                "Grace Studios designer prepares production-ready output",
                "You approve the final artwork before production begins",
                "Supplier produces and ships to your team",
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

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 font-barlow bg-red-950/20 border border-red-800/40 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || !photo || uploading}
            className="w-full py-4 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em]
              bg-brand-primary text-white hover:bg-brand-secondary
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200 shadow-[0_4px_24px_rgba(212,175,55,0.2)]
              hover:shadow-[0_4px_32px_rgba(212,175,55,0.35)]"
          >
            {uploading
              ? "Uploading…"
              : file && photo
                ? "Proceed to Activation →"
                : !file
                  ? "Add a Design File to Continue"
                  : "Add a Reference Photo to Continue"}
          </button>

        </div>
      </main>
    </div>
  );
}

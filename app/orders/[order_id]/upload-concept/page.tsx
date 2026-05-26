"use client";

import { useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import OrgLogo from "@/components/OrgLogo";

const ACCEPTED = ".jpg,.jpeg,.png,.webp,.gif,.pdf";
const MAX_MB   = 20;

export default function UploadConceptPage() {
  const { order_id } = useParams<{ order_id: string }>();
  const router        = useRouter();

  const [file, setFile]           = useState<File | null>(null);
  const [preview, setPreview]     = useState<string | null>(null);
  const [notes, setNotes]         = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [dragOver, setDragOver]   = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_MB}MB.`);
      return;
    }
    setFile(f);
    setError(null);

    // Generate a preview for images
    if (f.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null); // PDF — no inline preview
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (notes.trim()) formData.append("notes", notes.trim());

      const res = await fetch(`/api/orders/${order_id}/upload-concept`, {
        method: "POST",
        body:   formData,
      });

      const data = await res.json() as { url?: string; orderId?: string; error?: string };

      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Upload failed. Please try again.");
      }

      // Upload successful — go to checkout for design execution deposit
      router.push(`/orders/${order_id}/checkout`);
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
              Client Concept Upload
            </p>
            <h1 className="font-display text-3xl font-bold uppercase tracking-wide text-brand-text leading-tight">
              Upload Your Design
            </h1>
            <p className="mt-2 text-sm text-brand-muted font-barlow leading-relaxed">
              Upload your artwork, sketch, or mockup. A Grace Studios designer will
              execute it into a production-ready Illustrator file.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`
              relative rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer
              flex flex-col items-center justify-center gap-4 px-6 py-12
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
              accept={ACCEPTED}
              onChange={handleInputChange}
              className="hidden"
            />

            {/* Preview or icon */}
            {preview ? (
              <div className="relative w-32 h-32 rounded-xl overflow-hidden border border-brand-border shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Concept preview" className="w-full h-full object-contain" />
              </div>
            ) : file ? (
              /* PDF indicator */
              <div className="w-16 h-16 rounded-2xl bg-red-900/20 border border-red-700/30 flex items-center justify-center">
                <span className="text-xs font-display font-bold uppercase tracking-widest text-red-400">PDF</span>
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 border border-brand-primary/30 flex items-center justify-center">
                <svg className="w-6 h-6 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
              </div>
            )}

            {file ? (
              <div className="text-center">
                <p className="text-sm font-barlow font-medium text-brand-text truncate max-w-[260px]">
                  {file.name}
                </p>
                <p className="text-[10px] text-brand-muted font-barlow mt-0.5">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB — click to replace
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-barlow font-medium text-brand-text">
                  Drop your file here or <span className="text-brand-primary underline">browse</span>
                </p>
                <p className="text-[10px] text-brand-muted font-barlow mt-1">
                  JPEG, PNG, WebP, GIF or PDF — up to {MAX_MB}MB
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-2">
              Designer notes <span className="normal-case tracking-normal text-brand-muted/60">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Describe any changes you'd like, color requirements, sizing notes, etc."
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
                "Upload your concept (you're here)",
                "Pay $150 design execution deposit",
                "Designer executes your concept into a production-ready file",
                "You approve the final file before production begins",
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
            disabled={!file || uploading}
            className="w-full py-4 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em]
              bg-brand-primary text-white hover:bg-brand-secondary
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-all duration-200 shadow-[0_4px_24px_rgba(212,175,55,0.2)]
              hover:shadow-[0_4px_32px_rgba(212,175,55,0.35)]"
          >
            {uploading ? "Uploading…" : file ? "Upload Concept → Proceed to Payment" : "Select a File to Continue"}
          </button>

        </div>
      </main>
    </div>
  );
}

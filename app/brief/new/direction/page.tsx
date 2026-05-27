"use client";

import { useRef, DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useBrief } from "../context";
import { StepBar } from "../StepBar";
import { useTenant } from "@/lib/tenant/context";

export default function BriefDirectionPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tenant = useTenant();
  const {
    logoFile, setLogoFile,
    colorDirection, setColorDirection,
    references, setReferences,
  } = useBrief();

  function handleFile(file: File) {
    setLogoFile(file);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-12">
      {/* Wordmark */}
      <div className="w-full max-w-lg mb-10">
        <span className="font-display text-gold text-xl tracking-[0.2em] uppercase">
          {tenant.name}
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-8 flex flex-col gap-8">
        <StepBar current={3} />

        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-4xl font-semibold text-foreground leading-tight">
            Brand direction.
          </h1>
          <p className="font-body text-sm text-white/50 mt-1">
            Give us your logo and any color or creative references.
          </p>
        </div>

        {/* Fields */}
        <div className="flex flex-col gap-6">

          {/* ── Logo upload ── */}
          <div className="flex flex-col gap-2">
            <span className="font-display text-xs tracking-[0.15em] uppercase text-white/60">
              Upload your logo
            </span>

            {/* Off-screen real input — never visible regardless of CSS */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.svg,.ai,.eps,image/png,image/svg+xml"
              tabIndex={-1}
              aria-hidden="true"
              style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />

            {/* Styled drop zone — fully inline so it never depends on Tailwind loading */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload your logo. Click to browse or drag a file here"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "40px 24px",
                borderRadius: "12px",
                border: logoFile
                  ? "2px dashed rgba(196,163,90,0.4)"
                  : "2px dashed #242424",
                background: logoFile ? "rgba(196,163,90,0.03)" : "#131313",
                cursor: "pointer",
                userSelect: "none",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              {logoFile ? (
                <>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "rgba(196,163,90,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg viewBox="0 0 16 16" fill="none" width={16} height={16}>
                      <path d="M3 8.5l3.5 3.5 6.5-7" stroke="#C4A35A"
                        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p style={{ fontFamily: "var(--font-barlow),sans-serif", fontSize: 14, color: "#C4A35A", fontWeight: 500, margin: 0, textAlign: "center", wordBreak: "break-all" }}>
                    {logoFile.name}
                  </p>
                  <p style={{ fontFamily: "var(--font-barlow),sans-serif", fontSize: 12, color: "rgba(255,255,255,0.3)", margin: 0 }}>
                    Click to replace
                  </p>
                </>
              ) : (
                <>
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: "rgba(255,255,255,0.04)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg viewBox="0 0 16 16" fill="none" width={16} height={16}>
                      <path d="M8 11V5M8 5L5.5 7.5M8 5l2.5 2.5"
                        stroke="rgba(255,255,255,0.35)" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M2.5 13h11" stroke="rgba(255,255,255,0.15)"
                        strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontFamily: "var(--font-barlow),sans-serif", fontSize: 14, color: "rgba(255,255,255,0.5)", margin: 0 }}>
                      Drop your logo here
                    </p>
                    <p style={{ fontFamily: "var(--font-barlow),sans-serif", fontSize: 12, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>
                      PNG, AI, EPS, or SVG. Click to browse.
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Color direction ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor="colorDirection"
                className="font-display text-xs tracking-[0.15em] uppercase text-white/60">
                Color direction
              </label>
              <span className="font-body text-xs text-white/25">Optional</span>
            </div>
            <textarea
              id="colorDirection"
              rows={3}
              placeholder="e.g. dark navy and gold, or our school colors are blue and white. We want to keep those."
              value={colorDirection}
              onChange={(e) => setColorDirection(e.target.value)}
              className="font-body bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-white/25 focus:outline-none focus:border-gold transition-colors text-sm resize-none"
            />
          </div>

          {/* ── References or notes ── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor="references"
                className="font-display text-xs tracking-[0.15em] uppercase text-white/60">
                References or notes
              </label>
              <span className="font-body text-xs text-white/25">Optional</span>
            </div>
            <textarea
              id="references"
              rows={3}
              placeholder="e.g. similar to what the Nets wore in 2021, nothing too flashy."
              value={references}
              onChange={(e) => setReferences(e.target.value)}
              className="font-body bg-background border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-white/25 focus:outline-none focus:border-gold transition-colors text-sm resize-none"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/brief/new/style")}
            className="font-display tracking-[0.12em] uppercase text-sm px-6 py-4 rounded-xl border border-border text-white/50 hover:border-white/30 hover:text-white/70 transition-all"
          >
            ← Back
          </button>
          <button
            type="button"
            disabled={logoFile === null}
            onClick={() => router.push("/brief/review")}
            className={[
              "flex-1 font-display tracking-[0.15em] uppercase text-sm py-4 rounded-xl transition-all",
              logoFile !== null
                ? "bg-gold text-background font-semibold hover:brightness-110 active:brightness-95"
                : "bg-border text-white/25 cursor-not-allowed",
            ].join(" ")}
          >
            Continue →
          </button>
        </div>
      </div>
    </div>
  );
}

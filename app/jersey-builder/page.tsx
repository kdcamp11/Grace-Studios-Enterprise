"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient, sessionReady } from "@/lib/supabase/client";
import { getProfile } from "@/lib/profile";
import Link from "next/link";

// Extend JSX for the model-viewer web component
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string; alt?: string; "camera-controls"?: boolean | string;
        "shadow-intensity"?: string; exposure?: string; style?: React.CSSProperties;
        "min-camera-orbit"?: string; "max-camera-orbit"?: string; "camera-orbit"?: string; id?: string;
      }, HTMLElement>;
    }
  }
}

// ── Simple color picker row (no swatches) ────────────────────────────────────
function ColorControl({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-barlow text-brand-muted font-mono">{value.toUpperCase()}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-brand-border bg-transparent"
        />
      </div>
    </div>
  );
}

// ── Per-logo state ────────────────────────────────────────────────────────────
interface LogoItem {
  id: string;
  fileName: string;
  originalUrl: string;
  tintedUrl: string | null;
  color: string;
  pos: { x: number; y: number };
  size: number;
}

function tintImage(src: string, color: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, c.width, c.height);
      resolve(c.toDataURL());
    };
    img.src = src;
  });
}

export default function JerseyBuilderPage() {
  const router = useRouter();
  const [ready, setReady]               = useState(false);

  // jersey colors
  const [jerseyColor, setJerseyColor]       = useState("#1d3557");
  const [shortsColor, setShortsColor]       = useState("#1d3557");
  const [highlightColor, setHighlightColor] = useState("#f4d03f");

  // model-viewer state
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [modelLoaded, setModelLoaded]   = useState(false);

  // logos
  const [logos, setLogos]               = useState<LogoItem[]>([]);
  const [draggingId, setDraggingId]     = useState<string | null>(null);
  const [resizingId, setResizingId]     = useState<string | null>(null);
  const resizeStartRef                  = useRef<{ x: number; size: number } | null>(null);

  const containerRef  = useRef<HTMLDivElement>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function check() {
      try {
        createClient();
        await sessionReady();
        const profile = await getProfile();
        if (!profile) { router.replace("/login"); return; }
        if (profile.role === "supplier") { router.replace("/supplier"); return; }
        setReady(true);
      } catch { router.replace("/login"); }
    }
    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── model-viewer script ───────────────────────────────────────────────────
  useEffect(() => {
    if (!ready) return;
    if (document.querySelector("script[data-mv]")) { setScriptLoaded(true); return; }
    const s = document.createElement("script");
    s.type = "module"; s.setAttribute("data-mv", "1");
    s.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";
    s.onload = () => setScriptLoaded(true);
    document.head.appendChild(s);
  }, [ready]);

  // ── model load event ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!scriptLoaded) return;
    const mv = document.getElementById("jersey-mv");
    if (!mv) return;
    const onLoad = () => setModelLoaded(true);
    mv.addEventListener("load", onLoad);
    return () => mv.removeEventListener("load", onLoad);
  }, [scriptLoaded]);

  // ── Apply named-material colors ───────────────────────────────────────────
  // Material mapping — Jersey.glb has exactly 3 OPAQUE materials (no diffuse
  // texture) so setBaseColorFactor gives full, clean color control:
  //   "jersey_body"  → jersey top (body, collar, stitching)
  //   "shorts_body"  → shorts (legs, waist, side panels of shorts)
  //   "panels"       → side panels + sleeve panels (jersey + shorts)
  useEffect(() => {
    if (!modelLoaded) return;

    const toRgb = (hex: string): [number, number, number, number] => {
      const h = hex.replace("#", "");
      return [
        parseInt(h.slice(0,2), 16) / 255,
        parseInt(h.slice(2,4), 16) / 255,
        parseInt(h.slice(4,6), 16) / 255,
        1,
      ];
    };

    function apply(): boolean {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mv = document.getElementById("jersey-mv") as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mats: Array<any> | undefined = mv?.model?.materials;
      if (!mats?.length) return false;

      mats.forEach((mat: any) => {
        const n = (mat.name ?? "").toLowerCase();
        let color: [number, number, number, number];

        if (n === "jersey_body") {
          color = toRgb(jerseyColor);
        } else if (n === "shorts_body") {
          color = toRgb(shortsColor);
        } else {
          // "panels" + any future materials default to panels/accent color
          color = toRgb(highlightColor);
        }

        mat.pbrMetallicRoughness.setBaseColorFactor(color);
      });
      return true;
    }

    // model-viewer fires 'load' slightly before mv.model.materials is populated.
    // Retry with back-off so we never silently drop a color update.
    let cancelled = false;
    let attempt = 0;
    function tryApply() {
      if (cancelled) return;
      if (apply()) return;
      if (attempt < 6) {
        attempt++;
        setTimeout(tryApply, attempt * 250);
      }
    }
    requestAnimationFrame(tryApply);
    return () => { cancelled = true; };
  }, [jerseyColor, shortsColor, highlightColor, modelLoaded]);

  // ── Logo helpers ──────────────────────────────────────────────────────────
  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    // Reset input so same file can be re-uploaded
    e.target.value = "";
    for (const file of files) {
      const originalUrl = URL.createObjectURL(file);
      const tintedUrl   = await tintImage(originalUrl, "#ffffff");
      setLogos((prev) => [...prev, {
        id: crypto.randomUUID(), fileName: file.name,
        originalUrl, tintedUrl, color: "#ffffff",
        pos: { x: 50, y: 40 }, size: 20,
      }]);
    }
  }, []);

  const updateLogoColor = useCallback(async (id: string, color: string) => {
    setLogos((prev) => prev.map((l) => l.id === id ? { ...l, color, tintedUrl: null } : l));
    setLogos((prev) => {
      const logo = prev.find((l) => l.id === id);
      if (!logo) return prev;
      tintImage(logo.originalUrl, color).then((tintedUrl) => {
        setLogos((p) => p.map((l) => l.id === id ? { ...l, tintedUrl } : l));
      });
      return prev;
    });
  }, []);

  const removeLogo = useCallback((id: string) => {
    setLogos((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // ── Drag / resize ─────────────────────────────────────────────────────────
  const handleLogoPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDraggingId(id);
  }, []);

  const handleResizePointerDown = useCallback((e: React.PointerEvent, id: string, currentSize: number) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeStartRef.current = { x: e.clientX, size: currentSize };
    setResizingId(id);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    if (resizingId && resizeStartRef.current) {
      const dx = ((e.clientX - resizeStartRef.current.x) / rect.width) * 100;
      const newSize = Math.max(5, Math.min(60, resizeStartRef.current.size + dx));
      setLogos((prev) => prev.map((l) => l.id === resizingId ? { ...l, size: newSize } : l));
      return;
    }
    if (draggingId) {
      const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
      setLogos((prev) => prev.map((l) => l.id === draggingId ? { ...l, pos: { x, y } } : l));
    }
  }, [draggingId, resizingId]);

  const handlePointerUp = useCallback(() => {
    setDraggingId(null);
    setResizingId(null);
    resizeStartRef.current = null;
  }, []);

  // ── Loading gate ──────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const anyActive = !!draggingId || !!resizingId;

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {/* Header */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-4 flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/grace-enterprise-logo.jpeg" alt="Grace Enterprise" style={{ width: 160 }} className="h-auto object-contain" />
        <div className="flex items-center gap-5">
          <Link href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">← Portal</Link>
          <Link href="/brief/new" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">Text Brief</Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── 3D Viewport ─────────────────────────────────────────────────── */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-[420px] bg-[#f0f0f0]"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {scriptLoaded && (
            <model-viewer
              id="jersey-mv"
              src="/Jersey.glb"
              alt="Jersey 3D model"
              camera-controls
              shadow-intensity="0.8"
              exposure="1.1"
              camera-orbit="0deg 70deg auto"
              min-camera-orbit="auto 0deg 80%"
              max-camera-orbit="auto 160deg 200%"
              style={{ width: "100%", height: "100%", minHeight: "420px", backgroundColor: "#f0f0f0", "--poster-color": "#f0f0f0" } as React.CSSProperties}
            />
          )}

          {/* Loading overlay */}
          {(!scriptLoaded || !modelLoaded) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#f0f0f0]">
              <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-[11px] font-barlow text-gray-400 uppercase tracking-widest">
                {!scriptLoaded ? "Loading 3D viewer…" : "Loading jersey model…"}
              </p>
            </div>
          )}

          {/* Viewport label */}
          <div className="absolute top-4 left-5 flex items-center gap-2 pointer-events-none">
            <div className="w-[3px] h-4 bg-brand-primary" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.25em] text-brand-text/70">Jersey Builder</span>
          </div>

          {/* Color badges */}
          <div className="absolute top-4 right-5 flex items-center gap-1.5 pointer-events-none">
            {[["Jersey", jerseyColor], ["Shorts", shortsColor], ["Panels", highlightColor]].map(([label, color]) => (
              <div key={label} className="flex items-center gap-1.5 bg-white/80 backdrop-blur px-2 py-1.5 rounded-full border border-gray-200 shadow-sm">
                <div className="w-3 h-3 rounded-full border border-gray-300" style={{ backgroundColor: color }} />
                <span className="text-[9px] font-barlow text-gray-500 uppercase tracking-wider">{label}</span>
              </div>
            ))}
          </div>

          {/* Logo overlays — each appears printed on the jersey surface */}
          {logos.map((logo) => {
            if (!logo.tintedUrl) return null;
            const isThisDragging = draggingId === logo.id;
            const isThisResizing = resizingId === logo.id;
            return (
              <div
                key={logo.id}
                style={{
                  position: "absolute",
                  left: `${logo.pos.x}%`,
                  top: `${logo.pos.y}%`,
                  transform: "translate(-50%, -50%)",
                  width: `${logo.size}%`,
                  userSelect: "none",
                  touchAction: "none",
                  // Mix-blend-mode multiply makes white areas transparent — logo
                  // appears embedded in the fabric rather than floating above it
                  mixBlendMode: "multiply",
                }}
              >
                <img
                  src={logo.tintedUrl}
                  alt="logo"
                  onPointerDown={(e) => handleLogoPointerDown(e, logo.id)}
                  draggable={false}
                  style={{
                    width: "100%",
                    display: "block",
                    cursor: isThisDragging ? "grabbing" : "grab",
                    opacity: isThisDragging ? 0.85 : 1,
                  }}
                />
                {/* Resize handle */}
                <div
                  onPointerDown={(e) => handleResizePointerDown(e, logo.id, logo.size)}
                  style={{
                    position: "absolute", bottom: -7, right: -7,
                    width: 15, height: 15, borderRadius: "50%",
                    background: "white", border: "2px solid #666",
                    cursor: isThisResizing ? "ew-resize" : "se-resize",
                    touchAction: "none", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                    mixBlendMode: "normal",
                  }}
                />
              </div>
            );
          })}

          {/* Hint bar */}
          {logos.length > 0 && !anyActive && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-brand-bg/80 backdrop-blur px-3 py-1.5 rounded-full border border-brand-border pointer-events-none">
              <p className="text-[10px] font-barlow text-brand-muted whitespace-nowrap">Drag logo to move · ◎ corner to resize · Drag background to rotate</p>
            </div>
          )}
        </div>

        {/* ── Controls Panel ───────────────────────────────────────────────── */}
        <div className="w-full lg:w-[320px] border-t lg:border-t-0 lg:border-l border-brand-border bg-brand-bg flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-7 space-y-6">

            <p className="text-[10px] font-barlow text-brand-muted leading-relaxed">
              Pick jersey, shorts, and accent colors, then upload your team logo(s) and position them on the jersey.
            </p>

            <div className="h-px bg-brand-border" />

            {/* Colors */}
            <div className="space-y-4">
              <ColorControl label="Jersey Color"  value={jerseyColor}    onChange={setJerseyColor} />
              <ColorControl label="Shorts Color"  value={shortsColor}    onChange={setShortsColor} />
              <ColorControl label="Panels Color"  value={highlightColor} onChange={setHighlightColor} />
            </div>

            <div className="h-px bg-brand-border" />

            {/* Logos */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted">
                  Team Logos
                </label>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[9px] font-display font-bold uppercase tracking-widest text-brand-primary hover:text-brand-secondary transition-colors"
                >
                  + Add Logo
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                multiple
                onChange={handleLogoUpload}
                className="hidden"
              />

              {logos.length === 0 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-3 rounded-lg border border-dashed border-brand-border text-xs font-barlow text-brand-muted hover:border-brand-primary hover:text-brand-primary transition-colors"
                >
                  Upload Logo (PNG, SVG, JPG)
                </button>
              )}

              <p className="text-[9px] font-barlow text-brand-muted/60">
                PNG with transparent background works best.
              </p>

              {/* Per-logo controls */}
              {logos.map((logo, i) => (
                <div key={logo.id} className="rounded-xl border border-brand-border bg-brand-surface p-3 space-y-3">
                  {/* Header row */}
                  <div className="flex items-center gap-2">
                    <img src={logo.tintedUrl || logo.originalUrl} alt="" className="w-8 h-8 object-contain rounded flex-shrink-0" />
                    <p className="text-[10px] font-barlow text-brand-text truncate flex-1">
                      Logo {i + 1}{logo.fileName ? ` — ${logo.fileName}` : ""}
                    </p>
                    <button
                      onClick={() => removeLogo(logo.id)}
                      className="text-[9px] font-display uppercase tracking-widest text-brand-muted hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>

                  {/* Color + size row */}
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[9px] font-display font-bold uppercase tracking-[0.15em] text-brand-muted/70">Color</label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-barlow text-brand-muted/70 font-mono">{logo.color.toUpperCase()}</span>
                      <input
                        type="color"
                        value={logo.color}
                        onChange={(e) => updateLogoColor(logo.id, e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-brand-border"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-display font-bold uppercase tracking-[0.15em] text-brand-muted/70">Size</label>
                      <span className="text-[9px] font-barlow text-brand-muted/70">{Math.round(logo.size)}%</span>
                    </div>
                    <input
                      type="range" min={5} max={60} value={logo.size}
                      onChange={(e) => setLogos((prev) => prev.map((l) => l.id === logo.id ? { ...l, size: Number(e.target.value) } : l))}
                      className="w-full h-1.5 rounded-full appearance-none bg-brand-border accent-[var(--brand-primary)] cursor-pointer"
                    />
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* CTA */}
          <div className="border-t border-brand-border px-6 py-5 space-y-3">
            <Link
              href={`/brief/new?jerseyColor=${encodeURIComponent(jerseyColor)}&shortsColor=${encodeURIComponent(shortsColor)}&accentColor=${encodeURIComponent(highlightColor)}`}
              className="flex items-center justify-center w-full py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
            >
              Continue to Brief →
            </Link>
            <p className="text-[9px] font-barlow text-brand-muted/70 text-center leading-relaxed">
              Your color selections will be pre-filled in your design brief.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

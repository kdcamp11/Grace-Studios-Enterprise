"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

// ── Color picker row ──────────────────────────────────────────────────────────
function ColorControl({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[10px] font-display font-bold uppercase tracking-[0.15em] text-brand-muted whitespace-nowrap">
        {label}
      </label>
      <div className="flex items-center gap-2 flex-shrink-0">
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

// ── GLB material zones ────────────────────────────────────────────────────────
// Matches the material names baked into public/Jersey.glb
const ZONES = [
  { key: "jerseyTop",        matName: "jersey_top",          label: "Jersey Top"              },
  { key: "collar",           matName: "collar",              label: "Collar"                  },
  { key: "jerseyShorts",     matName: "jersey_shorts",       label: "Shorts"                  },
  { key: "jerseySidePanels", matName: "jersey_side_panels",  label: "Jersey Side Panels"      },
  { key: "jerseyLowerPanels",matName: "jersey_lower_panels", label: "Jersey Lower Side Panels"},
  { key: "sleevePanels",     matName: "sleeve_panels",       label: "Sleeve Panels"           },
  { key: "shortSidePanels",  matName: "short_side_panels",   label: "Shorts Side Panels"      },
] as const;

type ZoneKey = typeof ZONES[number]["key"];
type ZoneColors = Record<ZoneKey, string>;

const DEFAULT_COLORS: ZoneColors = {
  jerseyTop:         "#1d3557",
  collar:            "#f4d03f",
  jerseyShorts:      "#1d3557",
  jerseySidePanels:  "#f4d03f",
  jerseyLowerPanels: "#f4d03f",
  sleevePanels:      "#f4d03f",
  shortSidePanels:   "#f4d03f",
};

// ── Per-logo state ────────────────────────────────────────────────────────────
interface LogoItem {
  id: string;
  fileName: string;
  originalUrl: string;   // always the unmodified blob URL
  tintedUrl: string | null; // null = use original (no tint applied yet)
  color: string;         // empty string = no tint
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

function JerseyBuilderInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const orderId      = searchParams.get("orderId"); // set when entering from /brief/[id]/choose
  const [ready, setReady] = useState(false);

  // One color state per zone
  const [colors, setColors] = useState<ZoneColors>(DEFAULT_COLORS);

  // model-viewer state
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [modelLoaded, setModelLoaded]   = useState(false);

  // logos
  const [logos, setLogos]           = useState<LogoItem[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null);
  const resizeStartRef              = useRef<{ x: number; size: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ── Apply zone colors via model-viewer material API ───────────────────────
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
        const n = mat.name as string;
        const zone = ZONES.find((z) => z.matName === n);
        if (!zone) return;
        mat.pbrMetallicRoughness.setBaseColorFactor(toRgb(colors[zone.key]));
      });
      return true;
    }

    let cancelled = false;
    let attempt = 0;
    function tryApply() {
      if (cancelled) return;
      if (apply()) return;
      if (attempt < 6) { attempt++; setTimeout(tryApply, attempt * 250); }
    }
    requestAnimationFrame(tryApply);
    return () => { cancelled = true; };
  }, [colors, modelLoaded]);

  // ── Logo upload ───────────────────────────────────────────────────────────
  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    e.target.value = "";
    for (const file of files) {
      const originalUrl = URL.createObjectURL(file);
      setLogos((prev) => [...prev, {
        id: crypto.randomUUID(),
        fileName: file.name,
        originalUrl,
        tintedUrl: null,   // show original colors by default (no tint)
        color: "",
        pos: { x: 50, y: 40 },
        size: 20,
      }]);
    }
  }, []);

  const updateLogoColor = useCallback(async (id: string, color: string) => {
    const logo = logos.find((l) => l.id === id);
    if (!logo) return;
    // Optimistically clear tintedUrl while re-tinting
    setLogos((prev) => prev.map((l) => l.id === id ? { ...l, color, tintedUrl: null } : l));
    const tintedUrl = await tintImage(logo.originalUrl, color);
    setLogos((prev) => prev.map((l) => l.id === id ? { ...l, tintedUrl } : l));
  }, [logos]);

  const removeLogo = useCallback((id: string) => {
    setLogos((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // ── Logo drag / resize ────────────────────────────────────────────────────
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
      setLogos((prev) => prev.map((l) =>
        l.id === resizingId
          ? { ...l, size: Math.max(5, Math.min(60, resizeStartRef.current!.size + dx)) }
          : l
      ));
      return;
    }
    if (draggingId) {
      const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
      setLogos((prev) => prev.map((l) => l.id === draggingId ? { ...l, pos: { x, y } } : l));
    }
  }, [draggingId, resizingId]);

  const handlePointerUp = useCallback(() => {
    setDraggingId(null); setResizingId(null); resizeStartRef.current = null;
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

        {/* ── 3D Viewport ── */}
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

          {/* Logo overlays */}
          {logos.map((logo) => {
            const src = logo.tintedUrl ?? logo.originalUrl;
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
                  // multiply blend: transparent areas stay clear, colored areas
                  // appear embedded in the fabric; works best with transparent PNGs
                  mixBlendMode: "multiply",
                }}
              >
                <img
                  src={src}
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

          {/* Hint */}
          {logos.length > 0 && !anyActive && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-brand-bg/80 backdrop-blur px-3 py-1.5 rounded-full border border-brand-border pointer-events-none">
              <p className="text-[10px] font-barlow text-brand-muted whitespace-nowrap">Drag logo to move · ◎ corner to resize · Drag background to rotate</p>
            </div>
          )}
        </div>

        {/* ── Controls Panel ── */}
        <div className="w-full lg:w-[320px] border-t lg:border-t-0 lg:border-l border-brand-border bg-brand-bg flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-7 space-y-6">

            <p className="text-[10px] font-barlow text-brand-muted leading-relaxed">
              Pick a color for each zone, upload your team logo(s), then drag and resize them on the jersey.
            </p>

            <div className="h-px bg-brand-border" />

            {/* Zone color controls */}
            <div className="space-y-4">
              <p className="text-[9px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted/60">Jersey Colors</p>
              {ZONES.map((zone) => (
                <ColorControl
                  key={zone.key}
                  label={zone.label}
                  value={colors[zone.key]}
                  onChange={(v) => setColors((prev) => ({ ...prev, [zone.key]: v }))}
                />
              ))}
            </div>

            <div className="h-px bg-brand-border" />

            {/* Logo upload */}
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
                PNG with transparent background works best. Drag to reposition, corner handle to resize.
              </p>

              {/* Per-logo controls */}
              {logos.map((logo, i) => (
                <div key={logo.id} className="rounded-xl border border-brand-border bg-brand-surface p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logo.tintedUrl ?? logo.originalUrl} alt="" className="w-8 h-8 object-contain rounded flex-shrink-0" />
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

                  {/* Tint color */}
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[9px] font-display font-bold uppercase tracking-[0.15em] text-brand-muted/70 whitespace-nowrap">
                      Tint Color
                    </label>
                    <div className="flex items-center gap-1.5">
                      {logo.color && (
                        <span className="text-[9px] font-barlow text-brand-muted/70 font-mono">{logo.color.toUpperCase()}</span>
                      )}
                      <input
                        type="color"
                        value={logo.color || "#000000"}
                        onChange={(e) => updateLogoColor(logo.id, e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border border-brand-border"
                      />
                      {logo.color && (
                        <button
                          onClick={() => setLogos((prev) => prev.map((l) => l.id === logo.id ? { ...l, color: "", tintedUrl: null } : l))}
                          className="text-[9px] font-barlow text-brand-muted/50 hover:text-brand-muted transition-colors"
                          title="Remove tint"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Size slider */}
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
            {(() => {
              const colorParams = new URLSearchParams(
                Object.fromEntries(ZONES.map((z) => [z.key + "Color", colors[z.key]]))
              ).toString();
              const href = orderId
                ? `/brief/${orderId}/style?${colorParams}`
                : `/brief/new?${colorParams}`;
              return (
                <Link
                  href={href}
                  className="flex items-center justify-center w-full py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors"
                >
                  {orderId ? "Continue to Design System →" : "Start Brief with These Colors →"}
                </Link>
              );
            })()}
            <p className="text-[9px] font-barlow text-brand-muted/70 text-center leading-relaxed">
              Your color selections will be pre-filled in your design brief.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default function JerseyBuilderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <JerseyBuilderInner />
    </Suspense>
  );
}

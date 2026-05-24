"use client";

import { Suspense, useRef, useState, useEffect, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import Link from "next/link";
import dynamic from "next/dynamic";

// Dynamically import the scene to keep R3F out of SSR
const JerseyScene = dynamic(() => import("./JerseyScene"), { ssr: false });

const JERSEY_SWATCHES = [
  { hex: "#0a0a0a", label: "Black" },
  { hex: "#1d3557", label: "Navy" },
  { hex: "#c41e1e", label: "Red" },
  { hex: "#1b4332", label: "Forest" },
  { hex: "#6a0dad", label: "Purple" },
  { hex: "#c77dff", label: "Lavender" },
  { hex: "#ffffff", label: "White" },
  { hex: "#888888", label: "Grey" },
];

const ACCENT_SWATCHES = [
  { hex: "#ffffff", label: "White" },
  { hex: "#f4d03f", label: "Gold" },
  { hex: "#e63946", label: "Red" },
  { hex: "#0a0a0a", label: "Black" },
  { hex: "#3498db", label: "Blue" },
  { hex: "#2ecc71", label: "Green" },
  { hex: "#e67e22", label: "Orange" },
  { hex: "#c0c0c0", label: "Silver" },
];

function ColorSwatch({
  hex, label, selected, onClick,
}: { hex: string; label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="relative w-8 h-8 rounded-full border-2 transition-all duration-150 hover:scale-110"
      style={{
        backgroundColor: hex,
        borderColor: selected ? "var(--brand-primary)" : "var(--brand-border)",
        boxShadow: selected ? "0 0 0 2px var(--brand-primary)" : "none",
        transform: selected ? "scale(1.15)" : "scale(1)",
      }}
    />
  );
}

function ColorControl({
  label, value, swatches, onChange,
}: {
  label: string;
  value: string;
  swatches: { hex: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-barlow text-brand-muted font-mono uppercase">{value}</span>
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border border-brand-border"
          />
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {swatches.map((s) => (
          <ColorSwatch key={s.hex} {...s} selected={value === s.hex} onClick={() => onChange(s.hex)} />
        ))}
      </div>
    </div>
  );
}

export default function JerseyBuilder() {
  const [jerseyColor, setJerseyColor]     = useState("#1d3557");
  const [highlightColor, setHighlightColor] = useState("#f4d03f");
  const [logoFile, setLogoFile]           = useState<File | null>(null);
  const [logoUrl, setLogoUrl]             = useState<string | null>(null);
  const [tintedLogoUrl, setTintedLogoUrl] = useState<string | null>(null);
  const [logoColor, setLogoColor]         = useState("#ffffff");
  const [logoPos, setLogoPos]             = useState({ x: 50, y: 38 });
  const [logoSize, setLogoSize]           = useState(20);
  const [dragging, setDragging]           = useState(false);
  const [orbitEnabled, setOrbitEnabled]   = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build tinted logo whenever source or color changes
  useEffect(() => {
    if (!logoUrl) { setTintedLogoUrl(null); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      // Tint: fill the non-transparent pixels with the chosen color
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = logoColor;
      ctx.fillRect(0, 0, c.width, c.height);
      setTintedLogoUrl(c.toDataURL());
    };
    img.src = logoUrl;
  }, [logoUrl, logoColor]);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoUrl(URL.createObjectURL(file));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    setOrbitEnabled(false);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setLogoPos({
      x: Math.max(5, Math.min(95, x)),
      y: Math.max(5, Math.min(95, y)),
    });
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
    setOrbitEnabled(true);
  }, []);

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">

      {/* Header */}
      <header className="border-b border-brand-border px-6 sm:px-10 py-4 flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/grace-enterprise-logo.jpeg" alt="Grace Enterprise" style={{ width: 160 }} className="h-auto object-contain" />
        <div className="flex items-center gap-5">
          <Link href="/portal" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
            ← Portal
          </Link>
          <Link href="/brief/new" className="text-xs font-display font-bold uppercase tracking-wider text-brand-muted hover:text-brand-primary transition-colors">
            Text Brief
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* ── 3D Viewport ── */}
        <div
          ref={containerRef}
          className="relative flex-1 min-h-[420px] bg-[#f8f8f8]"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <Canvas
            camera={{ position: [0, 0.5, 3.5], fov: 42 }}
            style={{ width: "100%", height: "100%" }}
          >
            <ambientLight intensity={0.8} />
            <directionalLight position={[4, 6, 4]} intensity={1.4} />
            <directionalLight position={[-4, 3, -2]} intensity={0.6} />
            <directionalLight position={[0, -2, 4]} intensity={0.3} />
            <pointLight position={[0, 4, 2]} intensity={0.5} />

            <Suspense fallback={null}>
              <JerseyScene jerseyColor={jerseyColor} highlightColor={highlightColor} />
            </Suspense>

            <OrbitControls
              enabled={orbitEnabled}
              enablePan={false}
              minDistance={1.8}
              maxDistance={7}
              target={[0, 0, 0]}
            />
          </Canvas>

          {/* Logo overlay — draggable */}
          {tintedLogoUrl && (
            <img
              src={tintedLogoUrl}
              alt="logo placement"
              onPointerDown={handlePointerDown}
              draggable={false}
              style={{
                position: "absolute",
                left: `${logoPos.x}%`,
                top: `${logoPos.y}%`,
                transform: "translate(-50%, -50%)",
                width: `${logoSize}%`,
                cursor: dragging ? "grabbing" : "grab",
                userSelect: "none",
                touchAction: "none",
                filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.35))",
              }}
            />
          )}

          {/* Drag hint */}
          {tintedLogoUrl && !dragging && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-brand-bg/80 backdrop-blur px-3 py-1.5 rounded-full border border-brand-border">
              <p className="text-[10px] font-barlow text-brand-muted whitespace-nowrap">Drag logo to reposition · Scroll to zoom · Click-drag to rotate</p>
            </div>
          )}

          {/* Page label */}
          <div className="absolute top-4 left-5 flex items-center gap-2">
            <div className="w-[3px] h-4 bg-brand-primary" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.25em] text-brand-text/70">Jersey Builder</span>
          </div>
        </div>

        {/* ── Controls Panel ── */}
        <div className="w-full lg:w-[320px] border-t lg:border-t-0 lg:border-l border-brand-border bg-brand-bg flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 py-7 space-y-8">

            <div>
              <p className="text-[10px] font-barlow text-brand-muted leading-relaxed">
                Customize your jersey colors, upload your team logo, and drag it into position. Use the viewport to preview from any angle.
              </p>
            </div>

            <div className="h-px bg-brand-border" />

            {/* Jersey color */}
            <ColorControl
              label="Jersey Color"
              value={jerseyColor}
              swatches={JERSEY_SWATCHES}
              onChange={setJerseyColor}
            />

            {/* Accent / highlight color */}
            <ColorControl
              label="Accent / Highlight"
              value={highlightColor}
              swatches={ACCENT_SWATCHES}
              onChange={setHighlightColor}
            />

            <div className="h-px bg-brand-border" />

            {/* Logo upload */}
            <div>
              <label className="block text-[10px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted mb-3">
                Team Logo
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 rounded-lg border border-dashed border-brand-border text-xs font-barlow text-brand-muted hover:border-brand-primary hover:text-brand-primary transition-colors"
              >
                {logoFile ? `↺  Replace — ${logoFile.name}` : "Upload Logo (PNG, SVG, JPG)"}
              </button>
              <p className="text-[9px] font-barlow text-brand-muted/60 mt-1.5">
                PNG with transparent background works best for color tinting.
              </p>

              {logoUrl && (
                <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-brand-surface border border-brand-border">
                  <img src={tintedLogoUrl || logoUrl} alt="preview" className="w-10 h-10 object-contain rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-barlow text-brand-text truncate">{logoFile?.name}</p>
                  </div>
                  <button
                    onClick={() => { setLogoUrl(null); setLogoFile(null); setTintedLogoUrl(null); }}
                    className="text-[9px] font-display uppercase tracking-widest text-brand-muted hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Logo color — only shown when logo is uploaded */}
            {logoUrl && (
              <ColorControl
                label="Logo Color"
                value={logoColor}
                swatches={ACCENT_SWATCHES}
                onChange={setLogoColor}
              />
            )}

            {/* Logo size slider */}
            {logoUrl && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-brand-muted">Logo Size</label>
                  <span className="text-[10px] font-barlow text-brand-muted">{logoSize}%</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={40}
                  value={logoSize}
                  onChange={(e) => setLogoSize(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-brand-border accent-[var(--brand-primary)] cursor-pointer"
                />
              </div>
            )}

          </div>

          {/* CTA */}
          <div className="border-t border-brand-border px-6 py-5 space-y-3">
            <button
              className="w-full py-3.5 rounded-lg bg-brand-primary text-white font-display font-bold text-xs uppercase tracking-widest hover:bg-brand-secondary transition-colors disabled:opacity-40"
            >
              Save Design & Continue →
            </button>
            <p className="text-[9px] font-barlow text-brand-muted/70 text-center leading-relaxed">
              Your colors and logo will be included in your brief for the Grace Studios design team.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

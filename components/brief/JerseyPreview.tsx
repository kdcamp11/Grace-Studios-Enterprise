"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

interface LogoItem {
  id: string;
  url: string;
  x: number;
  y: number;
  size: number;
}

interface ActiveDrag {
  logoId: string;
  mode: "move" | "resize";
  startClientX: number;
  startClientY: number;
  origX: number;
  origY: number;
  origSize: number;
}

export interface JerseyPreviewProps {
  system: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  onPrimaryChange: (v: string) => void;
  onSecondaryChange: (v: string) => void;
  onAccentChange: (v: string) => void;
  teamName: string;
  jerseyNumber: string;
  onNumberChange: (v: string) => void;
  logoUrls: string[];
  logoPlacement: string;
  numberStyle?: string;
  orderId: string;
  supabase: SupabaseClient;
  onConceptSaved: () => void;
}

export const SYSTEM_DEFAULTS: Record<string, { primary: string; secondary: string; accent: string }> = {
  bold:     { primary: "#CC1B1B", secondary: "#0a0a0a", accent: "#F0EAD6" },
  gradient: { primary: "#0C0C0C", secondary: "#CC1B1B", accent: "#FFFFFF" },
  program:  { primary: "#F0EAD6", secondary: "#0a0a0a", accent: "#CC1B1B" },
  culture:  { primary: "#080808", secondary: "#CC1B1B", accent: "#DCDCDC" },
};

// Basketball jersey — viewBox 0 0 200 264 — crew neck silhouette
const SILHOUETTE  = "M 46,8 Q 22,36 11,66 L 10,84 Q 14,94 22,96 L 24,244 Q 100,260 176,244 L 178,96 Q 186,94 190,84 L 189,66 Q 178,36 154,8 Q 132,30 118,50 Q 108,58 100,60 Q 92,58 82,50 Q 68,30 46,8 Z";
const NECK_FRONT  = "M 46,8 Q 68,30 82,50 Q 92,58 100,60 Q 108,58 118,50 Q 132,30 154,8";
const COLLAR_BACK = "M 68,8 Q 100,34 132,8";
const L_SHOULDER  = "M 46,8 Q 22,36 11,66";
const R_SHOULDER  = "M 154,8 Q 178,36 189,66";
const L_ARMHOLE   = "M 11,66 L 10,84 Q 14,94 22,96";
const R_ARMHOLE   = "M 189,66 L 190,84 Q 186,94 178,96";
const L_SEAM      = "M 50,66 L 50,244";
const R_SEAM      = "M 150,66 L 150,244";

const LOGO_DEFAULT = 28;
const LOGO_MIN     = 10;
const LOGO_MAX     = 72;
const FONT         = "'Arial Black', Impact, sans-serif";


const PLACEMENT_POS: Record<string, { x: number; y: number }> = {
  chest:     { x: 132, y: 108 },
  sleeve:    { x: 30,  y: 130 },
  back_neck: { x: 100, y: 88  },
};

function isColorDark(hex: string): boolean {
  try {
    const h = hex.replace("#", "");
    if (h.length < 6) return true;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  } catch { return true; }
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload  = () => res(reader.result as string);
      reader.onerror = () => rej(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Pipe: layered 3D trim / seam binding ─────────────────────────────────────
// Renders up to 7 stroke layers simulating raised garment trim:
//   blur shadow → thick dark border → accent fill → narrow dark channel → highlight → inner accent → stitch
function Pipe({ d, outer, trim, ow = 10, tw = 6, iw = 1.0, blurId, stitch }: {
  d: string; outer: string; trim: string;
  ow?: number; tw?: number; iw?: number;
  blurId?: string; stitch?: string;
}) {
  return (
    <>
      {blurId && (
        <path d={d} fill="none" stroke="black" strokeWidth={ow + 7}
          strokeOpacity="0.55" filter={`url(#${blurId})`} />
      )}
      {/* Outer dark base — thick binding "underside" */}
      <path d={d} fill="none" stroke={outer}   strokeWidth={ow}        strokeLinecap="butt" />
      {/* Accent fill — the visible trim color */}
      <path d={d} fill="none" stroke={trim}    strokeWidth={tw}        strokeLinecap="butt" />
      {/* Narrow dark channel — seam channel recess */}
      <path d={d} fill="none" stroke={outer}   strokeWidth={iw}        strokeLinecap="butt" />
      {/* Top highlight — simulates the highest surface of the raised trim */}
      <path d={d} fill="none" stroke="white"   strokeWidth="1.2"       strokeOpacity="0.22" strokeLinecap="butt" />
      {/* Inner accent sub-stripe — visible layered construction */}
      <path d={d} fill="none" stroke={trim}    strokeWidth={iw * 0.4}  strokeOpacity="0.55" strokeLinecap="butt" />
      {stitch && (
        <path d={d} fill="none" stroke={stitch} strokeWidth="0.6"
          strokeDasharray="2,3" strokeOpacity="0.25" strokeLinecap="round" />
      )}
    </>
  );
}

// ── CollarBand: premium 2-tone raised collar construction ─────────────────────
// Reference: blank jersey AI — round crew neck with outer band (secondary) and
// inner accent stripe, tubular 3D form with studio key-light highlight and seam detail.
//
// Layer order (back → front):
//   blur undercast shadow → outer band (s) → inner accent stripe (a) →
//   narrow construction channel (s) → seam shadow → broad top highlight →
//   tight specular glint → topstitch
function CollarBand({ d, s, a, bsm }: { d: string; s: string; a: string; bsm: string }) {
  return (
    <>
      {/* Undercast shadow — collar tube casts shadow onto body below */}
      <path d={d} fill="none" stroke="black" strokeWidth={28}
        strokeOpacity={0.42} filter={`url(#${bsm})`} strokeLinecap="round" />
      {/* Outer band — secondary color; at ow=20, a ≈5px ring shows each side */}
      <path d={d} fill="none" stroke={s}     strokeWidth={20} strokeLinecap="round" />
      {/* Inner accent stripe — accent color, secondary ring remains as border */}
      <path d={d} fill="none" stroke={a}     strokeWidth={10} strokeLinecap="round" />
      {/* Construction channel — secondary color seam between the two band layers */}
      <path d={d} fill="none" stroke={s}     strokeWidth={2.5} strokeLinecap="butt" />
      {/* Hair-line seam shadow — dark crease in channel center */}
      <path d={d} fill="none" stroke="black" strokeWidth={1.0}
        strokeOpacity={0.52} strokeLinecap="butt" />
      {/* Broad top highlight — studio key light on apex of collar tube */}
      <path d={d} fill="none" stroke="white" strokeWidth={5}
        strokeOpacity={0.22} strokeLinecap="round" />
      {/* Tight specular glint — hot-spot on highest curve point */}
      <path d={d} fill="none" stroke="white" strokeWidth={1.6}
        strokeOpacity={0.52} strokeLinecap="round" />
      {/* Top-edge topstitch — construction detail visible on outer collar */}
      <path d={d} fill="none" stroke={a}     strokeWidth={0.65}
        strokeDasharray="2.2,2.5" strokeOpacity={0.28} strokeLinecap="round" />
    </>
  );
}

// ── TwillNum: 5-layer tackle-twill number ─────────────────────────────────────
// Mimics screen-printed / sewn tackle-twill letter construction:
//   drop shadow → thick dark border → accent outline → dark inner → solid fill
function TwillNum({ x, y, children, fs = 96, fill, outline, border = "#050505", clip, xform }: {
  x: number; y: number; children: string;
  fs?: number; fill: string; outline: string; border?: string;
  clip: string; xform?: string;
}) {
  const ow = fs * 0.155;
  const mw = fs * 0.105;
  const iw = fs * 0.024;
  const base = {
    textAnchor: "middle" as const,
    fontFamily: FONT,
    fontSize: fs,
    fontWeight: "900" as const,
    clipPath: clip,
    transform: xform,
  };
  return (
    <>
      {/* Drop shadow offset — gives number physical lift */}
      {!xform && (
        <text {...base} x={x + 3} y={y + 5} fill="black" fillOpacity="0.28">{children}</text>
      )}
      {/* Thick outer border — tackle-twill underlay */}
      <text {...base} x={x} y={y} fill="none" stroke={border}  strokeWidth={ow} strokeLinejoin="round">{children}</text>
      {/* Accent outline — the accent-colored twill layer */}
      <text {...base} x={x} y={y} fill="none" stroke={outline} strokeWidth={mw} strokeLinejoin="round">{children}</text>
      {/* Narrow dark inner channel — separation between layers */}
      <text {...base} x={x} y={y} fill="none" stroke={border}  strokeWidth={iw} strokeLinejoin="round">{children}</text>
      {/* Solid fill — top face of tackle-twill */}
      <text {...base} x={x} y={y} fill={fill}>{children}</text>
    </>
  );
}

// ── JerseyNumber: style-dispatching number renderer ──────────────────────────
function JerseyNumber({ x, y, children, fs = 96, fill, outline, border = "#050505", clip, xform, numStyle }: {
  x: number; y: number; children: string;
  fs?: number; fill: string; outline: string; border?: string;
  clip: string; xform?: string; numStyle?: string;
}) {
  const common = { textAnchor: "middle" as const, clipPath: clip, transform: xform };

  // ── BLOCK BOLD (default) ─── thick tackle-twill, condensed impact font
  if (!numStyle || numStyle === "Block Bold") {
    const ow = fs * 0.155; const mw = fs * 0.105; const iw = fs * 0.024;
    const b = { ...common, fontFamily: "'Arial Black', Impact, sans-serif", fontSize: fs, fontWeight: "900" as const };
    return (
      <>
        {!xform && <text {...b} x={x+3} y={y+5} fill="black" fillOpacity="0.28">{children}</text>}
        <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={ow} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke={outline} strokeWidth={mw} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={iw} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke="white"   strokeWidth="1.2" strokeOpacity="0.22">{children}</text>
        <text {...b} x={x} y={y} fill={fill}>{children}</text>
      </>
    );
  }

  // ── COLLEGIATE ─── serif font, thinner layered strokes, classic varsity look
  if (numStyle === "Collegiate") {
    const ow = fs * 0.09; const mw = fs * 0.055;
    const b = { ...common, fontFamily: "'Times New Roman', Georgia, serif", fontSize: fs * 1.05, fontWeight: "900" as const };
    return (
      <>
        {!xform && <text {...b} x={x+2} y={y+4} fill="black" fillOpacity="0.35">{children}</text>}
        <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={ow} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke={outline} strokeWidth={mw} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke="white"   strokeWidth="0.8" strokeOpacity="0.30">{children}</text>
        <text {...b} x={x} y={y} fill={fill}>{children}</text>
      </>
    );
  }

  // ── OLD ENGLISH ─── blackletter, thin dark outline, filled, decorative
  if (numStyle === "Old English") {
    const ow = fs * 0.06;
    const b = { ...common, fontFamily: "'UnifrakturMaguntia', 'MedievalSharp', 'Palatino Linotype', Georgia, serif", fontSize: fs * 0.92, fontWeight: "400" as const };
    return (
      <>
        {!xform && <text {...b} x={x+3} y={y+6} fill="black" fillOpacity="0.40">{children}</text>}
        <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={ow * 1.6} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke={outline} strokeWidth={ow}       strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill={fill}>{children}</text>
        {/* decorative fine inner line */}
        <text {...b} x={x} y={y} fill="none" stroke={outline} strokeWidth="0.8" strokeOpacity="0.55">{children}</text>
      </>
    );
  }

  // ── OUTLINE ─── completely hollow, thick accent border, NO fill — clearly different
  if (numStyle === "Outline") {
    const ow = fs * 0.14; const mw = fs * 0.08;
    const b = { ...common, fontFamily: "'Arial Black', Impact, sans-serif", fontSize: fs, fontWeight: "900" as const };
    return (
      <>
        {!xform && <text {...b} x={x+3} y={y+5} fill="black" fillOpacity="0.20">{children}</text>}
        <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={ow} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke={outline} strokeWidth={mw} strokeLinejoin="round">{children}</text>
        {/* NO fill text — completely hollow */}
        <text {...b} x={x} y={y} fill="none" stroke="white"   strokeWidth="1.5" strokeOpacity="0.28">{children}</text>
      </>
    );
  }

  // ── VARSITY ─── bold italic with strong arc shadow, condensed
  if (numStyle === "Varsity") {
    const ow = fs * 0.13; const mw = fs * 0.08;
    const b = { ...common, fontFamily: "'Arial Black', Impact, sans-serif", fontSize: fs, fontWeight: "900" as const, fontStyle: "italic" as const };
    return (
      <>
        {!xform && <text {...b} x={x+4} y={y+6} fill="black" fillOpacity="0.32">{children}</text>}
        <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={ow} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke={outline} strokeWidth={mw} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill={fill}>{children}</text>
        {/* italic sheen highlight */}
        <text {...b} x={x} y={y} fill="none" stroke="white" strokeWidth="1.8" strokeOpacity="0.25">{children}</text>
      </>
    );
  }

  // ── CUSTOM ─── accent-colored fill, double outline, premium feel
  if (numStyle === "Custom") {
    const ow = fs * 0.18; const mw = fs * 0.12; const iw = fs * 0.04;
    const b = { ...common, fontFamily: "'Arial Black', Impact, sans-serif", fontSize: fs, fontWeight: "900" as const };
    return (
      <>
        {!xform && <text {...b} x={x+3} y={y+5} fill="black" fillOpacity="0.32">{children}</text>}
        <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={ow} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke={fill}    strokeWidth={mw} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={iw} strokeLinejoin="round">{children}</text>
        <text {...b} x={x} y={y} fill={outline}>{children}</text>
        <text {...b} x={x} y={y} fill="none" stroke="white" strokeWidth="1.0" strokeOpacity="0.25">{children}</text>
      </>
    );
  }

  // Fallback — Block Bold
  const ow = fs * 0.155; const mw = fs * 0.105; const iw = fs * 0.024;
  const b = { ...common, fontFamily: "'Arial Black', Impact, sans-serif", fontSize: fs, fontWeight: "900" as const };
  return (
    <>
      {!xform && <text {...b} x={x+3} y={y+5} fill="black" fillOpacity="0.28">{children}</text>}
      <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={ow} strokeLinejoin="round">{children}</text>
      <text {...b} x={x} y={y} fill="none" stroke={outline} strokeWidth={mw} strokeLinejoin="round">{children}</text>
      <text {...b} x={x} y={y} fill="none" stroke={border}  strokeWidth={iw} strokeLinejoin="round">{children}</text>
      <text {...b} x={x} y={y} fill="none" stroke="white"   strokeWidth="1.2" strokeOpacity="0.22">{children}</text>
      <text {...b} x={x} y={y} fill={fill}>{children}</text>
    </>
  );
}

// ── ColorSwatch: swatch + editable hex text input ────────────────────────────
function ColorSwatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value.toUpperCase());

  // Sync when prop changes externally (system preset, color wheel)
  useEffect(() => {
    setText(value.toUpperCase());
  }, [value]);

  function handleTextChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    const trimmed = raw.trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) onChange(trimmed);
  }

  function handleBlur() {
    // Reset display to actual value if user left an invalid partial
    if (!/^#[0-9A-Fa-f]{6}$/.test(text.trim())) setText(value.toUpperCase());
  }

  return (
    <div className="flex items-center gap-2.5 flex-1 min-w-0">
      <label className="relative cursor-pointer flex-shrink-0">
        <span className="block w-7 h-7 rounded-full border border-white/20 shadow-md overflow-hidden"
          style={{ backgroundColor: value }}>
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
        </span>
      </label>
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-display uppercase tracking-[0.2em] text-white/35 truncate mb-0.5">{label}</p>
        <input
          type="text"
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          maxLength={7}
          spellCheck={false}
          className="w-full bg-transparent border-b border-white/15 text-[10px] font-mono text-white/60 focus:text-white focus:border-white/50 outline-none transition-colors"
        />
      </div>
    </div>
  );
}

// ── FabricFolds: organic drape/shadow overlay paths ──────────────────────────
// These simulate real fabric folds like the reference AI jersey illustration.
// They are semi-transparent black/white paths layered after design colors
// but before final lighting — giving depth without overriding color regions.
//
// Firefly pipeline note: these fold paths are the "depth map" layer.
// When exporting to AI/Firefly, this layer drives displacement/shadow passes.
function FabricFolds({ clip }: { clip: string }) {
  return (
    <g clipPath={clip} style={{ mixBlendMode: "multiply" } as React.CSSProperties}>
      {/* ── Left chest primary fold — large diagonal drape from armhole ──── */}
      <path d="M 22,74 Q 52,88 70,108 Q 60,122 44,116 Q 26,98 22,74 Z"
        fill="black" fillOpacity="0.11" />
      {/* Secondary fold — parallel crease below primary */}
      <path d="M 24,92 Q 50,103 64,122 Q 55,132 40,128 Q 26,115 24,92 Z"
        fill="black" fillOpacity="0.07" />
      {/* Tertiary micro-fold */}
      <path d="M 26,110 Q 46,118 58,133 Q 50,142 38,138 Q 27,126 26,110 Z"
        fill="black" fillOpacity="0.045" />

      {/* ── Right armhole / shoulder fold ──────────────────────────────────── */}
      <path d="M 176,72 Q 160,85 148,102 Q 156,112 172,106 Q 182,90 176,72 Z"
        fill="black" fillOpacity="0.09" />
      <path d="M 172,92 Q 158,102 150,118 Q 157,126 168,122 Q 178,112 172,92 Z"
        fill="black" fillOpacity="0.055" />

      {/* ── Center chest slight drape shadow — jersey falls from shoulders ── */}
      <path d="M 90,58 Q 95,130 93,205 L 107,205 Q 105,130 110,58 Q 104,54 96,54 Z"
        fill="black" fillOpacity="0.032" />

      {/* ── Waist horizontal gather fold ─────────────────────────────────── */}
      <path d="M 27,162 Q 100,157 173,162 Q 173,170 171,170 Q 100,165 29,170 Q 27,170 27,162 Z"
        fill="black" fillOpacity="0.05" />

      {/* ── Side-body vertical tension shadow — fabric pulls from each side ─ */}
      <path d="M 28,96 Q 32,170 30,244 Q 38,246 36,244 Q 38,170 34,96 Z"
        fill="black" fillOpacity="0.06" />
      <path d="M 172,96 Q 168,170 170,244 Q 162,246 164,244 Q 162,170 166,96 Z"
        fill="black" fillOpacity="0.06" />

      {/* ── Bottom hem gravity fold highlight ─────────────────────────────── */}
      <path d="M 28,230 Q 100,225 172,230 Q 172,238 171,239 Q 100,234 29,239 Q 28,238 28,230 Z"
        fill="white" fillOpacity="0.07" style={{ mixBlendMode: "screen" } as React.CSSProperties} />

      {/* ── Shoulder crease — fabric hangs from shoulder seam ─────────────── */}
      <path d="M 46,8 Q 50,38 48,68 Q 52,70 56,68 Q 54,38 54,8 Z"
        fill="black" fillOpacity="0.04" />
      <path d="M 154,8 Q 150,38 152,68 Q 148,70 144,68 Q 146,38 146,8 Z"
        fill="black" fillOpacity="0.04" />
    </g>
  );
}

// ── SvgDefs: filters + lighting + texture gradients ───────────────────────────
function SvgDefs({ system, p, s, a, clipId, gradId, lightId, sideId, sheenId }: {
  system: string; p: string; s: string; a: string;
  clipId: string; gradId: string; lightId: string; sideId: string; sheenId: string;
}) {
  const bsm = `${clipId}-bsm`;
  const bmd = `${clipId}-bmd`;
  return (
    <defs>

      {/* ── Clip path ───────────────────────────────────────────────────── */}
      <clipPath id={clipId}>
        <path d={SILHOUETTE} />
      </clipPath>

      {/* ── Filters ─────────────────────────────────────────────────────── */}

      {/* Small blur — for raising trim/collar shadow */}
      <filter id={bsm} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" />
      </filter>

      {/* Medium blur — panel depth shadow */}
      <filter id={bmd} x="-30%" y="-20%" width="160%" height="140%">
        <feGaussianBlur stdDeviation="5.5" />
      </filter>

      {/* Number drop shadow */}
      <filter id={`${clipId}-drop`} x="-25%" y="-20%" width="150%" height="140%">
        <feDropShadow dx="2" dy="5" stdDeviation="6" floodColor="black" floodOpacity="0.45" />
      </filter>

      {/* Gradient number glow */}
      <filter id={`${clipId}-glow`} x="-35%" y="-35%" width="170%" height="170%">
        <feGaussianBlur stdDeviation="7" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>

      {/* 3D specular body curvature — fePointLight creates realistic upper-left studio lighting
          Applied to jersey body: blurs SourceAlpha into a dome, generates specular map,
          then screen-blends onto the jersey color producing convincing fabric curvature shading */}
      <filter id={`${clipId}-spec3d`} x="-5%" y="-5%" width="110%" height="110%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="26" result="dome" />
        <feSpecularLighting
          in="dome"
          surfaceScale="34"
          specularConstant="2.8"
          specularExponent="62"
          lightingColor="white"
          result="spec">
          <fePointLight x="38" y="-30" z="95" />
        </feSpecularLighting>
        <feComposite in="spec" in2="SourceAlpha" operator="in" result="spec-clipped" />
        <feBlend in="SourceGraphic" in2="spec-clipped" mode="screen" />
      </filter>

      {/* Fabric noise — fractalNoise breaks flat-SVG appearance with organic knit texture
          Directional baseFrequency (X > Y) simulates horizontal jersey mesh weave */}
      <filter id={`${clipId}-fab`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.65 0.38" numOctaves="5" seed="3" result="noise" />
        <feColorMatrix in="noise" type="matrix"
          values="0 0 0 0 0.55
                  0 0 0 0 0.55
                  0 0 0 0 0.55
                  0 0 0 0.14 -0.04"
          result="tinted" />
        <feComposite in="tinted" in2="SourceAlpha" operator="in" />
      </filter>

      {/* Panel contour texture — turbulence + threshold creates topographic contour lines
          Applied to dark side panels for the worn fabric terrain-map aesthetic */}
      <filter id={`${clipId}-ctour`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
        <feTurbulence type="turbulence" baseFrequency="0.016 0.013" numOctaves="5" seed="11" result="noise" />
        <feColorMatrix in="noise" type="matrix"
          values="0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 0 0
                  2.5 2.5 2.5 0 -1.2"
          result="contour" />
        <feFlood floodColor="white" floodOpacity="0.14" result="flood" />
        <feComposite in="flood" in2="contour" operator="in" />
      </filter>

      {/* ── Studio lighting gradients ────────────────────────────────────── */}

      {/* Key light — strong upper-left studio source, reinforces feSpecularLighting */}
      <radialGradient id={lightId} cx="26%" cy="8%" r="75%">
        <stop offset="0%"   stopColor="white" stopOpacity="0.58" />
        <stop offset="14%"  stopColor="white" stopOpacity="0.28" />
        <stop offset="35%"  stopColor="white" stopOpacity="0.08" />
        <stop offset="60%"  stopColor="black" stopOpacity="0"    />
        <stop offset="100%" stopColor="black" stopOpacity="0.28" />
      </radialGradient>

      {/* Specular hot-spot — tight bright reflection on upper-left chest */}
      <radialGradient id={`${clipId}-hot`} cx="28%" cy="13%" r="9%">
        <stop offset="0%"   stopColor="white" stopOpacity="0.88" />
        <stop offset="40%"  stopColor="white" stopOpacity="0.32" />
        <stop offset="100%" stopColor="white" stopOpacity="0"    />
      </radialGradient>

      {/* Fill light — soft right-side bounce from reflector */}
      <radialGradient id={`${clipId}-fill`} cx="80%" cy="62%" r="50%">
        <stop offset="0%"   stopColor="white" stopOpacity="0.06" />
        <stop offset="100%" stopColor="white" stopOpacity="0"    />
      </radialGradient>

      {/* Chest curvature — fabric curves toward camera at center chest */}
      <radialGradient id={`${clipId}-chest`} cx="52%" cy="42%" r="32%">
        <stop offset="0%"   stopColor="white" stopOpacity="0.09" />
        <stop offset="100%" stopColor="white" stopOpacity="0"    />
      </radialGradient>

      {/* Side curvature darkening — fabric wraps hard away from camera on both sides
          0.82 peak opacity creates strong convincing 3D cylinder body effect */}
      <linearGradient id={sideId} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor="black" stopOpacity="0.82" />
        <stop offset="7%"   stopColor="black" stopOpacity="0.44" />
        <stop offset="14%"  stopColor="black" stopOpacity="0.12" />
        <stop offset="22%"  stopColor="black" stopOpacity="0"    />
        <stop offset="78%"  stopColor="black" stopOpacity="0"    />
        <stop offset="86%"  stopColor="black" stopOpacity="0.12" />
        <stop offset="93%"  stopColor="black" stopOpacity="0.44" />
        <stop offset="100%" stopColor="black" stopOpacity="0.82" />
      </linearGradient>

      {/* Center vertical sheen — narrow specular band in jersey center */}
      <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor="white" stopOpacity="0"    />
        <stop offset="44%"  stopColor="white" stopOpacity="0.06" />
        <stop offset="56%"  stopColor="white" stopOpacity="0.06" />
        <stop offset="100%" stopColor="white" stopOpacity="0"    />
      </linearGradient>

      {/* Overhead / top-to-bottom studio light falloff */}
      <linearGradient id={`${clipId}-top`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="white" stopOpacity="0.16" />
        <stop offset="22%"  stopColor="white" stopOpacity="0.04" />
        <stop offset="45%"  stopColor="white" stopOpacity="0"    />
        <stop offset="100%" stopColor="black" stopOpacity="0.18" />
      </linearGradient>

      {/* Hem fold darkening — fabric hangs heavy at hem */}
      <linearGradient id={`${clipId}-hem`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="65%"  stopColor="black" stopOpacity="0"    />
        <stop offset="84%"  stopColor="black" stopOpacity="0.30" />
        <stop offset="100%" stopColor="black" stopOpacity="0.55" />
      </linearGradient>

      {/* Ambient occlusion — shadow accumulates under crew-neck collar zone */}
      <radialGradient id={`${clipId}-ao`} cx="50%" cy="26%" r="42%">
        <stop offset="38%"  stopColor="black" stopOpacity="0"    />
        <stop offset="100%" stopColor="black" stopOpacity="0.18" />
      </radialGradient>

      {/* Collar under-shadow — tight shadow immediately below the raised collar band */}
      <linearGradient id={`${clipId}-cao`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stopColor="black" stopOpacity="0.48" />
        <stop offset="7%"   stopColor="black" stopOpacity="0.24" />
        <stop offset="16%"  stopColor="black" stopOpacity="0.06" />
        <stop offset="24%"  stopColor="black" stopOpacity="0"    />
      </linearGradient>

      {/* Armhole AO — deep shadow in armhole creases for physical fabric feel */}
      <radialGradient id={`${clipId}-arm-l`} cx="6%" cy="38%" r="24%">
        <stop offset="0%"   stopColor="black" stopOpacity="0.45" />
        <stop offset="100%" stopColor="black" stopOpacity="0"    />
      </radialGradient>
      <radialGradient id={`${clipId}-arm-r`} cx="94%" cy="38%" r="24%">
        <stop offset="0%"   stopColor="black" stopOpacity="0.45" />
        <stop offset="100%" stopColor="black" stopOpacity="0"    />
      </radialGradient>

      {/* ── Gradient system body fill ────────────────────────────────────── */}
      {system === "gradient" && (
        <linearGradient id={gradId} x1="0.08" y1="0" x2="0.92" y2="1">
          <stop offset="0%"   stopColor={p} />
          <stop offset="45%"  stopColor={s} />
          <stop offset="100%" stopColor={a} />
        </linearGradient>
      )}

      {/* ── Panel depth shadow gradients ─────────────────────────────────── */}

      {/* Shadow on body fabric just inside left seam — panel reads as raised */}
      <linearGradient id={`${clipId}-psl`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor="black" stopOpacity="0.30" />
        <stop offset="100%" stopColor="black" stopOpacity="0"    />
      </linearGradient>
      <linearGradient id={`${clipId}-psr`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor="black" stopOpacity="0"    />
        <stop offset="100%" stopColor="black" stopOpacity="0.30" />
      </linearGradient>
      {/* Shadow on panel inner face */}
      <linearGradient id={`${clipId}-pil`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor="black" stopOpacity="0.18" />
        <stop offset="100%" stopColor="black" stopOpacity="0"    />
      </linearGradient>
      <linearGradient id={`${clipId}-pir`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stopColor="black" stopOpacity="0"    />
        <stop offset="100%" stopColor="black" stopOpacity="0.18" />
      </linearGradient>

      {/* ── Fabric micro-texture patterns ────────────────────────────────── */}

      {/* Air-mesh performance fabric — diamond perforation grid (basketball jersey standard)
          Each cell contains a rotated diamond hole with 1px fabric gap between holes */}
      <pattern id={`${clipId}-mesh`} patternUnits="userSpaceOnUse" width="6" height="6">
        {/* Diamond hole: rotated square, ~3.2px diagonal */}
        <polygon points="3,0.9 5.1,3 3,5.1 0.9,3"
          fill="black" fillOpacity="0.12" />
      </pattern>
      {/* Offset second layer — fills in between primary diamonds for denser mesh */}
      <pattern id={`${clipId}-mesh2`} patternUnits="userSpaceOnUse" width="6" height="6"
        patternTransform="translate(3 3)">
        <polygon points="3,0.9 5.1,3 3,5.1 0.9,3"
          fill="black" fillOpacity="0.07" />
      </pattern>

      {/* Diagonal micro-weave — thread direction visible at angles */}
      <pattern id={`${clipId}-weave`} patternUnits="userSpaceOnUse" width="4" height="4"
        patternTransform="rotate(38)">
        <line x1="0" y1="0" x2="0" y2="4" stroke="white" strokeWidth="0.30" opacity="0.048" />
      </pattern>

    </defs>
  );
}

// ── Lighting overlay stack ────────────────────────────────────────────────────
// Applied AFTER all design layers. Order matters: textures first, then lights, then specular last.
function LightingOverlays({ cid, lid, sid, shid }: {
  cid: string; lid: string; sid: string; shid: string;
}) {
  const clip = `url(#${cid})`;
  return (
    <>
      {/* Layer 1: Fabric noise — breaks flat SVG appearance */}
      <rect x="0" y="0" width="200" height="264" clipPath={clip} filter={`url(#${cid}-fab)`} />
      {/* Layer 2: Primary mesh knit pattern */}
      <path d={SILHOUETTE} fill={`url(#${cid}-mesh)`} />
      {/* Layer 3: Offset secondary mesh (creates denser hex-grid look) */}
      <path d={SILHOUETTE} fill={`url(#${cid}-mesh2)`} />
      {/* Layer 4: Diagonal weave direction */}
      <path d={SILHOUETTE} fill={`url(#${cid}-weave)`} />
      {/* Layer 5: Top-to-bottom studio overhead */}
      <path d={SILHOUETTE} fill={`url(#${cid}-top)`} />
      {/* Layer 6: Chest forward-curvature highlight */}
      <path d={SILHOUETTE} fill={`url(#${cid}-chest)`} />
      {/* Layer 7: Right-side fill light bounce */}
      <path d={SILHOUETTE} fill={`url(#${cid}-fill)`} />
      {/* Layer 8: Center vertical sheen */}
      <path d={SILHOUETTE} fill={`url(#${shid})`} />
      {/* Layer 9: Side-edge curvature darkening (strongest single effect for 3D feel) */}
      <path d={SILHOUETTE} fill={`url(#${sid})`} />
      {/* Layer 10: Armhole ambient occlusion — deep crease shadow */}
      <path d={SILHOUETTE} fill={`url(#${cid}-arm-l)`} />
      <path d={SILHOUETTE} fill={`url(#${cid}-arm-r)`} />
      {/* Layer 11: Key light (top-left studio source) */}
      <path d={SILHOUETTE} fill={`url(#${lid})`} />
      {/* Layer 12: Tight specular hot-spot */}
      <path d={SILHOUETTE} fill={`url(#${cid}-hot)`} />
      {/* Layer 13: Hem gravity fold darkening */}
      <path d={SILHOUETTE} fill={`url(#${cid}-hem)`} />
      {/* Layer 14: Ambient occlusion accumulation under collar */}
      <path d={SILHOUETTE} fill={`url(#${cid}-ao)`} />
      {/* Layer 15: Tight collar under-shadow — shadow immediately below collar band */}
      <path d={SILHOUETTE} fill={`url(#${cid}-cao)`} />
    </>
  );
}

// ── SidePanels: physically separate material panels ───────────────────────────
// Each panel renders with: solid fill → topographic contour texture →
// panel-body seam shadow (makes panel read as raised above body) → inner panel shadow
function SidePanels({ s, clip, cid }: { s: string; clip: string; cid: string }) {
  return (
    <>
      {/* Panel fill */}
      <polygon points="10,84 12,66 50,66 50,244 22,244"      fill={s} clipPath={clip} />
      <polygon points="190,84 188,66 150,66 150,244 178,244"  fill={s} clipPath={clip} />
      {/* Topographic contour texture — organic terrain look on dark panels */}
      <polygon points="10,84 12,66 50,66 50,244 22,244"      clipPath={clip} filter={`url(#${cid}-ctour)`} />
      <polygon points="190,84 188,66 150,66 150,244 178,244"  clipPath={clip} filter={`url(#${cid}-ctour)`} />
      {/* Seam shadow — body darkens just inside the seam, panel appears raised */}
      <rect x="50"  y="64" width="22" height="182" fill={`url(#${cid}-psl)`} clipPath={clip} />
      <rect x="128" y="64" width="22" height="182" fill={`url(#${cid}-psr)`} clipPath={clip} />
      {/* Inner panel shadow — panel inner face catches less light */}
      <rect x="34"  y="64" width="16" height="182" fill={`url(#${cid}-pil)`} clipPath={clip} />
      <rect x="150" y="64" width="16" height="182" fill={`url(#${cid}-pir)`} clipPath={clip} />
    </>
  );
}

// ── Jersey layer components ───────────────────────────────────────────────────

interface LayerProps {
  system: string; p: string; s: string; a: string;
  num: string; name?: string; numStyle?: string; clipId: string; gradId: string;
}

function FrontJersey({ system, p, s, a, num, numStyle, clipId, gradId }: LayerProps) {
  const clip  = `url(#${clipId})`;
  const bsm   = `${clipId}-bsm`;
  const darkS = isColorDark(s);

  // ── BOLD ─────────────────────────────────────────────────────────────────
  // Reference-match: red body, black side panels, cream wide binding,
  // diagonal speed-slash graphic, tackle-twill number
  if (system === "bold") {
    return (
      <>
        {/* Body — feSpecularLighting adds self-illuminated 3D curvature shading */}
        <path d={SILHOUETTE} fill={p} filter={`url(#${clipId}-spec3d)`} />
        <SidePanels s={s} clip={clip} cid={clipId} />

        {/* Diagonal speed-slash graphic — premium design element cutting across lower body */}
        <line x1="40"  y1="244" x2="148" y2="88"  stroke="black" strokeWidth="16"  strokeOpacity="0.18" clipPath={clip} />
        <line x1="54"  y1="244" x2="162" y2="88"  stroke="black" strokeWidth="10"  strokeOpacity="0.11" clipPath={clip} />
        <line x1="66"  y1="244" x2="174" y2="88"  stroke="black" strokeWidth="6"   strokeOpacity="0.07" clipPath={clip} />
        <line x1="36"  y1="244" x2="144" y2="88"  stroke="white" strokeWidth="1.2" strokeOpacity="0.10" clipPath={clip} />

        {/* Seam piping — thick construction binding between panel and body */}
        <Pipe d={L_SEAM}     outer={s} trim={a} ow={8}  tw={5}   iw={1.0} blurId={bsm} stitch={a} />
        <Pipe d={R_SEAM}     outer={s} trim={a} ow={8}  tw={5}   iw={1.0} blurId={bsm} stitch={a} />
        <Pipe d={L_SHOULDER} outer={s} trim={a} ow={8}  tw={5}   iw={1.0} stitch={a} />
        <Pipe d={R_SHOULDER} outer={s} trim={a} ow={8}  tw={5}   iw={1.0} stitch={a} />

        {/* Armhole binding — widest, most prominent construction element */}
        <Pipe d={L_ARMHOLE}  outer={s} trim={a} ow={13} tw={8}   iw={1.2} blurId={bsm} stitch={a} />
        <Pipe d={R_ARMHOLE}  outer={s} trim={a} ow={13} tw={8}   iw={1.2} blurId={bsm} stitch={a} />
        {/* Crew-neck collar band — premium 2-tone raised construction */}
        <CollarBand d={NECK_FRONT} s={s} a={a} bsm={bsm} />

        {/* Hem accent band */}
        <path d="M 24,238 Q 100,254 176,238 L 176,244 Q 100,260 24,244 Z"
          fill={a} clipPath={clip} opacity="0.55" />

        {/* Tackle-twill number */}
        <JerseyNumber x={100} y={210} fs={96}
          fill={darkS ? s : "#0e0e0e"} outline={a} border="#040404" clip={clip} numStyle={numStyle}>
          {num}
        </JerseyNumber>
      </>
    );
  }

  // ── GRADIENT ──────────────────────────────────────────────────────────────
  if (system === "gradient") {
    return (
      <>
        <path d={SILHOUETTE} fill={`url(#${gradId})`} filter={`url(#${clipId}-spec3d)`} />

        {/* Diagonal velocity motion lines — gradient system signature */}
        <line x1="10" y1="104" x2="190" y2="66"  stroke="white" strokeWidth="2.0" strokeOpacity="0.14" clipPath={clip} />
        <line x1="10" y1="128" x2="190" y2="90"  stroke="white" strokeWidth="1.3" strokeOpacity="0.09" clipPath={clip} />
        <line x1="10" y1="152" x2="190" y2="114" stroke="white" strokeWidth="0.8" strokeOpacity="0.06" clipPath={clip} />
        <line x1="10" y1="176" x2="190" y2="138" stroke="white" strokeWidth="0.5" strokeOpacity="0.04" clipPath={clip} />

        {/* Seam piping */}
        <Pipe d={L_SHOULDER} outer="#0a0a0a" trim={a} ow={7}  tw={4.5} iw={0.9} stitch={a} />
        <Pipe d={R_SHOULDER} outer="#0a0a0a" trim={a} ow={7}  tw={4.5} iw={0.9} stitch={a} />
        <Pipe d={L_ARMHOLE}  outer="#0a0a0a" trim={a} ow={11} tw={7}   iw={1.1} blurId={bsm} stitch={a} />
        <Pipe d={R_ARMHOLE}  outer="#0a0a0a" trim={a} ow={11} tw={7}   iw={1.1} blurId={bsm} stitch={a} />
        <CollarBand d={NECK_FRONT} s="#0a0a0a" a={a} bsm={bsm} />

        {/* Hem accent */}
        <path d="M 24,238 Q 100,254 176,238 L 176,244 Q 100,260 24,244 Z"
          fill={a} clipPath={clip} opacity="0.65" />

        {/* Glowing number — gradient system signature */}
        <text x="100" y="210" textAnchor="middle" fontFamily={FONT} fontSize="96"
          fontWeight="900" fill={a} fillOpacity="0.35" clipPath={clip}
          filter={`url(#${clipId}-glow)`}>{num}</text>
        <text x="100" y="210" textAnchor="middle" fontFamily={FONT} fontSize="96"
          fontWeight="900" fill="white" fillOpacity="0.92" clipPath={clip}>{num}</text>
      </>
    );
  }

  // ── PROGRAM ───────────────────────────────────────────────────────────────
  if (system === "program") {
    const numBorder = isColorDark(p) ? "#444" : "#1a1a1a";
    return (
      <>
        <path d={SILHOUETTE} fill={p} filter={`url(#${clipId}-spec3d)`} />
        <SidePanels s={s} clip={clip} cid={clipId} />

        {/* Triple-stripe seam marks — Adidas-style structural accent */}
        <line x1="50"  y1="66" x2="50"  y2="244" stroke={a} strokeWidth="5.5" clipPath={clip} />
        <line x1="58"  y1="70" x2="58"  y2="244" stroke={a} strokeWidth="2.4" strokeOpacity="0.55" clipPath={clip} />
        <line x1="65"  y1="74" x2="65"  y2="244" stroke={a} strokeWidth="1.2" strokeOpacity="0.32" clipPath={clip} />
        <line x1="150" y1="66" x2="150" y2="244" stroke={a} strokeWidth="5.5" clipPath={clip} />
        <line x1="142" y1="70" x2="142" y2="244" stroke={a} strokeWidth="2.4" strokeOpacity="0.55" clipPath={clip} />
        <line x1="135" y1="74" x2="135" y2="244" stroke={a} strokeWidth="1.2" strokeOpacity="0.32" clipPath={clip} />

        {/* Seam piping */}
        <Pipe d={L_SHOULDER} outer={s} trim={a} ow={8}  tw={5}   iw={1.0} stitch={a} />
        <Pipe d={R_SHOULDER} outer={s} trim={a} ow={8}  tw={5}   iw={1.0} stitch={a} />
        <Pipe d={L_ARMHOLE}  outer={s} trim={a} ow={12} tw={7.5} iw={1.2} blurId={bsm} stitch={a} />
        <Pipe d={R_ARMHOLE}  outer={s} trim={a} ow={12} tw={7.5} iw={1.2} blurId={bsm} stitch={a} />
        <CollarBand d={NECK_FRONT} s={s} a={a} bsm={bsm} />

        {/* Classic block number */}
        <JerseyNumber x={100} y={210} fs={96}
          fill={s} outline={a} border={numBorder} clip={clip} numStyle={numStyle}>
          {num}
        </JerseyNumber>
      </>
    );
  }

  // ── CULTURE ───────────────────────────────────────────────────────────────
  if (system === "culture") {
    return (
      <>
        <path d={SILHOUETTE} fill={p} filter={`url(#${clipId}-spec3d)`} />

        {/* Asymmetric brushstroke secondary panel — bold upper-left geometry */}
        <polygon points="10,84 12,66 46,6 72,42 64,70 92,98 60,168 22,168"
          fill={s} clipPath={clip} opacity="0.90" />
        <polygon points="10,84 12,66 46,6 72,42 64,70 92,98 60,168 22,168"
          clipPath={clip} filter={`url(#${clipId}-ctour)`} />

        {/* Bottom-right secondary accent block */}
        <polygon points="120,190 178,190 178,244 86,244" fill={s} clipPath={clip} opacity="0.72" />

        {/* Diagonal slash — the edge between panel and body */}
        <line x1="64"  y1="70" x2="120" y2="190" stroke={a}     strokeWidth="3.5" strokeOpacity="0.62" clipPath={clip} />
        <line x1="61"  y1="70" x2="117" y2="190" stroke="white" strokeWidth="0.8" strokeOpacity="0.18" clipPath={clip} />

        {/* Kinetic speed diagonals on right body */}
        <line x1="140" y1="96"  x2="90"  y2="244" stroke="black" strokeWidth="12" strokeOpacity="0.13" clipPath={clip} />
        <line x1="153" y1="96"  x2="103" y2="244" stroke="black" strokeWidth="7"  strokeOpacity="0.08" clipPath={clip} />
        <line x1="164" y1="96"  x2="114" y2="244" stroke="black" strokeWidth="4"  strokeOpacity="0.05" clipPath={clip} />

        {/* Dot scatter — cultural mark detail */}
        <circle cx="154" cy="112" r="4.2" fill={a} opacity="0.55" clipPath={clip} />
        <circle cx="166" cy="124" r="2.8" fill={a} opacity="0.40" clipPath={clip} />
        <circle cx="146" cy="136" r="2.2" fill={a} opacity="0.28" clipPath={clip} />

        {/* Seam piping */}
        <Pipe d={L_SHOULDER} outer={s} trim={a} ow={7}  tw={4.5} iw={0.9} stitch={a} />
        <Pipe d={R_SHOULDER} outer={s} trim={a} ow={7}  tw={4.5} iw={0.9} stitch={a} />
        <Pipe d={L_ARMHOLE}  outer={s} trim={a} ow={11} tw={7}   iw={1.1} blurId={bsm} stitch={a} />
        <Pipe d={R_ARMHOLE}  outer={s} trim={a} ow={11} tw={7}   iw={1.1} blurId={bsm} stitch={a} />
        <CollarBand d={NECK_FRONT} s={s} a={a} bsm={bsm} />

        {/* Tilted tackle-twill number */}
        <JerseyNumber x={118} y={208} fs={92}
          fill={darkS ? s : "#111111"} outline={a} border="#040404"
          clip={clip} xform="rotate(-9 118 208)" numStyle={numStyle}>
          {num}
        </JerseyNumber>
      </>
    );
  }

  // Fallback
  return (
    <>
      <path d={SILHOUETTE} fill={p} />
      <CollarBand d={NECK_FRONT} s="#111" a={a} bsm={`${clipId}-bsm`} />
      <Pipe d={L_ARMHOLE} outer="#111" trim={a} ow={11} tw={6.5} iw={1.0} />
      <Pipe d={R_ARMHOLE} outer="#111" trim={a} ow={11} tw={6.5} iw={1.0} />
      <text x="100" y="208" textAnchor="middle" fontFamily={FONT}
        fontSize="96" fontWeight="900" fill="white" clipPath={clip}>{num}</text>
    </>
  );
}

function BackJersey({ system, p, s, a, num, numStyle, clipId, gradId }: LayerProps) {
  const clip     = `url(#${clipId})`;
  const bsm      = `${clipId}-bsm`;
  const bodyFill = system === "gradient" ? `url(#${gradId})` : p;
  const darkS    = isColorDark(s);

  return (
    <>
      <path d={SILHOUETTE} fill={bodyFill} filter={`url(#${clipId}-spec3d)`} />

      {system === "bold" && (
        <>
          <SidePanels s={s} clip={clip} cid={clipId} />
          <Pipe d={L_SEAM}     outer={s} trim={a} ow={8}  tw={5}   iw={1.0} blurId={bsm} stitch={a} />
          <Pipe d={R_SEAM}     outer={s} trim={a} ow={8}  tw={5}   iw={1.0} blurId={bsm} stitch={a} />
          <Pipe d={L_SHOULDER} outer={s} trim={a} ow={8}  tw={5}   iw={1.0} stitch={a} />
          <Pipe d={R_SHOULDER} outer={s} trim={a} ow={8}  tw={5}   iw={1.0} stitch={a} />
          <Pipe d={L_ARMHOLE}  outer={s} trim={a} ow={13} tw={8}   iw={1.2} blurId={bsm} stitch={a} />
          <Pipe d={R_ARMHOLE}  outer={s} trim={a} ow={13} tw={8}   iw={1.2} blurId={bsm} stitch={a} />
          <line x1="40"  y1="244" x2="148" y2="88" stroke="black" strokeWidth="16" strokeOpacity="0.14" clipPath={clip} />
          <line x1="54"  y1="244" x2="162" y2="88" stroke="black" strokeWidth="10" strokeOpacity="0.09" clipPath={clip} />
          <path d="M 24,238 Q 100,254 176,238 L 176,244 Q 100,260 24,244 Z" fill={a} clipPath={clip} opacity="0.55" />
        </>
      )}
      {system === "gradient" && (
        <>
          <line x1="10" y1="104" x2="190" y2="66"  stroke="white" strokeWidth="2.0" strokeOpacity="0.14" clipPath={clip} />
          <line x1="10" y1="128" x2="190" y2="90"  stroke="white" strokeWidth="1.3" strokeOpacity="0.09" clipPath={clip} />
          <Pipe d={L_SHOULDER} outer="#0a0a0a" trim={a} ow={7}  tw={4.5} iw={0.9} stitch={a} />
          <Pipe d={R_SHOULDER} outer="#0a0a0a" trim={a} ow={7}  tw={4.5} iw={0.9} stitch={a} />
          <Pipe d={L_ARMHOLE}  outer="#0a0a0a" trim={a} ow={11} tw={7}   iw={1.1} blurId={bsm} stitch={a} />
          <Pipe d={R_ARMHOLE}  outer="#0a0a0a" trim={a} ow={11} tw={7}   iw={1.1} blurId={bsm} stitch={a} />
          <path d="M 24,238 Q 100,254 176,238 L 176,244 Q 100,260 24,244 Z" fill={a} clipPath={clip} opacity="0.65" />
        </>
      )}
      {system === "program" && (
        <>
          <SidePanels s={s} clip={clip} cid={clipId} />
          <line x1="50"  y1="66" x2="50"  y2="244" stroke={a} strokeWidth="5.5" clipPath={clip} />
          <line x1="58"  y1="70" x2="58"  y2="244" stroke={a} strokeWidth="2.4" strokeOpacity="0.55" clipPath={clip} />
          <line x1="150" y1="66" x2="150" y2="244" stroke={a} strokeWidth="5.5" clipPath={clip} />
          <line x1="142" y1="70" x2="142" y2="244" stroke={a} strokeWidth="2.4" strokeOpacity="0.55" clipPath={clip} />
          <Pipe d={L_SHOULDER} outer={s} trim={a} ow={8}  tw={5}   iw={1.0} stitch={a} />
          <Pipe d={R_SHOULDER} outer={s} trim={a} ow={8}  tw={5}   iw={1.0} stitch={a} />
          <Pipe d={L_ARMHOLE}  outer={s} trim={a} ow={12} tw={7.5} iw={1.2} blurId={bsm} stitch={a} />
          <Pipe d={R_ARMHOLE}  outer={s} trim={a} ow={12} tw={7.5} iw={1.2} blurId={bsm} stitch={a} />
        </>
      )}
      {system === "culture" && (
        <>
          <polygon points="10,84 12,66 46,6 72,42 64,70 92,98 60,168 22,168"
            fill={s} clipPath={clip} opacity="0.90" />
          <polygon points="10,84 12,66 46,6 72,42 64,70 92,98 60,168 22,168"
            clipPath={clip} filter={`url(#${clipId}-ctour)`} />
          <polygon points="120,190 178,190 178,244 86,244" fill={s} clipPath={clip} opacity="0.72" />
          <line x1="64"  y1="70" x2="120" y2="190" stroke={a} strokeWidth="3.5" strokeOpacity="0.60" clipPath={clip} />
          <Pipe d={L_SHOULDER} outer={s} trim={a} ow={7}  tw={4.5} iw={0.9} stitch={a} />
          <Pipe d={R_SHOULDER} outer={s} trim={a} ow={7}  tw={4.5} iw={0.9} stitch={a} />
          <Pipe d={L_ARMHOLE}  outer={s} trim={a} ow={11} tw={7}   iw={1.1} blurId={bsm} stitch={a} />
          <Pipe d={R_ARMHOLE}  outer={s} trim={a} ow={11} tw={7}   iw={1.1} blurId={bsm} stitch={a} />
        </>
      )}

      {/* Back collar band — premium 2-tone construction matching front */}
      <CollarBand d={COLLAR_BACK} s={s} a={a} bsm={bsm} />

      {/* Back number — system-specific treatment */}
      {system === "culture" ? (
        <JerseyNumber x={118} y={212} fs={96}
          fill={darkS ? s : "#111111"} outline={a} border="#040404"
          clip={clip} xform="rotate(-9 118 212)" numStyle={numStyle}>
          {num}
        </JerseyNumber>
      ) : system === "program" ? (
        <JerseyNumber x={100} y={212} fs={96}
          fill={s} outline={a} border="#1a1a1a" clip={clip} numStyle={numStyle}>
          {num}
        </JerseyNumber>
      ) : system === "gradient" ? (
        <>
          <text x="100" y="212" textAnchor="middle" fontFamily={FONT} fontSize="96"
            fontWeight="900" fill={a} fillOpacity="0.32" clipPath={clip}
            filter={`url(#${clipId}-glow)`}>{num}</text>
          <text x="100" y="212" textAnchor="middle" fontFamily={FONT} fontSize="96"
            fontWeight="900" fill="white" fillOpacity="0.92" clipPath={clip}>{num}</text>
        </>
      ) : (
        <JerseyNumber x={100} y={212} fs={96}
          fill={darkS ? s : "#111111"} outline={a} border="#050505" clip={clip} numStyle={numStyle}>
          {num}
        </JerseyNumber>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JerseyPreview({
  system, primaryColor, secondaryColor, accentColor,
  onPrimaryChange, onSecondaryChange, onAccentChange,
  teamName, jerseyNumber, onNumberChange,
  logoUrls: initialLogoUrls,
  logoPlacement,
  numberStyle,
  orderId, supabase, onConceptSaved,
}: JerseyPreviewProps) {
  const frontSvgRef = useRef<SVGSVGElement>(null);
  const backSvgRef  = useRef<SVGSVGElement>(null);
  const uploadRef   = useRef<HTMLInputElement>(null);
  const dragState   = useRef<ActiveDrag | null>(null);

  const [view, setView]                 = useState<"front" | "back">("front");
  const [logos, setLogos]               = useState<LogoItem[]>([]);
  const [activeLogoId, setActiveLogoId] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [capturing, setCapturing]       = useState(false);
  const [captureState, setCaptureState] = useState<"idle" | "saved" | "error">("idle");

  // Sync logos from parent — adds new URLs without resetting positions of existing logos
  useEffect(() => {
    if (initialLogoUrls.length === 0) return;
    const placement = PLACEMENT_POS[logoPlacement] ?? { x: 132, y: 108 };
    setLogos(prev => {
      const existingUrls = new Set(prev.map(l => l.url));
      const newItems = initialLogoUrls
        .filter(url => !existingUrls.has(url))
        .map((url, i) => ({
          id: `logo-init-${Date.now()}-${i}-${url.slice(-8)}`,
          url,
          x: prev.length === 0 && i === 0 ? placement.x : 100 + (i % 2 === 0 ? 20 : -20),
          y: prev.length === 0 && i === 0 ? placement.y : 130 + Math.floor(i / 2) * 22,
          size: LOGO_DEFAULT,
        }));
      return newItems.length > 0 ? [...prev, ...newItems] : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLogoUrls]);

  // Re-apply placement position when logoPlacement prop changes
  useEffect(() => {
    if (!logoPlacement || !PLACEMENT_POS[logoPlacement]) return;
    const pos = PLACEMENT_POS[logoPlacement];
    setLogos(prev => prev.map((l, i) => i === 0 ? { ...l, x: pos.x, y: pos.y } : l));
    if (logoPlacement === "back_neck") setView("back");
  }, [logoPlacement]);

  // SVG coordinate converter — used for both move and resize
  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = frontSvgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left)  / rect.width)  * 200,
      y: ((clientY - rect.top)   / rect.height)  * 264,
      scaleX: 200 / rect.width,
      scaleY: 264 / rect.height,
    };
  }, []);

  // Global mouse/touch handlers for drag and resize
  useEffect(() => {
    function onMove(clientX: number, clientY: number) {
      const ds = dragState.current;
      if (!ds) return;
      const coords = clientToSvg(clientX, clientY);
      if (!coords) return;

      const dx = (clientX - ds.startClientX) * coords.scaleX;
      const dy = (clientY - ds.startClientY) * coords.scaleY;

      setLogos(prev => prev.map(l => {
        if (l.id !== ds.logoId) return l;
        if (ds.mode === "move") {
          return {
            ...l,
            x: Math.max(14, Math.min(186, ds.origX + dx)),
            y: Math.max(64, Math.min(234, ds.origY + dy)),
          };
        } else {
          // Resize: distance from logo center to cursor determines new size
          const distX = Math.abs(coords.x - ds.origX);
          const distY = Math.abs(coords.y - ds.origY);
          const newHalf = Math.max(LOGO_MIN / 2, Math.min(LOGO_MAX / 2, Math.max(distX, distY)));
          return { ...l, size: newHalf * 2 };
        }
      }));
    }

    function onMouseMove(e: MouseEvent) { onMove(e.clientX, e.clientY); }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }
    function onUp() { dragState.current = null; }

    window.addEventListener("mousemove",  onMouseMove);
    window.addEventListener("mouseup",    onUp);
    window.addEventListener("touchmove",  onTouchMove, { passive: false });
    window.addEventListener("touchend",   onUp);
    return () => {
      window.removeEventListener("mousemove",  onMouseMove);
      window.removeEventListener("mouseup",    onUp);
      window.removeEventListener("touchmove",  onTouchMove);
      window.removeEventListener("touchend",   onUp);
    };
  }, [clientToSvg]);

  function startMoveDrag(e: React.MouseEvent | React.TouchEvent, logo: LogoItem) {
    e.preventDefault();
    e.stopPropagation();
    setActiveLogoId(logo.id);
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragState.current = {
      logoId: logo.id, mode: "move",
      startClientX: clientX, startClientY: clientY,
      origX: logo.x, origY: logo.y, origSize: logo.size,
    };
  }

  function startResizeDrag(e: React.MouseEvent | React.TouchEvent, logo: LogoItem) {
    e.preventDefault();
    e.stopPropagation();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragState.current = {
      logoId: logo.id, mode: "resize",
      startClientX: clientX, startClientY: clientY,
      origX: logo.x, origY: logo.y, origSize: logo.size,
    };
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLogoUploading(true);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const ext  = file.name.split(".").pop() ?? "png";
        const path = `${orderId}/logo_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
        if (error) continue;
        const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(path);
        setLogos(prev => [...prev, {
          id: `logo-up-${Date.now()}`,
          url: publicUrl,
          x: 100,
          y: 148,
          size: LOGO_DEFAULT,
        }]);
      } catch { /* ignore */ }
    }
    setLogoUploading(false);
    e.target.value = "";
  }

  function removeLogo(logoId: string) {
    setLogos(prev => prev.filter(l => l.id !== logoId));
    if (activeLogoId === logoId) setActiveLogoId(null);
  }

  async function handleCapture() {
    const activeSvg = view === "front" ? frontSvgRef.current : backSvgRef.current;
    if (!activeSvg || capturing) return;
    setCapturing(true);
    setCaptureState("idle");
    try {
      // Resolve all logo URLs to inline data URLs for capture
      const resolvedLogos = await Promise.all(
        logos.map(l => fetchAsDataUrl(l.url))
      );

      const clone = activeSvg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("width",  "600");
      clone.setAttribute("height", "792");

      const imgEls = clone.querySelectorAll("[data-logo]");
      imgEls.forEach((el, i) => {
        if (resolvedLogos[i]) el.setAttribute("href", resolvedLogos[i]!);
      });

      const svgStr  = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl  = URL.createObjectURL(svgBlob);

      const canvas = document.createElement("canvas");
      canvas.width = 600; canvas.height = 792;
      const ctx = canvas.getContext("2d")!;
      await new Promise<void>((res, rej) => {
        const img = new Image();
        img.onload  = () => { ctx.drawImage(img, 0, 0); res(); };
        img.onerror = rej;
        img.src = svgUrl;
      });
      URL.revokeObjectURL(svgUrl);

      const pngBlob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => b ? res(b) : rej(new Error("toBlob null")), "image/png")
      );
      const path = `${orderId}/builder_${Date.now()}.png`;
      const { error: uploadErr } = await supabase.storage
        .from("logos").upload(path, pngBlob, { contentType: "image/png", upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(path);
      await supabase.from("concepts").delete().eq("order_id", orderId).eq("concept_number", 0);
      const { error: insertErr } = await supabase.from("concepts").insert({
        order_id: orderId, concept_number: 0, image_url: publicUrl, selected: false,
      });
      if (insertErr) throw insertErr;

      setCaptureState("saved");
      onConceptSaved();
      setTimeout(() => setCaptureState("idle"), 5000);
    } catch (err) {
      console.error("Capture failed:", err);
      setCaptureState("error");
      setTimeout(() => setCaptureState("idle"), 4000);
    } finally {
      setCapturing(false);
    }
  }

  const p   = primaryColor   || SYSTEM_DEFAULTS[system]?.primary   || "#CC1B1B";
  const s   = secondaryColor || SYSTEM_DEFAULTS[system]?.secondary || "#0a0a0a";
  const a   = accentColor    || SYSTEM_DEFAULTS[system]?.accent    || "#F0EAD6";
  const num  = jerseyNumber  || "00";


  const systemLabel = system
    ? `${system.charAt(0).toUpperCase() + system.slice(1)} System`
    : "—";

  return (
    <div className="flex flex-col gap-4">

      <div className="rounded-2xl overflow-hidden border border-[#1c1c1c] bg-[#0a0a0a]">

        {/* Front / Back toggle */}
        <div className="flex border-b border-[#1c1c1c]">
          {(["front", "back"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`flex-1 py-2.5 text-[10px] font-display uppercase tracking-[0.22em] transition-colors duration-200
                ${view === v ? "text-white bg-[#141414]" : "text-white/25 hover:text-white/55"}`}>
              {v}
            </button>
          ))}
        </div>

        {/* Header meta */}
        <div className="px-5 pt-4 pb-0 flex items-center justify-between">
          <span className="text-[9px] font-display uppercase tracking-[0.25em] text-white/25">{systemLabel}</span>
          {view === "front" && logos.length > 0 && (
            <span className="text-[9px] font-barlow text-white/20 italic">drag · corner to resize</span>
          )}
        </div>

        {/* ── Premium 2.5D SVG jersey canvas ─────────────────────────────── */}
        {/* Firefly pipeline: clone activeSvg → serialize → send to Firefly rendering API */}
        <div className="flex justify-center px-4 py-2">
          <div style={{ position: "relative", width: 250, height: 320 }}>

            {/* ── FRONT VIEW ─────────────────────────────────────────────── */}
            <svg
              ref={frontSvgRef}
              viewBox="0 0 200 264"
              width={250} height={320}
              style={{ display: view === "front" ? "block" : "none", userSelect: "none" }}
              onClick={() => setActiveLogoId(null)}
            >
              <SvgDefs
                system={system} p={p} s={s} a={a}
                clipId="jpf" gradId="jpf-g" lightId="jpf-l" sideId="jpf-si" sheenId="jpf-sh"
              />

              {/* Jersey rendering */}
              <FrontJersey
                system={system} p={p} s={s} a={a}
                num={num} numStyle={numberStyle}
                clipId="jpf" gradId="jpf-g"
              />

              {/* Fabric fold overlays */}
              <FabricFolds clip="url(#jpf)" />

              {/* Lighting pass */}
              <LightingOverlays cid="jpf" lid="jpf-l" sid="jpf-si" shid="jpf-sh" />

              {/* Logo placeholder */}
              {logos.length === 0 && (
                <g style={{ pointerEvents: "none" }}>
                  <rect x="118" y="94" width="28" height="28"
                    fill="none" stroke="white" strokeWidth="0.75"
                    strokeDasharray="3,2" strokeOpacity="0.18" />
                  <text x="132" y="112" textAnchor="middle" fontSize="5"
                    fill="white" fillOpacity="0.18" fontFamily="sans-serif">LOGO</text>
                </g>
              )}

              {/* Logos */}
              {logos.map((logo) => {
                const half     = logo.size / 2;
                const isActive = activeLogoId === logo.id;
                return (
                  <g key={logo.id}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <image
                      data-logo=""
                      href={logo.url}
                      x={logo.x - half} y={logo.y - half}
                      width={logo.size}  height={logo.size}
                      clipPath="url(#jpf)"
                      preserveAspectRatio="xMidYMid meet"
                      style={{ cursor: "grab" }}
                      onMouseDown={(e) => startMoveDrag(e, logo)}
                      onTouchStart={(e) => startMoveDrag(e, logo)}
                      onClick={(e) => { e.stopPropagation(); setActiveLogoId(logo.id); }}
                    />
                    {isActive && (
                      <>
                        <rect
                          x={logo.x - half - 2} y={logo.y - half - 2}
                          width={logo.size + 4}  height={logo.size + 4}
                          fill="none" stroke="white" strokeWidth="0.75"
                          strokeDasharray="3,2" strokeOpacity="0.55"
                          style={{ pointerEvents: "none" }} />
                        <g style={{ cursor: "se-resize" }}
                          onMouseDown={(e) => startResizeDrag(e, logo)}
                          onTouchStart={(e) => startResizeDrag(e, logo)}>
                          <circle cx={logo.x + half + 2} cy={logo.y + half + 2}
                            r="4.5" fill="white" stroke="rgba(0,0,0,0.4)" strokeWidth="0.5" />
                        </g>
                        <g style={{ cursor: "pointer" }}
                          onClick={(e) => { e.stopPropagation(); removeLogo(logo.id); }}>
                          <circle cx={logo.x + half + 2} cy={logo.y - half - 2}
                            r="4.5" fill="#CC1B1B" />
                          <line x1={logo.x + half - 0.8} y1={logo.y - half - 4.8}
                            x2={logo.x + half + 4.8}   y2={logo.y - half + 0.8}
                            stroke="white" strokeWidth="1.2" style={{ pointerEvents: "none" }} />
                          <line x1={logo.x + half - 0.8} y1={logo.y - half + 0.8}
                            x2={logo.x + half + 4.8}   y2={logo.y - half - 4.8}
                            stroke="white" strokeWidth="1.2" style={{ pointerEvents: "none" }} />
                        </g>
                      </>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* ── BACK VIEW ──────────────────────────────────────────────── */}
            <svg
              ref={backSvgRef}
              viewBox="0 0 200 264"
              width={250} height={320}
              style={{ display: view === "back" ? "block" : "none", userSelect: "none" }}
            >
              <SvgDefs
                system={system} p={p} s={s} a={a}
                clipId="jpb" gradId="jpb-g" lightId="jpb-l" sideId="jpb-si" sheenId="jpb-sh"
              />

              <BackJersey
                system={system} p={p} s={s} a={a}
                num={num} numStyle={numberStyle}
                clipId="jpb" gradId="jpb-g"
              />

              <FabricFolds clip="url(#jpb)" />

              <LightingOverlays cid="jpb" lid="jpb-l" sid="jpb-si" shid="jpb-sh" />
            </svg>

          </div>
        </div>

        {/* Controls */}
        <div className="border-t border-[#1c1c1c] px-6 py-5 space-y-4">
          {/* Palette bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
            <div className="flex-[3] rounded-l-full" style={{ backgroundColor: p }} />
            <div className="flex-[2]"               style={{ backgroundColor: s }} />
            <div className="flex-1 rounded-r-full"  style={{ backgroundColor: a }} />
          </div>

          {/* Color pickers */}
          <div className="flex items-center gap-4">
            <ColorSwatch label="Body"  value={p} onChange={onPrimaryChange}   />
            <ColorSwatch label="Panel" value={s} onChange={onSecondaryChange} />
            <ColorSwatch label="Trim"  value={a} onChange={onAccentChange}    />
          </div>

          {/* Number + logo management row */}
          <div className="flex items-center gap-4">
            {/* Jersey number */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <span className="text-[9px] font-display uppercase tracking-[0.22em] text-white/35">No.</span>
              <input type="text" value={jerseyNumber}
                onChange={(e) => onNumberChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="00" maxLength={2}
                className="w-14 text-center bg-white/[0.07] border border-white/15 rounded-lg py-1.5 text-white font-display font-bold text-xl focus:outline-none focus:border-white/40 transition-colors placeholder-white/20" />
            </div>

            <div className="flex-1" />

            {/* Add logo button */}
            <button
              type="button"
              onClick={() => uploadRef.current?.click()}
              disabled={logoUploading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 hover:border-white/35 transition-colors disabled:opacity-50">
              <input ref={uploadRef} type="file" accept="image/*" multiple className="hidden"
                onChange={handleLogoUpload} />
              {logoUploading ? (
                <div className="w-3 h-3 border border-white/40 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3 h-3 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              )}
              <span className="text-[9px] font-display uppercase tracking-[0.18em] text-white/45">
                {logoUploading ? "Adding…" : "Add Logo"}
              </span>
            </button>
          </div>

          {/* Logo count indicator */}
          {logos.length > 0 && (
            <p className="text-[9px] text-white/20 font-barlow">
              {logos.length} logo{logos.length !== 1 ? "s" : ""} on jersey
              {activeLogoId ? " · click jersey to deselect" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Generate builder concept */}
      <button type="button" onClick={handleCapture} disabled={capturing}
        className={`w-full py-3.5 rounded-xl font-display font-bold text-sm uppercase tracking-[0.15em] transition-all duration-300 border
          ${captureState === "saved"  ? "bg-emerald-600 border-emerald-600 text-white"
          : captureState === "error" ? "bg-transparent border-red-400 text-red-400"
          : "bg-brand-text text-brand-bg border-brand-text hover:bg-brand-primary hover:text-white hover:border-brand-primary"}
          disabled:opacity-50 disabled:cursor-not-allowed`}>
        {capturing        ? "Saving…"
          : captureState === "saved" ? "✓ Builder concept saved"
          : captureState === "error" ? "Save failed. Try again"
          : "Generate Builder Concept →"}
      </button>

      {/* Disclaimer */}
      <div className="bg-brand-surface border border-brand-border rounded-xl px-4 py-4 flex items-start gap-3">
        <svg className="w-4 h-4 text-brand-muted mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
        </svg>
        <div>
          <p className="text-[9px] font-display uppercase tracking-[0.2em] text-brand-muted mb-1.5">Directional Preview Only</p>
          <p className="text-[11px] text-brand-muted font-barlow leading-relaxed">
            This builder is a directional guide, not final production artwork. Colors, typography, proportions, and material finish will be refined by our design team. Saving a builder concept adds it alongside AI-generated concepts in your review without replacing either.
          </p>
        </div>
      </div>

    </div>
  );
}

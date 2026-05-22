"use client";

import { useRouter } from "next/navigation";
import { useBrief } from "../context";
import { StepBar } from "../StepBar";
import { useTenant } from "@/lib/tenant/context";

/* ── Jersey SVG previews ─────────────────────────────────────── */

const JERSEY_PATH =
  "M30 5C28 5 24 3 20 9L3 18L8 30L17 26V68H43V26L52 30L57 18L40 9C36 3 32 5 30 5Z";

function BoldJersey() {
  return (
    <svg viewBox="0 0 60 72" fill="none" className="w-full h-full">
      <path d={JERSEY_PATH} fill="#0f0f0f" stroke="#2a2a2a" strokeWidth="1" />
      <clipPath id="bold-clip">
        <path d={JERSEY_PATH} />
      </clipPath>
      <g clipPath="url(#bold-clip)">
        <rect x="0" y="28" width="60" height="7" fill="#C4A35A" />
        <rect x="0" y="0" width="5" height="72" fill="#1a1a1a" />
        <rect x="55" y="0" width="5" height="72" fill="#1a1a1a" />
        <text x="30" y="58" textAnchor="middle"
          fontFamily="Arial Black, Impact, sans-serif"
          fontWeight="900" fontSize="20" letterSpacing="-1" fill="white">
          00
        </text>
      </g>
    </svg>
  );
}

function GradientJersey() {
  return (
    <svg viewBox="0 0 60 72" fill="none" className="w-full h-full">
      <defs>
        <linearGradient id="grad-fill" x1="0" y1="0" x2="60" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1c1c2e" />
          <stop offset="100%" stopColor="#2a2218" />
        </linearGradient>
        <linearGradient id="grad-panel" x1="0" y1="0" x2="60" y2="72" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#C4A35A" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#C4A35A" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <clipPath id="grad-clip"><path d={JERSEY_PATH} /></clipPath>
      <path d={JERSEY_PATH} fill="url(#grad-fill)" stroke="#2d2d3a" strokeWidth="1" />
      <g clipPath="url(#grad-clip)">
        <polygon points="0,20 60,50 60,72 0,72" fill="url(#grad-panel)" />
        <text x="30" y="58" textAnchor="middle" fontFamily="sans-serif"
          fontWeight="200" fontSize="18" letterSpacing="3" fill="rgba(255,255,255,0.65)">
          01
        </text>
      </g>
    </svg>
  );
}

function ProgramJersey() {
  return (
    <svg viewBox="0 0 60 72" fill="none" className="w-full h-full">
      <clipPath id="prog-clip"><path d={JERSEY_PATH} /></clipPath>
      <path d={JERSEY_PATH} fill="#161616" stroke="#2e2e2e" strokeWidth="1" />
      <g clipPath="url(#prog-clip)">
        <rect x="0" y="29" width="60" height="2.5" fill="#C4A35A" opacity="0.7" />
        <rect x="0" y="34" width="60" height="2.5" fill="#C4A35A" opacity="0.7" />
        <text x="30" y="60" textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700" fontSize="22" fill="white">
          G
        </text>
      </g>
    </svg>
  );
}

function CultureJersey() {
  return (
    <svg viewBox="0 0 60 72" fill="none" className="w-full h-full">
      <defs>
        <linearGradient id="culture-split" x1="0" y1="0" x2="60" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#111111" />
          <stop offset="50%" stopColor="#111111" />
          <stop offset="50%" stopColor="#1a1710" />
          <stop offset="100%" stopColor="#1a1710" />
        </linearGradient>
      </defs>
      <clipPath id="culture-clip"><path d={JERSEY_PATH} /></clipPath>
      <path d={JERSEY_PATH} fill="url(#culture-split)" stroke="#2a2a2a" strokeWidth="1" />
      <g clipPath="url(#culture-clip)">
        <line x1="28" y1="5" x2="44" y2="72" stroke="#C4A35A" strokeWidth="10" opacity="0.12" />
        <text x="34" y="58" textAnchor="middle" fontFamily="sans-serif"
          fontWeight="700" fontSize="16" letterSpacing="6" fill="#C4A35A">
          7
        </text>
        <line x1="30" y1="5" x2="30" y2="72" stroke="#C4A35A" strokeWidth="0.75" opacity="0.3" />
      </g>
    </svg>
  );
}

/* ── Data ────────────────────────────────────────────────────── */

const SYSTEMS = [
  {
    id: "bold",
    name: "Bold System",
    description: "Oversized, aggressive, high-energy",
    jersey: <BoldJersey />,
  },
  {
    id: "gradient",
    name: "Gradient System",
    description: "Clean, elevated, modern",
    jersey: <GradientJersey />,
  },
  {
    id: "program",
    name: "Program System",
    description: "Balanced, collegiate, timeless",
    jersey: <ProgramJersey />,
  },
  {
    id: "culture",
    name: "Culture System",
    description: "Fashion-forward, expressive",
    jersey: <CultureJersey />,
  },
];

/* ── Page ────────────────────────────────────────────────────── */

export default function BriefStylePage() {
  const router = useRouter();
  const { designSystem, setDesignSystem } = useBrief();
  const tenant = useTenant();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-12">
      {/* Wordmark */}
      <div className="w-full max-w-2xl mb-10">
        <span className="font-display text-gold text-xl tracking-[0.2em] uppercase">
          {tenant.name}
        </span>
      </div>

      {/* Card */}
      <div className="w-full max-w-2xl bg-surface border border-border rounded-2xl p-8 flex flex-col gap-8">
        <StepBar current={2} />

        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-4xl font-semibold text-foreground leading-tight">
            Choose your design system.
          </h1>
          <p className="font-body text-sm text-white/50 mt-1">
            This sets the visual language for your entire content package.
          </p>
        </div>

        {/* 2×2 grid */}
        <div className="grid grid-cols-2 gap-4">
          {SYSTEMS.map((system) => {
            const active = designSystem === system.id;
            return (
              <button
                key={system.id}
                type="button"
                onClick={() => setDesignSystem(active ? "" : system.id)}
                className={[
                  "relative flex flex-col rounded-xl border overflow-hidden text-left transition-all",
                  active
                    ? "border-gold shadow-[0_0_0_1px_#C4A35A]"
                    : "border-border hover:border-white/25",
                ].join(" ")}
              >
                {active && (
                  <div className="absolute top-3 right-3 z-10 w-5 h-5 rounded-full bg-gold flex items-center justify-center">
                    <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                      <path d="M2 6l3 3 5-5" stroke="#080808"
                        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}

                <div className="bg-background flex items-center justify-center py-8 px-10">
                  <div className="w-20 h-24">{system.jersey}</div>
                </div>

                <div className="bg-surface px-4 py-3 flex flex-col gap-1 border-t border-border">
                  <p className="font-display text-base font-semibold text-foreground tracking-wide">
                    {system.name}
                  </p>
                  <p className="font-body text-xs text-white/45">
                    {system.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/brief/new")}
            className="font-display tracking-[0.12em] uppercase text-sm px-6 py-4 rounded-xl border border-border text-white/50 hover:border-white/30 hover:text-white/70 transition-all"
          >
            ← Back
          </button>
          <button
            type="button"
            disabled={designSystem === ""}
            onClick={() => router.push("/brief/new/direction")}
            className={[
              "flex-1 font-display tracking-[0.15em] uppercase text-sm py-4 rounded-xl transition-all",
              designSystem !== ""
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

"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import BriefLayout from "@/components/brief/BriefLayout";
import { loadBriefState, saveBriefState } from "@/lib/brief-state";

const SYSTEMS = [
  {
    id: "bold",
    badge: "Bold System",
    name: "Bold Statement",
    tagline: "For teams that want to stand out.",
    bullets: [
      "Oversized, disproportionate lettering",
      "Aggressive, high-energy layout",
      "Maximum on-court presence",
    ],
  },
  {
    id: "gradient",
    badge: "Gradient System",
    name: "Modern Gradient",
    tagline: "Modern, elevated, and dynamic.",
    bullets: [
      "Color transitions and blends",
      "Clean but eye-catching finish",
      "Subtle precision detail work",
    ],
  },
  {
    id: "program",
    badge: "Program System",
    name: "Clean Program",
    tagline: "Professional and consistent.",
    bullets: [
      "Balanced, collegiate feel",
      "Timeless and structured design",
      "Reproduces cleanly across all gear",
    ],
  },
  {
    id: "culture",
    badge: "Culture System",
    name: "Street Culture",
    tagline: "Built for the culture.",
    bullets: [
      "Fashion-forward aesthetics",
      "Off-balance, expressive typography",
      "Player-driven identity",
    ],
  },
];

const CUTS = [
  { id: "mens", label: "Men's / Unisex" },
  { id: "womens", label: "Women's" },
  { id: "youth", label: "Youth" },
  { id: "unisex", label: "Mixed (multiple cuts)" },
];

// ── SVG jersey illustrations ───────────────────────────────────────────────

function BoldJersey() {
  return (
    <svg viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <clipPath id="bold-clip">
          <path d="M42,0 L42,42 Q26,52 16,72 L16,228 Q100,248 184,228 L184,72 Q174,52 158,42 L158,0 Q138,32 100,50 Q62,32 42,0Z" />
        </clipPath>
      </defs>
      <path d="M42,0 L42,42 Q26,52 16,72 L16,228 Q100,248 184,228 L184,72 Q174,52 158,42 L158,0 Q138,32 100,50 Q62,32 42,0Z" fill="#111111" />
      <polygon points="16,72 90,72 16,210" fill="#CC1B1B" clipPath="url(#bold-clip)" />
      <polygon points="184,130 184,228 60,228" fill="#CC1B1B" clipPath="url(#bold-clip)" />
      <line x1="88" y1="72" x2="62" y2="228" stroke="white" strokeWidth="3" clipPath="url(#bold-clip)" />
      <text x="100" y="170" textAnchor="middle" fontFamily="Arial Black,Impact,sans-serif" fontSize="72" fontWeight="900" fill="white" opacity="0.95" clipPath="url(#bold-clip)">55</text>
      <text x="100" y="170" textAnchor="middle" fontFamily="Arial Black,Impact,sans-serif" fontSize="72" fontWeight="900" fill="none" stroke="#CC1B1B" strokeWidth="2" clipPath="url(#bold-clip)">55</text>
      <path d="M42,0 Q62,32 100,50 Q138,32 158,0" fill="none" stroke="#CC1B1B" strokeWidth="4" strokeLinecap="round" />
      <path d="M42,42 Q26,52 16,72" fill="none" stroke="#CC1B1B" strokeWidth="3" />
      <path d="M158,42 Q174,52 184,72" fill="none" stroke="#CC1B1B" strokeWidth="3" />
    </svg>
  );
}

function GradientJersey() {
  return (
    <svg viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <linearGradient id="grad-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#111111" />
          <stop offset="55%" stopColor="#CC1B1B" />
          <stop offset="100%" stopColor="#f5f5f5" />
        </linearGradient>
        <clipPath id="grad-clip">
          <path d="M42,0 L42,42 Q26,52 16,72 L16,228 Q100,248 184,228 L184,72 Q174,52 158,42 L158,0 Q138,32 100,50 Q62,32 42,0Z" />
        </clipPath>
      </defs>
      <path d="M42,0 L42,42 Q26,52 16,72 L16,228 Q100,248 184,228 L184,72 Q174,52 158,42 L158,0 Q138,32 100,50 Q62,32 42,0Z" fill="url(#grad-fill)" />
      <line x1="16" y1="140" x2="184" y2="100" stroke="white" strokeWidth="1" strokeOpacity="0.25" clipPath="url(#grad-clip)" />
      <line x1="16" y1="160" x2="184" y2="120" stroke="white" strokeWidth="0.5" strokeOpacity="0.15" clipPath="url(#grad-clip)" />
      <text x="100" y="175" textAnchor="middle" fontFamily="Arial Black,Impact,sans-serif" fontSize="64" fontWeight="900" fill="white" opacity="0.9" clipPath="url(#grad-clip)">55</text>
      <path d="M42,0 Q62,32 100,50 Q138,32 158,0" fill="none" stroke="white" strokeWidth="3" strokeOpacity="0.5" strokeLinecap="round" />
      <path d="M42,42 Q26,52 16,72" fill="none" stroke="white" strokeWidth="2" strokeOpacity="0.4" />
      <path d="M158,42 Q174,52 184,72" fill="none" stroke="white" strokeWidth="2" strokeOpacity="0.4" />
    </svg>
  );
}

function ProgramJersey() {
  return (
    <svg viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <clipPath id="prog-clip">
          <path d="M42,0 L42,42 Q26,52 16,72 L16,228 Q100,248 184,228 L184,72 Q174,52 158,42 L158,0 Q138,32 100,50 Q62,32 42,0Z" />
        </clipPath>
      </defs>
      <path d="M42,0 L42,42 Q26,52 16,72 L16,228 Q100,248 184,228 L184,72 Q174,52 158,42 L158,0 Q138,32 100,50 Q62,32 42,0Z" fill="#f2f2f2" />
      <polygon points="16,72 48,72 48,228 16,228" fill="#CC1B1B" clipPath="url(#prog-clip)" />
      <polygon points="152,72 184,72 184,228 152,228" fill="#CC1B1B" clipPath="url(#prog-clip)" />
      <line x1="48" y1="72" x2="48" y2="228" stroke="#111111" strokeWidth="2.5" clipPath="url(#prog-clip)" />
      <line x1="55" y1="72" x2="55" y2="228" stroke="#111111" strokeWidth="1" clipPath="url(#prog-clip)" />
      <line x1="152" y1="72" x2="152" y2="228" stroke="#111111" strokeWidth="2.5" clipPath="url(#prog-clip)" />
      <line x1="145" y1="72" x2="145" y2="228" stroke="#111111" strokeWidth="1" clipPath="url(#prog-clip)" />
      <text x="100" y="175" textAnchor="middle" fontFamily="Arial Black,Impact,sans-serif" fontSize="64" fontWeight="900" fill="#CC1B1B" clipPath="url(#prog-clip)">55</text>
      <text x="100" y="175" textAnchor="middle" fontFamily="Arial Black,Impact,sans-serif" fontSize="64" fontWeight="900" fill="none" stroke="#111111" strokeWidth="2" clipPath="url(#prog-clip)">55</text>
      <path d="M42,0 Q62,32 100,50 Q138,32 158,0" fill="none" stroke="#CC1B1B" strokeWidth="5" strokeLinecap="round" />
      <path d="M42,42 Q26,52 16,72" fill="none" stroke="#CC1B1B" strokeWidth="4" />
      <path d="M158,42 Q174,52 184,72" fill="none" stroke="#CC1B1B" strokeWidth="4" />
    </svg>
  );
}

function CultureJersey() {
  return (
    <svg viewBox="0 0 200 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <clipPath id="cult-clip">
          <path d="M42,0 L42,42 Q26,52 16,72 L16,228 Q100,248 184,228 L184,72 Q174,52 158,42 L158,0 Q138,32 100,50 Q62,32 42,0Z" />
        </clipPath>
      </defs>
      <path d="M42,0 L42,42 Q26,52 16,72 L16,228 Q100,248 184,228 L184,72 Q174,52 158,42 L158,0 Q138,32 100,50 Q62,32 42,0Z" fill="#0d0d0d" />
      <polygon points="16,72 80,72 16,140" fill="#CC1B1B" clipPath="url(#cult-clip)" />
      <polygon points="184,160 184,228 110,228" fill="#CC1B1B" clipPath="url(#cult-clip)" />
      <polygon points="60,228 100,150 130,228" fill="#CC1B1B" opacity="0.6" clipPath="url(#cult-clip)" />
      <polygon points="16,145 50,72 65,72 28,145" fill="white" opacity="0.9" clipPath="url(#cult-clip)" />
      <polygon points="172,160 184,135 184,160" fill="white" opacity="0.7" clipPath="url(#cult-clip)" />
      <circle cx="140" cy="90" r="3" fill="#CC1B1B" opacity="0.5" clipPath="url(#cult-clip)" />
      <circle cx="152" cy="96" r="2" fill="#CC1B1B" opacity="0.4" clipPath="url(#cult-clip)" />
      <circle cx="160" cy="88" r="2.5" fill="#CC1B1B" opacity="0.3" clipPath="url(#cult-clip)" />
      <circle cx="148" cy="106" r="2" fill="#CC1B1B" opacity="0.3" clipPath="url(#cult-clip)" />
      <text x="115" y="185" textAnchor="middle" fontFamily="Arial Black,Impact,sans-serif" fontSize="72" fontWeight="900" fill="white" clipPath="url(#cult-clip)" transform="rotate(-6 115 185)">55</text>
      <text x="115" y="185" textAnchor="middle" fontFamily="Arial Black,Impact,sans-serif" fontSize="72" fontWeight="900" fill="none" stroke="#CC1B1B" strokeWidth="2.5" clipPath="url(#cult-clip)" transform="rotate(-6 115 185)">55</text>
      <path d="M42,0 Q62,32 100,50 Q138,32 158,0" fill="none" stroke="#CC1B1B" strokeWidth="4" strokeLinecap="round" />
      <path d="M42,42 Q26,52 16,72" fill="none" stroke="#CC1B1B" strokeWidth="3" />
      <path d="M158,42 Q174,52 184,72" fill="none" stroke="#CC1B1B" strokeWidth="3" />
    </svg>
  );
}

const JERSEY_SVG: Record<string, React.FC> = {
  bold: BoldJersey,
  gradient: GradientJersey,
  program: ProgramJersey,
  culture: CultureJersey,
};

// ──────────────────────────────────────────────────────────────────────────────

export default function StylePage() {
  const router = useRouter();
  const { order_id } = useParams<{ order_id: string }>();

  const [selected, setSelected] = useState<"bold" | "gradient" | "program" | "culture" | "">("");
  const [jerseycut, setJerseycut] = useState("");
  const [sublimated, setSublimated] = useState<boolean | null>(null);
  const [sport, setSport] = useState("");
  const [sportLoaded, setSportLoaded] = useState(false);

  useEffect(() => {
    // Restore UI selections from localStorage
    const state = loadBriefState();
    if (state.designSystem) setSelected(state.designSystem as typeof selected);
    if (state.jerseycut) setJerseycut(state.jerseycut);
    if (state.sublimated !== null) setSublimated(state.sublimated);

    // Always fetch sport from server API (service-role bypass for RLS)
    fetch(`/api/orders/sport?orderId=${order_id}`)
      .then((r) => r.json())
      .then(({ sport: sportVal }: { sport?: string }) => {
        if (sportVal) {
          setSport(sportVal);
          saveBriefState({ sport: sportVal });
        }
        setSportLoaded(true);
      })
      .catch(() => setSportLoaded(true));
  }, [order_id]);

  const isTracksuit = sport.toLowerCase() === "tracksuits";

  const canContinue = selected && jerseycut && sublimated !== null;

  function handleContinue() {
    if (!canContinue) return;
    saveBriefState({
      designSystem: selected as "bold" | "gradient" | "program" | "culture",
      jerseycut: jerseycut as "mens" | "womens" | "youth" | "unisex",
      sublimated,
    });
    router.push(`/brief/${order_id}/reference`);
  }

  return (
    <BriefLayout
      currentStep={2}
      title="Choose Your Design System"
      subtitle="Each system has its own visual language. Pick the one that speaks to your team."
    >
      <div className="space-y-8">
        {/* Design system cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ visibility: sportLoaded ? "visible" : "hidden" }}>
          {SYSTEMS.map((system) => {
            const isSelected = selected === system.id;
            return (
              <button
                key={system.id}
                type="button"
                onClick={() => setSelected(system.id as typeof selected)}
                className={`text-left rounded-2xl border overflow-hidden transition-all duration-200 w-full
                  ${isSelected
                    ? "border-brand-primary shadow-[0_0_0_1px_#111111] bg-brand-surface"
                    : "border-brand-border bg-brand-surface hover:border-brand-muted"
                  }`}
              >
                {/* Jersey photo */}
                <div className="relative bg-white h-52 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      isTracksuit
                        ? `/reference-library/garments/tracksuits/${system.id}/front-reference.jpeg`
                        : `/jerseys/${system.id}.jpeg`
                    }
                    alt={system.name}
                    className="h-full w-full object-contain p-3"
                  />
                  {isSelected && (
                    <span className="absolute top-3 right-3 w-6 h-6 bg-brand-primary rounded-full flex items-center justify-center z-10">
                      <svg className="w-3.5 h-3.5 text-brand-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>

                {/* System info */}
                <div className="p-4 space-y-2 border-t border-brand-border">
                  <p className={`text-xs font-display uppercase tracking-widest ${isSelected ? "text-brand-primary" : "text-brand-muted"}`}>
                    {system.badge}
                  </p>
                  <p className="font-display font-bold uppercase tracking-wide text-brand-text text-base">
                    {system.name}
                  </p>
                  <p className="text-xs text-brand-muted font-barlow italic">
                    &ldquo;{system.tagline}&rdquo;
                  </p>
                  <ul className="space-y-1 pt-1">
                    {system.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-xs font-barlow text-brand-muted">
                        <span className={`mt-1.5 w-1 h-1 rounded-full flex-shrink-0 ${isSelected ? "bg-brand-primary" : "bg-brand-border"}`} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </button>
            );
          })}
        </div>

        {/* Jersey cut */}
        <div>
          <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-3">
            {isTracksuit ? "Garment Cut" : "Jersey Cut"}
          </label>
          <div className="flex flex-wrap gap-2">
            {CUTS.map((cut) => (
              <button
                key={cut.id}
                type="button"
                onClick={() => setJerseycut(cut.id)}
                className={`px-4 py-2 rounded-full text-sm font-barlow transition-all duration-150
                  ${jerseycut === cut.id
                    ? "bg-brand-primary text-brand-bg font-medium"
                    : "bg-brand-surface border border-brand-border text-brand-muted hover:border-brand-primary hover:text-brand-text"
                  }`}
              >
                {cut.label}
              </button>
            ))}
          </div>
        </div>

        {/* Construction type */}
        <div>
          <label className="block text-xs font-display uppercase tracking-wider text-brand-muted mb-3">
            Construction Type
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              { val: true, label: "Sublimated", desc: "Full-color dye into the fabric. Unlimited design complexity." },
              { val: false, label: "Tackle Twill", desc: "Stitched letters and numbers. Classic, durable look." },
            ].map(({ val, label, desc }) => (
              <button
                key={label}
                type="button"
                onClick={() => setSublimated(val)}
                className={`text-left p-4 rounded-xl border transition-all duration-200
                  ${sublimated === val
                    ? "border-brand-primary bg-brand-surface"
                    : "border-brand-border bg-brand-surface hover:border-brand-muted"
                  }`}
              >
                <p className={`font-display font-bold uppercase tracking-wide text-base ${sublimated === val ? "text-brand-primary" : "text-brand-text"}`}>
                  {label}
                </p>
                <p className="text-xs text-brand-muted font-barlow mt-1 leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push("/brief/choose")}
            className="px-6 py-3 rounded-lg font-display font-bold text-sm uppercase tracking-widest border border-brand-border text-brand-muted hover:text-brand-text hover:border-brand-muted transition-colors"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={!canContinue}
            className="flex-1 py-3 rounded-lg font-display font-bold text-base uppercase tracking-widest transition-all duration-200
              bg-brand-primary text-brand-bg hover:bg-brand-secondary
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continue to Details →
          </button>
        </div>
      </div>
    </BriefLayout>
  );
}

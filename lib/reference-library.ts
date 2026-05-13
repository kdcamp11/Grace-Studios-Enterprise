/**
 * Reference Library
 *
 * Resolves the correct reference images and visual-language description
 * for a given sport + design system combination.
 *
 * Physical layout on disk:
 *   public/reference-library/garments/{sport-slug}/{system}/
 *     spec-board-reference.png   ← board layout authority
 *     front-reference.png        ← front design language
 *     back-reference.png         ← back design language
 *     detail-collar-reference.png
 *     detail-sleeve-reference.png
 *
 * Fallback chain for each file:
 *   1. sport-specific folder
 *   2. basketball folder (most complete reference set)
 *   3. legacy public/reference/ folder
 *   4. null (file gracefully omitted from Claude call)
 */

import fs   from "fs";
import path from "path";

// ─── Sport → folder slug ──────────────────────────────────────────────────────

const SPORT_SLUGS: Record<string, string> = {
  "basketball":    "basketball",
  "football":      "football",
  "soccer":        "soccer",
  "baseball":      "baseball",
  "softball":      "softball",
  "volleyball":    "volleyball",
  "lacrosse":      "lacrosse",
  "hockey":        "hockey",
  "wrestling":     "wrestling",
  "track & field": "track-field",
  "track and field":"track-field",
  "other":         "basketball",
};

// ─── Sport → garment-type label used in prompts ───────────────────────────────

export const GARMENT_TYPE_LABELS: Record<string, string> = {
  "basketball":    "Basketball Jersey & Shorts Uniform",
  "football":      "Football Jersey & Pants Uniform",
  "soccer":        "Soccer Jersey & Shorts Kit",
  "baseball":      "Baseball Jersey & Pants Uniform",
  "softball":      "Softball Jersey & Pants Uniform",
  "volleyball":    "Volleyball Jersey & Shorts Uniform",
  "lacrosse":      "Lacrosse Jersey & Shorts Uniform",
  "hockey":        "Hockey Jersey & Pants Uniform",
  "wrestling":     "Wrestling Singlet",
  "track & field": "Track & Field Uniform",
  "track and field":"Track & Field Uniform",
  "other":         "Sports Uniform",
};

// ─── Design-system visual language (authoritative) ────────────────────────────

/**
 * Full prose description of each system's visual DNA.
 * Used in the Claude prompt as the authoritative design-system specification.
 */
export const SYSTEM_VISUAL_LANGUAGE: Record<string, string> = {
  bold: [
    "Aggressive diagonal paneling with hard geometric edge cuts",
    "Oversized, disproportionate lettering and number treatment that dominates the garment",
    "High-contrast color blocking between primary and secondary color — minimum 3 distinct zones",
    "Dynamic graphic energy lines cutting across chest and back at sharp angles",
    "Maximum on-court visual impact — the garment should command attention from 50 feet",
  ].join(". "),

  gradient: [
    "Smooth continuous color fade transitioning from primary to secondary across the garment body",
    "No hard panel lines — gradients replace traditional color blocking",
    "Premium motion-line graphics as subtle accents layered over the fade (thin, parallel, speed-line style)",
    "Clean structured silhouette — the gradient is the entire visual statement",
    "Contemporary elevated aesthetic — closer to an Adidas Parley collab than a school-issued kit",
  ].join(". "),

  culture: [
    "Fashion-forward streetwear-influenced graphic composition with intentional asymmetry",
    "Expressive layered typography — team name or wordmark treated as graphic art, not label",
    "Off-balance placement: primary graphic shifted left or right, not centered",
    "Geometric shape overlays that feel editorial, not athletic-generic",
    "Player-driven cultural identity — the garment should feel like it could appear in a streetwear lookbook",
  ].join(". "),

  program: [
    "Clean balanced collegiate structure with precise symmetrical layout",
    "Simple bold side panel or piping stripe as the primary design element",
    "Professional minimal aesthetic — collegiate or professional league tone",
    "Numbers and lettering are structured, proportional, and classically weighted",
    "Timeless — this garment should still look correct in 10 years and reproduce cleanly across all gear types",
  ].join(". "),
};

/**
 * Short (8–12 word) system descriptor for Replicate prompts.
 * Kept brief to avoid overwhelming the image model's attention.
 */
export const SYSTEM_PROMPT_SHORT: Record<string, string> = {
  bold:     "aggressive diagonal panels, high contrast color blocking, oversized graphics",
  gradient: "smooth color gradient fade, premium motion lines, clean structure",
  culture:  "streetwear aesthetic, asymmetric layered composition, expressive typography treatment",
  program:  "clean collegiate layout, balanced symmetric panels, structured minimal design",
};

// ─── Reference-file resolution ────────────────────────────────────────────────

export interface ReferenceFiles {
  /** URL path relative to app root (e.g. "/reference-library/garments/basketball/bold/spec-board-reference.png") */
  specBoard:    string | null;
  front:        string | null;
  back:         string | null;
  detailCollar: string | null;
  detailSleeve: string | null;
}

/** Returns the public URL path if the file exists on disk, otherwise null. */
function probe(relativePath: string): string | null {
  const abs = path.join(process.cwd(), "public", relativePath);
  return fs.existsSync(abs) ? `/${relativePath}` : null;
}

/**
 * Try a list of candidate file paths (relative to public/).
 * Returns the first one that exists, or null.
 */
function firstExisting(...candidates: string[]): string | null {
  for (const c of candidates) {
    const found = probe(c);
    if (found) return found;
  }
  return null;
}

/**
 * Resolves all reference files for a given sport + design system.
 * Falls back: sport-specific → basketball fallback → legacy path → null.
 */
export function resolveReferenceFiles(sport: string, designSystem: string): ReferenceFiles {
  const sportSlug = SPORT_SLUGS[sport.toLowerCase()] ?? "basketball";
  const system    = ["bold", "gradient", "culture", "program"].includes(designSystem.toLowerCase())
    ? designSystem.toLowerCase()
    : "bold";

  const primary  = `reference-library/garments/${sportSlug}/${system}`;
  const fallback = `reference-library/garments/basketball/${system}`;

  function resolve(filename: string, ...altFilenames: string[]): string | null {
    const names = [filename, ...altFilenames];
    // Try primary folder first, then basketball fallback, then legacy
    for (const base of [primary, fallback]) {
      for (const name of names) {
        const found = probe(`${base}/${name}`);
        if (found) return found;
      }
    }
    return null;
  }

  return {
    specBoard: (
      resolve("spec-board-reference.png", "spec-board-reference.jpeg", "spec-board-reference.jpg") ??
      // Legacy single-folder fallback
      firstExisting(
        "reference/Track Suits/spec-board-reference.jpeg",
        "reference/spec-board-reference.jpeg",
        "reference/spec-board-reference.jpg",
      )
    ),
    front:        resolve("front-reference.png", "front-reference.jpeg", "front-reference.jpg"),
    back:         resolve("back-reference.png",  "back-reference.jpeg",  "back-reference.jpg"),
    detailCollar: resolve(
      "detail-collar-reference.png", "detail-collar-reference.jpeg",
      "detail-logo-reference.png",   "detail-logo-reference.jpeg",
    ),
    detailSleeve: resolve(
      "detail-sleeve-reference.png", "detail-sleeve-reference.jpeg",
      "detail-panel-reference.png",  "detail-panel-reference.jpeg",
    ),
  };
}

/** Garment type label for a given sport (Title Case). */
export function getGarmentTypeLabel(sport: string): string {
  return GARMENT_TYPE_LABELS[sport.toLowerCase()] ?? GARMENT_TYPE_LABELS["other"];
}

/** Returns all non-null reference file URL paths in the canonical order
 *  (spec-board → front → back → collar → sleeve). */
export function getReferenceUrls(refs: ReferenceFiles, appBaseUrl: string): string[] {
  return [
    refs.specBoard,
    refs.front,
    refs.back,
    refs.detailCollar,
    refs.detailSleeve,
  ]
    .filter((p): p is string => p !== null)
    .map((p) => `${appBaseUrl.replace(/\/$/, "")}${p}`);
}

/**
 * Human-readable annotation for each reference position,
 * injected into the Claude prompt so the model knows what it's looking at.
 */
export function buildReferenceAnnotation(refs: ReferenceFiles): string {
  const lines: string[] = [];
  if (refs.specBoard)    lines.push("• Image 1: Grace Athletics SPEC-BOARD LAYOUT REFERENCE — this defines the exact presentation structure, hierarchy, and spacing your output must populate.");
  if (refs.front)        lines.push(`• Image ${lines.length + 1}: FRONT REFERENCE — authoritative visual example of this design system's front panel structure and graphic language. Follow this exactly.`);
  if (refs.back)         lines.push(`• Image ${lines.length + 1}: BACK REFERENCE — authoritative visual example of the back design language.`);
  if (refs.detailCollar) lines.push(`• Image ${lines.length + 1}: COLLAR/LOGO DETAIL REFERENCE — shows the collar treatment, neckline finish, and logo zone construction.`);
  if (refs.detailSleeve) lines.push(`• Image ${lines.length + 1}: SLEEVE/PANEL DETAIL REFERENCE — shows side panel construction, sleeve treatment, and secondary graphic detail.`);
  return lines.join("\n");
}

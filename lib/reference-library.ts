/**
 * Reference Library
 *
 * Resolves the correct reference images and visual-language description
 * for a given sport + design system combination.
 *
 * Primary spec-board authority (basketball):
 *   public/reference/Sport/Basketball/Basketball Spec Board/basketball spec board.jpeg
 *
 * New reference-library folder layout (drop files here per sport+system):
 *   public/reference-library/garments/{sport-slug}/{system}/
 *     spec-board-reference.png
 *     front-reference.png
 *     back-reference.png
 *     detail-collar-reference.png
 *     detail-sleeve-reference.png
 *
 * Fallback chain for the spec-board init image:
 *   1. reference-library/garments/{sport}/{system}/spec-board-reference.png
 *   2. reference-library/garments/basketball/{system}/spec-board-reference.png
 *   3. reference/Sport/Basketball/Basketball Spec Board/basketball spec board.jpeg
 *   4. reference/Track Suits/spec-board-reference.jpeg
 *   5. reference/spec-board-reference.jpeg
 *   6. null → text-to-image only (no init image)
 */

import fs   from "fs";
import path from "path";

// ─── Sport → folder slug ──────────────────────────────────────────────────────

const SPORT_SLUGS: Record<string, string> = {
  // ── Active sports ──────────────────────────────────────────────────────
  "basketball":  "basketball",
  "tracksuits":  "tracksuits",
  // ── Coming soon — uncomment as each sport launches ─────────────────────
  // "football":       "football",
  // "soccer":         "soccer",
  // "baseball":       "baseball",
  // "softball":       "softball",
  // "volleyball":     "volleyball",
  // "lacrosse":       "lacrosse",
  // "hockey":         "hockey",
  // "wrestling":      "wrestling",
  // "track & field":  "track-field",
  // "track and field":"track-field",
  // "other":          "basketball",
};

// ─── Sport → garment-type label used in prompts ───────────────────────────────

export const GARMENT_TYPE_LABELS: Record<string, string> = {
  // ── Active sports ──────────────────────────────────────────────────────
  "basketball":  "Basketball Jersey & Shorts Uniform",
  "tracksuits":  "Tracksuit Jacket & Pants",
  // ── Coming soon — uncomment as each sport launches ─────────────────────
  // "football":       "Football Jersey & Pants Uniform",
  // "soccer":         "Soccer Jersey & Shorts Kit",
  // "baseball":       "Baseball Jersey & Pants Uniform",
  // "softball":       "Softball Jersey & Pants Uniform",
  // "volleyball":     "Volleyball Jersey & Shorts Uniform",
  // "lacrosse":       "Lacrosse Jersey & Shorts Uniform",
  // "hockey":         "Hockey Jersey & Pants Uniform",
  // "wrestling":      "Wrestling Singlet",
  // "track & field":  "Track & Field Uniform",
  // "track and field":"Track & Field Uniform",
  // "other":          "Sports Uniform",
};

// ─── Design-system visual language ────────────────────────────────────────────

/**
 * Full authoritative prose spec for each design system.
 * Used in Claude prompt. Do not shorten — every sentence shapes the output.
 */
export const SYSTEM_VISUAL_LANGUAGE: Record<string, string> = {
  bold: [
    "Aggressive diagonal paneling with hard geometric edge cuts",
    "Oversized, disproportionate lettering and number treatment that dominates the garment",
    "High-contrast color blocking between primary and secondary — minimum 3 distinct zones",
    "Dynamic graphic energy lines cutting across chest and back at sharp angles",
    "Maximum on-court visual impact — the garment commands attention from 50 feet",
  ].join(". "),

  gradient: [
    "Smooth continuous color fade transitioning from primary to secondary across the garment body",
    "No hard panel lines — gradients replace traditional color blocking",
    "Premium motion-line graphics as subtle accents layered over the fade",
    "Clean structured silhouette — the gradient is the entire visual statement",
    "Contemporary elevated aesthetic — premium and modern athletic",
  ].join(". "),

  culture: [
    "Fashion-forward streetwear-influenced graphic composition with intentional asymmetry",
    "Expressive layered typography — team name treated as graphic art, not a label",
    "Off-balance placement: primary graphic shifted, not centered",
    "Geometric shape overlays that feel editorial and fashion-forward",
    "Player-driven cultural identity with a streetwear edge",
  ].join(". "),

  program: [
    "Clean balanced collegiate structure with precise symmetrical layout",
    "Simple bold side panel or piping stripe as the primary design element",
    "Professional minimal aesthetic — collegiate or professional league tone",
    "Numbers and lettering are structured, proportional, and classically weighted",
    "Timeless — reproduces cleanly across all gear types",
  ].join(". "),

  freestyle: [
    "CLIENT VISION DRIVES ALL DESIGN DECISIONS — this is not a pre-prescribed design system",
    "Interpret and execute the client's vision notes exactly as described: their panel geometry, graphic placement, and overall aesthetic are the primary directive",
    "Apply Grace Studios' construction standards and silhouette philosophy (stand collar, wide-leg pant, nylon shell) — but let the client's stated vision guide every visual decision",
    "Do not impose bold diagonal panels, gradients, or collegiate symmetry unless the client explicitly asked for them",
    "If the client described a specific vibe, reference, or element — build the design around it, not around a default system template",
  ].join(". "),
};

/**
 * Short (8–12 word) system phrase for the Replicate prompt.
 */
export const SYSTEM_PROMPT_SHORT: Record<string, string> = {
  bold:      "aggressive diagonal panels, high contrast color blocking, oversized graphics",
  gradient:  "smooth color gradient fade, premium motion lines, clean structure",
  culture:   "streetwear aesthetic, asymmetric layered composition, fashion-forward",
  program:   "clean collegiate layout, balanced symmetric panels, minimal classic design",
  freestyle: "client vision directed, open design brief, execute stated vision within Grace Studios silhouette",
};

// ─── Reference-file resolution ────────────────────────────────────────────────

export interface ReferenceFiles {
  /** The PRIMARY spec-board init image — used as flux-dev img2img reference */
  specBoard:    string | null;  // public URL path  e.g. "/reference/Sport/…"
  front:        string | null;
  back:         string | null;
  detailCollar: string | null;
  detailSleeve: string | null;
}

/** Returns the leading-slash URL path if the file exists on disk, otherwise null. */
function probe(relativePath: string): string | null {
  const abs = path.join(process.cwd(), "public", relativePath);
  return fs.existsSync(abs) ? `/${relativePath}` : null;
}

function firstExisting(...candidates: string[]): string | null {
  for (const c of candidates) {
    const found = probe(c);
    if (found) return found;
  }
  return null;
}

/**
 * Resolves the spec-board reference and supporting view images.
 * Falls back gracefully — every field can be null.
 */
export function resolveReferenceFiles(sport: string, designSystem: string): ReferenceFiles {
  const sportSlug = SPORT_SLUGS[sport.toLowerCase()] ?? "basketball";
  const system    = ["bold", "gradient", "culture", "program", "freestyle"].includes(designSystem.toLowerCase())
    ? designSystem.toLowerCase()
    : "bold";

  const libPrimary  = `reference-library/garments/${sportSlug}/${system}`;
  const libFallback = `reference-library/garments/basketball/${system}`;

  function resolve(filename: string, ...alts: string[]): string | null {
    const names = [filename, ...alts];
    for (const base of [libPrimary, libFallback]) {
      for (const n of names) {
        const f = probe(`${base}/${n}`);
        if (f) return f;
      }
    }
    return null;
  }

  // The authoritative basketball spec-board is the primary source of truth
  const specBoard =
    resolve("spec-board-reference.png", "spec-board-reference.jpeg", "spec-board-reference.jpg") ??
    // Sport-specific legacy paths
    firstExisting(
      "reference/Sport/Basketball/Basketball Spec Board/basketball spec board.jpeg",
      "reference/Sport/Basketball/spec-board-reference.jpeg",
    ) ??
    // Generic legacy fallbacks
    firstExisting(
      "reference/Track Suits/spec-board-reference.jpeg",
      "reference/spec-board-reference.jpeg",
    );

  return {
    specBoard,
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

/**
 * Converts a disk-relative path (with optional spaces) to a full public URL.
 * Each path segment is individually percent-encoded so spaces become %20.
 */
export function toPublicUrl(appBase: string, filePath: string): string {
  const encoded = filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${appBase.replace(/\/$/, "")}${encoded}`;
}

/**
 * Returns all non-null reference URLs in canonical order:
 * spec-board → front → back → collar → sleeve.
 */
export function getReferenceUrls(refs: ReferenceFiles, appBaseUrl: string): string[] {
  return [refs.specBoard, refs.front, refs.back, refs.detailCollar, refs.detailSleeve]
    .filter((p): p is string => p !== null)
    .map((p) => toPublicUrl(appBaseUrl, p));
}

/**
 * Per-image annotation injected into the Claude prompt
 * so the model knows what role each reference image plays.
 */
export function buildReferenceAnnotation(refs: ReferenceFiles): string {
  let idx = 1;
  const lines: string[] = [];

  if (refs.specBoard) {
    lines.push(`• Image ${idx++}: SPEC-BOARD LAYOUT AUTHORITY — the basketball uniform specification board. This defines the EXACT layout your output must populate: left column (brand, colorway, material, features, logo), center 2×2 garment grid (jersey front/back top row, shorts front/back bottom row), right column (detail callout boxes: collar, logo, side panel, vent, waistband). Follow this structure exactly.`);
  }
  if (refs.front) {
    lines.push(`• Image ${idx++}: FRONT DESIGN REFERENCE — authoritative example of this design system's front visual language. Follow panel structure and graphic placement from this image.`);
  }
  if (refs.back) {
    lines.push(`• Image ${idx++}: BACK DESIGN REFERENCE — authoritative back design language example.`);
  }
  if (refs.detailCollar) {
    lines.push(`• Image ${idx++}: COLLAR/LOGO DETAIL REFERENCE — collar construction, neckline finish, and logo zone.`);
  }
  if (refs.detailSleeve) {
    lines.push(`• Image ${idx++}: SLEEVE/PANEL DETAIL REFERENCE — side panel construction, sleeve, and secondary graphic detail.`);
  }

  return lines.join("\n");
}

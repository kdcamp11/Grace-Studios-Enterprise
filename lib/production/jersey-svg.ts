/**
 * lib/production/jersey-svg.ts
 *
 * Generates a production-ready SVG flat template from jersey builder zone colors.
 * Output is a scalable vector file suitable for sublimation printing, structured
 * with labeled layers and CMYK color references.
 *
 * Document size: 760 × 1700 units (1 unit = 1mm → equivalent to A2+ portrait)
 * Layers: jersey front, shorts front, color legend, header/footer
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ZoneColors {
  jerseyTop:          string;   // main body
  collar:             string;   // neck binding
  jerseyShorts:       string;   // shorts body
  jerseySidePanels:   string;   // jersey side panel inserts
  jerseyLowerPanels:  string;   // jersey lower side panel inserts
  sleevePanels:       string;   // armhole binding
  shortSidePanels:    string;   // shorts side panel inserts
}

export interface ProductionFileInput {
  orderNumber:  string;
  teamName:     string;
  sport:        string;
  contactName?: string;
  city?:        string;
  colors:       ZoneColors;
  logoUrl?:     string;   // public URL — embedded as xlink:href image
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour utilities
// ─────────────────────────────────────────────────────────────────────────────

function hexToCmyk(hex: string): { c: number; m: number; y: number; k: number } {
  const h = hex.replace("#", "").padEnd(6, "0");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - r - k) / (1 - k)) * 100),
    m: Math.round(((1 - g - k) / (1 - k)) * 100),
    y: Math.round(((1 - b - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

function cmykLabel(hex: string): string {
  const { c, m, y, k } = hexToCmyk(hex);
  return `C${c} M${m} Y${y} K${k}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Path definitions (1 unit ≈ 1mm, adult-medium proportions)
//
// Jersey bounding box:  x 158–602, y 140–830  (444 × 690 units)
// Shorts bounding box:  x 140–620, y 930–1350 (480 × 420 units)
// Document center:      x = 380
// ─────────────────────────────────────────────────────────────────────────────

// ── Jersey front silhouette ─────────────────────────────────────────────────
// Traced clockwise: left-shoulder → neck curve → right-shoulder →
//   right-armhole-curve → right-side-seam → hem → left-side-seam →
//   left-armhole-curve → close
const JERSEY_OUTLINE =
  "M 180,140 " +
  "L 305,140 " +
  "Q 380,210 455,140 " +           // scoop neck (70-unit depth)
  "L 580,140 " +
  "C 610,140 638,195 640,288 " +   // right armhole upper
  "C 642,372 626,418 602,425 " +   // right armhole lower → underarm
  "L 578,830 " +                   // right side seam → hem
  "L 175,830 " +                   // hem
  "L 158,425 " +                   // left side seam → underarm
  "C 134,418 118,372 120,288 " +   // left armhole lower
  "C 122,195 150,140 180,140 Z";   // left armhole upper → close

// ── Main body (rendered first — everything else paints on top) ──────────────
const JERSEY_TOP_PATH = JERSEY_OUTLINE;

// ── Left side panel (strip along left seam, underarm → hem) ────────────────
const LEFT_SIDE_PANEL =
  "M 158,425 L 238,425 L 250,830 L 175,830 Z";

// ── Right side panel (mirror around x=380) ──────────────────────────────────
const RIGHT_SIDE_PANEL =
  "M 602,425 L 522,425 L 510,830 L 578,830 Z";    // mirror: 760-x

// ── Left lower panel (inset shape — lower third of body, left side) ─────────
const LEFT_LOWER_PANEL =
  "M 238,595 L 250,830 L 380,830 L 380,615 Z";

// ── Right lower panel ────────────────────────────────────────────────────────
const RIGHT_LOWER_PANEL =
  "M 522,595 L 510,830 L 380,830 L 380,615 Z";

// ── Collar binding (strip around neck opening, ~18 units wide) ──────────────
const COLLAR_PATH =
  "M 293,123 Q 380,217 467,123 L 455,140 Q 380,210 305,140 Z";

// ── Left armhole binding (~17 units wide, follows armhole curve) ─────────────
const LEFT_ARMHOLE =
  "M 180,140 " +
  "C 150,140 122,195 120,288 " +
  "C 118,372 134,418 158,425 " +
  "L 164,422 " +
  "C 142,414 133,370 135,289 " +
  "C 137,205 162,156 194,150 Z";

// ── Right armhole binding ─────────────────────────────────────────────────────
const RIGHT_ARMHOLE =
  "M 580,140 " +
  "C 610,140 638,195 640,288 " +
  "C 642,372 626,418 602,425 " +
  "L 596,422 " +
  "C 618,414 627,370 625,289 " +
  "C 623,205 598,156 566,150 Z";

// ── Shorts ────────────────────────────────────────────────────────────────────
const SY = 930;   // shorts top y
const SB = 1350;  // shorts bottom y
const SL = 140;   // shorts left edge
const SR = 620;   // shorts right edge

const SHORTS_MAIN =
  `M ${SL},${SY} L ${SR},${SY} L ${SR - 10},${SB} L ${SL + 10},${SB} Z`;

const SHORTS_LEFT_PANEL =
  `M ${SL},${SY} L ${SL + 80},${SY} L ${SL + 85},${SB} L ${SL + 10},${SB} Z`;

const SHORTS_RIGHT_PANEL =
  `M ${SR},${SY} L ${SR - 80},${SY} L ${SR - 85},${SB} L ${SR - 10},${SB} Z`;

const SHORTS_WAISTBAND =
  `M ${SL},${SY} L ${SR},${SY} L ${SR},${SY + 42} L ${SL},${SY + 42} Z`;

// ─────────────────────────────────────────────────────────────────────────────
// SVG helper fragments
// ─────────────────────────────────────────────────────────────────────────────

function zoneTag(text: string, x: number, y: number): string {
  return (
    `<text x="${x}" y="${y}" ` +
    `font-family="Helvetica Neue, Helvetica, Arial, sans-serif" ` +
    `font-size="9" font-weight="bold" letter-spacing="1" ` +
    `fill="rgba(255,255,255,0.82)" text-anchor="middle">${text}</text>`
  );
}

function swatch(
  label: string,
  hex: string,
  x: number,
  y: number,
): string {
  const safe = hex.startsWith("#") ? hex : `#${hex}`;
  const cmyk = cmykLabel(safe);
  return (
    `<rect x="${x}" y="${y}" width="80" height="22" fill="${safe}" rx="3"/>` +
    `<rect x="${x}" y="${y}" width="80" height="22" fill="none" stroke="#cccccc" stroke-width="0.5" rx="3"/>` +
    `<text x="${x + 88}" y="${y + 9}" ` +
    `font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="8.5" font-weight="bold" fill="#222222">${label}</text>` +
    `<text x="${x + 88}" y="${y + 20}" ` +
    `font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="8" fill="#666666" font-family="monospace">${safe.toUpperCase()} · ${cmyk}</text>`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function generateJerseyProductionSVG(input: ProductionFileInput): string {
  const { colors, orderNumber, teamName, sport, contactName, city, logoUrl } = input;
  const c = colors;
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // ── Color legend swatches ────────────────────────────────────────────────
  const LEGEND_Y = 1415;
  const COL1 = 55;
  const COL2 = 395;

  const swatches = [
    swatch("Jersey Top (Main Body)",           c.jerseyTop,         COL1, LEGEND_Y),
    swatch("Jersey Side Panels",               c.jerseySidePanels,  COL1, LEGEND_Y + 36),
    swatch("Jersey Lower Side Panels",         c.jerseyLowerPanels, COL1, LEGEND_Y + 72),
    swatch("Collar Binding",                   c.collar,            COL1, LEGEND_Y + 108),
    swatch("Armhole Binding (Sleeve Panels)",  c.sleevePanels,      COL2, LEGEND_Y),
    swatch("Shorts Body",                      c.jerseyShorts,      COL2, LEGEND_Y + 36),
    swatch("Shorts Side Panels",               c.shortSidePanels,   COL2, LEGEND_Y + 72),
  ].join("\n    ");

  // ── Logo element (optional) ──────────────────────────────────────────────
  const logoEl = logoUrl
    ? `<image href="${logoUrl}" x="310" y="480" width="140" height="140" preserveAspectRatio="xMidYMid meet" opacity="0.85"/>`
    : `<!-- No logo uploaded -->`;

  // ── Compile ──────────────────────────────────────────────────────────────
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ═══════════════════════════════════════════════════════════════════════
     GRACE STUDIOS — AUTO-GENERATED PRODUCTION FILE
     Generated on client approval. For sublimation print production.
     Document unit: 1 unit = 1 mm  |  Adult Medium proportions
     ═══════════════════════════════════════════════════════════════════════ -->
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 760 1700"
  width="760mm"
  height="1700mm"
>
  <!-- White background -->
  <rect width="760" height="1700" fill="#ffffff"/>

  <!-- ── Trim / bleed marks ────────────────────────────────────────── -->
  <g id="trim-marks" fill="none" stroke="#000000" stroke-width="0.4">
    <line x1="0" y1="28" x2="18" y2="28"/><line x1="28" y1="0" x2="28" y2="18"/>
    <line x1="760" y1="28" x2="742" y2="28"/><line x1="732" y1="0" x2="732" y2="18"/>
    <line x1="0" y1="1672" x2="18" y2="1672"/><line x1="28" y1="1700" x2="28" y2="1682"/>
    <line x1="760" y1="1672" x2="742" y2="1672"/><line x1="732" y1="1700" x2="732" y2="1682"/>
  </g>

  <!-- ── Header ───────────────────────────────────────────────────── -->
  <g id="header">
    <rect x="28" y="28" width="704" height="84" fill="#0a0a0a" rx="4"/>
    <text x="48" y="64"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="22" font-weight="bold" letter-spacing="4" fill="#C9A84C">
      GRACE STUDIOS
    </text>
    <text x="48" y="82"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="8.5" letter-spacing="2.5" fill="#888888">
      PRODUCTION FILE — SUBLIMATION PRINT TEMPLATE
    </text>
    <text x="722" y="57"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="10" font-weight="bold" fill="#f0f0f0" text-anchor="end">
      ORDER: ${orderNumber}
    </text>
    <text x="722" y="72"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="9" fill="#aaaaaa" text-anchor="end">
      ${teamName}${city ? ` · ${city}` : ""}
    </text>
    <text x="722" y="87"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="9" fill="#aaaaaa" text-anchor="end">
      ${sport.charAt(0).toUpperCase() + sport.slice(1)} · Generated ${date}
    </text>
  </g>

  <!-- ══════════════════════════════════════════════════════════════
       JERSEY — FRONT PANEL
       ══════════════════════════════════════════════════════════════ -->
  <g id="jersey-front">

    <text x="380" y="133"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="9" letter-spacing="2.5" fill="#aaaaaa" text-anchor="middle">
      JERSEY · FRONT PANEL · ADULT MEDIUM
    </text>

    <!-- Zone 1 — Main body (base layer) -->
    <path id="zone-jersey-top"
      fill="${c.jerseyTop}"
      stroke="#dddddd" stroke-width="0.5"
      d="${JERSEY_TOP_PATH}"/>

    <!-- Zone 2 — Side panel inserts -->
    <path id="zone-side-panel-left"  fill="${c.jerseySidePanels}" d="${LEFT_SIDE_PANEL}"/>
    <path id="zone-side-panel-right" fill="${c.jerseySidePanels}" d="${RIGHT_SIDE_PANEL}"/>

    <!-- Zone 3 — Lower side panel inserts -->
    <path id="zone-lower-left"  fill="${c.jerseyLowerPanels}" d="${LEFT_LOWER_PANEL}"/>
    <path id="zone-lower-right" fill="${c.jerseyLowerPanels}" d="${RIGHT_LOWER_PANEL}"/>

    <!-- Zone 4 — Collar binding -->
    <path id="zone-collar" fill="${c.collar}" d="${COLLAR_PATH}"/>

    <!-- Zone 5 — Armhole binding (sleeve panels) -->
    <path id="zone-armhole-left"  fill="${c.sleevePanels}" d="${LEFT_ARMHOLE}"/>
    <path id="zone-armhole-right" fill="${c.sleevePanels}" d="${RIGHT_ARMHOLE}"/>

    <!-- Clean silhouette outline on top -->
    <path fill="none" stroke="#1a1a1a" stroke-width="1.2" d="${JERSEY_OUTLINE}"/>

    <!-- Internal seam lines -->
    <line x1="238" y1="425" x2="250" y2="830" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>
    <line x1="522" y1="425" x2="510" y2="830" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>
    <line x1="238" y1="595" x2="380" y2="615" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>
    <line x1="522" y1="595" x2="380" y2="615" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>

    <!-- Logo placeholder -->
    ${logoEl}

    <!-- Zone labels -->
    ${zoneTag("MAIN BODY", 380, 490)}
    ${zoneTag("SIDE", 196, 660)}
    ${zoneTag("SIDE", 564, 660)}
    ${zoneTag("LOWER", 296, 770)}
    ${zoneTag("LOWER", 466, 770)}
    ${zoneTag("COLLAR", 380, 152)}
    ${zoneTag("ARMHOLE", 152, 295)}
    ${zoneTag("ARMHOLE", 610, 295)}

    <!-- Dimension annotations -->
    <g fill="none" stroke="#aaaaaa" stroke-width="0.5">
      <!-- Width arrow -->
      <line x1="140" y1="845" x2="620" y2="845"/>
      <line x1="140" y1="840" x2="140" y2="850"/>
      <line x1="620" y1="840" x2="620" y2="850"/>
    </g>
    <text x="380" y="858"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="8" fill="#aaaaaa" text-anchor="middle">
      ← 480 mm (chest width, size M) →
    </text>

  </g>

  <!-- ══════════════════════════════════════════════════════════════
       SHORTS — FRONT PANEL
       ══════════════════════════════════════════════════════════════ -->
  <g id="shorts-front">

    <text x="380" y="915"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="9" letter-spacing="2.5" fill="#aaaaaa" text-anchor="middle">
      SHORTS · FRONT PANEL · ADULT MEDIUM
    </text>

    <!-- Zone 6 — Shorts main body (base) -->
    <path id="zone-shorts-main"
      fill="${c.jerseyShorts}"
      stroke="#dddddd" stroke-width="0.5"
      d="${SHORTS_MAIN}"/>

    <!-- Zone 7 — Shorts side panels -->
    <path id="zone-shorts-side-left"  fill="${c.shortSidePanels}" d="${SHORTS_LEFT_PANEL}"/>
    <path id="zone-shorts-side-right" fill="${c.shortSidePanels}" d="${SHORTS_RIGHT_PANEL}"/>

    <!-- Waistband (same color as shorts, darker border) -->
    <path fill="${c.jerseyShorts}" stroke="#33333355" stroke-width="1" d="${SHORTS_WAISTBAND}"/>

    <!-- Shorts outline on top -->
    <path fill="none" stroke="#1a1a1a" stroke-width="1.2" d="${SHORTS_MAIN}"/>
    <line x1="${SL}" y1="${SY + 42}" x2="${SR}" y2="${SY + 42}" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>

    <!-- Seam lines -->
    <line x1="${SL + 80}" y1="${SY}" x2="${SL + 85}" y2="${SB}" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>
    <line x1="${SR - 80}" y1="${SY}" x2="${SR - 85}" y2="${SB}" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>

    <!-- Zone labels -->
    ${zoneTag("WAISTBAND", 380, SY + 26)}
    ${zoneTag("SHORTS BODY", 380, 1150)}
    ${zoneTag("SIDE", 176, 1150)}
    ${zoneTag("SIDE", 582, 1150)}

    <!-- Dimension annotation -->
    <g fill="none" stroke="#aaaaaa" stroke-width="0.5">
      <line x1="140" y1="1365" x2="620" y2="1365"/>
      <line x1="140" y1="1360" x2="140" y2="1370"/>
      <line x1="620" y1="1360" x2="620" y2="1370"/>
    </g>
    <text x="380" y="1377"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="8" fill="#aaaaaa" text-anchor="middle">
      ← 480 mm (waist width, size M) →
    </text>

  </g>

  <!-- ══════════════════════════════════════════════════════════════
       COLOR SPECIFICATIONS
       ══════════════════════════════════════════════════════════════ -->
  <g id="color-legend">
    <line x1="28" y1="${LEGEND_Y - 22}" x2="732" y2="${LEGEND_Y - 22}"
      stroke="#eeeeee" stroke-width="0.8"/>
    <text x="28" y="${LEGEND_Y - 7}"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="8.5" letter-spacing="2.5" fill="#aaaaaa">
      COLOR SPECIFICATIONS
    </text>
    ${swatches}
  </g>

  <!-- ── Footer ────────────────────────────────────────────────────── -->
  <g id="footer">
    <line x1="28" y1="1662" x2="732" y2="1662" stroke="#eeeeee" stroke-width="0.5"/>
    <text x="28" y="1680"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="7.5" fill="#bbbbbb">
      Grace Studios · Production Template · ${orderNumber} · Auto-generated on client approval · Confidential — not for distribution
    </text>
    <text x="732" y="1680"
      font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-size="7.5" fill="#bbbbbb" text-anchor="end">
      ${contactName ?? ""}
    </text>
  </g>

</svg>`;
}

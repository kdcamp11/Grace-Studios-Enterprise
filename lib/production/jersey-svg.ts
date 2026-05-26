/**
 * lib/production/jersey-svg.ts
 *
 * Generates a production-ready SVG artwork file on client approval.
 * Includes: flat garment templates with zone colors, team logo(s),
 * player name & number roster, color specs (HEX + CMYK), design notes.
 *
 * Document: 760 × 2100 units (1 unit ≈ 1 mm)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZoneColors {
  jerseyTop:          string;
  collar:             string;
  jerseyShorts:       string;
  jerseySidePanels:   string;
  jerseyLowerPanels:  string;
  sleevePanels:       string;
  shortSidePanels:    string;
}

export interface RosterEntry {
  name:   string;
  number: string;
  size?:  string;
  cut?:   string;
}

export interface ProductionFileInput {
  orderNumber:     string;
  teamName:        string;
  sport:           string;
  contactName?:    string;
  city?:           string;
  colors:          ZoneColors;
  primaryColors?:  string;    // free-text from brief
  secondaryColors?: string;
  accentColor?:    string;
  logoUrls?:       string[];  // all uploaded logos
  logoPlacement?:  string;
  designSystem?:   string;
  visionPrompt?:   string;
  roster?:         RosterEntry[];
  conceptImageUrl?: string;   // approved AI concept image
}

// ─── Color utilities ──────────────────────────────────────────────────────────

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

// ─── Garment path definitions (1 unit ≈ 1 mm) ────────────────────────────────

const JERSEY_OUTLINE =
  "M 180,140 L 305,140 Q 380,210 455,140 L 580,140 " +
  "C 610,140 638,195 640,288 C 642,372 626,418 602,425 " +
  "L 578,830 L 175,830 L 158,425 " +
  "C 134,418 118,372 120,288 C 122,195 150,140 180,140 Z";

const JERSEY_TOP_PATH  = JERSEY_OUTLINE;
const LEFT_SIDE_PANEL  = "M 158,425 L 238,425 L 250,830 L 175,830 Z";
const RIGHT_SIDE_PANEL = "M 602,425 L 522,425 L 510,830 L 578,830 Z";
const LEFT_LOWER_PANEL = "M 238,595 L 250,830 L 380,830 L 380,615 Z";
const RIGHT_LOWER_PANEL= "M 522,595 L 510,830 L 380,830 L 380,615 Z";
const COLLAR_PATH      = "M 293,123 Q 380,217 467,123 L 455,140 Q 380,210 305,140 Z";
const LEFT_ARMHOLE     = "M 180,140 C 150,140 122,195 120,288 C 118,372 134,418 158,425 L 164,422 C 142,414 133,370 135,289 C 137,205 162,156 194,150 Z";
const RIGHT_ARMHOLE    = "M 580,140 C 610,140 638,195 640,288 C 642,372 626,418 602,425 L 596,422 C 618,414 627,370 625,289 C 623,205 598,156 566,150 Z";

const SY = 930; const SB = 1350; const SL = 140; const SR = 620;
const SHORTS_MAIN         = `M ${SL},${SY} L ${SR},${SY} L ${SR-10},${SB} L ${SL+10},${SB} Z`;
const SHORTS_LEFT_PANEL   = `M ${SL},${SY} L ${SL+80},${SY} L ${SL+85},${SB} L ${SL+10},${SB} Z`;
const SHORTS_RIGHT_PANEL  = `M ${SR},${SY} L ${SR-80},${SY} L ${SR-85},${SB} L ${SR-10},${SB} Z`;
const SHORTS_WAISTBAND    = `M ${SL},${SY} L ${SR},${SY} L ${SR},${SY+42} L ${SL},${SY+42} Z`;

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function zoneTag(text: string, x: number, y: number): string {
  return `<text x="${x}" y="${y}" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" font-weight="bold" letter-spacing="1" fill="rgba(255,255,255,0.75)" text-anchor="middle">${text}</text>`;
}

function swatch(label: string, hex: string, x: number, y: number): string {
  const safe = hex.startsWith("#") ? hex : `#${hex}`;
  const cmyk = cmykLabel(safe);
  return (
    `<rect x="${x}" y="${y}" width="80" height="22" fill="${safe}" rx="3"/>` +
    `<rect x="${x}" y="${y}" width="80" height="22" fill="none" stroke="#cccccc" stroke-width="0.5" rx="3"/>` +
    `<text x="${x+88}" y="${y+9}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" font-weight="bold" fill="#222">${label}</text>` +
    `<text x="${x+88}" y="${y+20}" font-family="monospace,Courier,sans-serif" font-size="8" fill="#666">${safe.toUpperCase()} · ${cmyk}</text>`
  );
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateJerseyProductionSVG(input: ProductionFileInput): string {
  const {
    colors: c, orderNumber, teamName, sport, contactName, city,
    logoUrls, logoPlacement, designSystem, visionPrompt,
    primaryColors, secondaryColors, accentColor,
    roster, conceptImageUrl,
  } = input;

  const date   = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const safeTeam = esc(teamName);
  const safeOrder = esc(orderNumber);

  // ── Logo placement on jersey ─────────────────────────────────────────────
  const primaryLogo = logoUrls?.[0] ?? null;
  const logoEl = primaryLogo
    ? `<image href="${primaryLogo}" x="310" y="480" width="140" height="140" preserveAspectRatio="xMidYMid meet" opacity="0.9"/>`
    : `<!-- No logo uploaded -->`;

  // Additional logos (sponsor, secondary)
  const extraLogos = (logoUrls ?? []).slice(1).map((url, i) => {
    const x = 55 + i * 120;
    return `<image href="${url}" x="${x}" y="500" width="80" height="80" preserveAspectRatio="xMidYMid meet" opacity="0.8"/>`;
  }).join("\n    ");

  // ── Color legend swatches ────────────────────────────────────────────────
  const LEGEND_Y = 1415;
  const COL1 = 55; const COL2 = 395;
  const swatches = [
    swatch("Jersey Main Body",           c.jerseyTop,         COL1, LEGEND_Y),
    swatch("Jersey Side Panels",         c.jerseySidePanels,  COL1, LEGEND_Y + 36),
    swatch("Jersey Lower Panels",        c.jerseyLowerPanels, COL1, LEGEND_Y + 72),
    swatch("Collar Binding",             c.collar,            COL1, LEGEND_Y + 108),
    swatch("Armhole / Sleeve Panels",    c.sleevePanels,      COL2, LEGEND_Y),
    swatch("Shorts Main Body",           c.jerseyShorts,      COL2, LEGEND_Y + 36),
    swatch("Shorts Side Panels",         c.shortSidePanels,   COL2, LEGEND_Y + 72),
  ].join("\n    ");

  // ── Roster section ───────────────────────────────────────────────────────
  const ROSTER_Y = 1600;
  let rosterSection = "";
  if (roster && roster.length > 0) {
    const rowH     = 22;
    const col1     = 55;
    const colName  = 105;
    const colNum   = 340;
    const colSize  = 430;
    const colCut   = 530;

    // Header
    const headerRow =
      `<rect x="28" y="${ROSTER_Y}" width="704" height="26" fill="#0a0a0a" rx="3"/>` +
      `<text x="${col1}" y="${ROSTER_Y + 17}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" font-weight="bold" letter-spacing="2" fill="#C9A84C">#</text>` +
      `<text x="${colName}" y="${ROSTER_Y + 17}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" font-weight="bold" letter-spacing="2" fill="#C9A84C">PLAYER NAME</text>` +
      `<text x="${colNum}" y="${ROSTER_Y + 17}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" font-weight="bold" letter-spacing="2" fill="#C9A84C">NUMBER</text>` +
      `<text x="${colSize}" y="${ROSTER_Y + 17}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" font-weight="bold" letter-spacing="2" fill="#C9A84C">SIZE</text>` +
      `<text x="${colCut}" y="${ROSTER_Y + 17}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" font-weight="bold" letter-spacing="2" fill="#C9A84C">CUT</text>`;

    const rows = roster.map((p, i) => {
      const ry     = ROSTER_Y + 26 + i * rowH;
      const bg     = i % 2 === 0 ? "#f9f9f9" : "#ffffff";
      return (
        `<rect x="28" y="${ry}" width="704" height="${rowH}" fill="${bg}"/>` +
        `<text x="${col1}" y="${ry + 14}" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" fill="#888">${i + 1}</text>` +
        `<text x="${colName}" y="${ry + 14}" font-family="Helvetica Neue,Arial,sans-serif" font-size="10" font-weight="bold" fill="#111">${esc(p.name)}</text>` +
        `<text x="${colNum}" y="${ry + 14}" font-family="Helvetica Neue,Arial,sans-serif" font-size="11" font-weight="bold" fill="#0a0a0a">${esc(p.number)}</text>` +
        `<text x="${colSize}" y="${ry + 14}" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" fill="#444">${esc(p.size ?? "—")}</text>` +
        `<text x="${colCut}" y="${ry + 14}" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" fill="#444" text-transform="capitalize">${esc(p.cut ?? "—")}</text>`
      );
    }).join("\n    ");

    // Outline border around entire table
    const tableH = 26 + roster.length * rowH;
    const tableBorder = `<rect x="28" y="${ROSTER_Y}" width="704" height="${tableH}" fill="none" stroke="#dddddd" stroke-width="0.7" rx="3"/>`;

    rosterSection =
      `<!-- ════ PLAYER ROSTER ════ -->` +
      `<line x1="28" y1="${ROSTER_Y - 22}" x2="732" y2="${ROSTER_Y - 22}" stroke="#eeeeee" stroke-width="0.8"/>` +
      `<text x="28" y="${ROSTER_Y - 7}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" letter-spacing="2.5" fill="#aaaaaa">PLAYER ROSTER — ${roster.length} PLAYERS</text>` +
      headerRow + rows + tableBorder;
  }

  // ── Approved concept image (right side panel) ────────────────────────────
  const conceptEl = conceptImageUrl
    ? `<image href="${conceptImageUrl}" x="28" y="930" width="100" height="100" preserveAspectRatio="xMidYMid meet" opacity="0.9"/>` +
      `<text x="78" y="1038" font-family="Helvetica Neue,Arial,sans-serif" font-size="7" fill="#aaa" text-anchor="middle">APPROVED CONCEPT</text>`
    : "";

  // ── Design notes panel ───────────────────────────────────────────────────
  const notesLines: string[] = [];
  if (designSystem)   notesLines.push(`Design System: ${designSystem.toUpperCase()}`);
  if (primaryColors)  notesLines.push(`Primary Colors: ${primaryColors}`);
  if (secondaryColors) notesLines.push(`Secondary Colors: ${secondaryColors}`);
  if (accentColor)    notesLines.push(`Accent: ${accentColor}`);
  if (logoPlacement)  notesLines.push(`Logo Placement: ${logoPlacement.replace(/_/g, " ")}`);

  const notesEl = notesLines.map((line, i) =>
    `<text x="640" y="${145 + i * 16}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" fill="#555" text-anchor="end">${esc(line)}</text>`
  ).join("\n    ");

  const visionEl = visionPrompt
    ? `<text x="640" y="${145 + notesLines.length * 16 + 12}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" fill="#888" text-anchor="end" font-style="italic">"${esc(visionPrompt.slice(0, 120))}${visionPrompt.length > 120 ? "…" : ""}"</text>`
    : "";

  // ── Calculate total SVG height ───────────────────────────────────────────
  const rosterRows = roster?.length ?? 0;
  const rosterBlockH = rosterRows > 0 ? 22 + 26 + rosterRows * 22 + 30 : 0;
  const totalH = LEGEND_Y + 160 + rosterBlockH + 60;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- ════════════════════════════════════════════════════════════════════
     GRACE STUDIOS — PRODUCTION ARTWORK FILE
     Auto-generated on client approval. For sublimation print production.
     1 unit = 1 mm  |  Adult Medium proportions
     ════════════════════════════════════════════════════════════════════ -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  viewBox="0 0 760 ${totalH}" width="760mm" height="${totalH}mm">

  <rect width="760" height="${totalH}" fill="#ffffff"/>

  <!-- Trim marks -->
  <g fill="none" stroke="#000" stroke-width="0.4">
    <line x1="0" y1="28" x2="18" y2="28"/><line x1="28" y1="0" x2="28" y2="18"/>
    <line x1="760" y1="28" x2="742" y2="28"/><line x1="732" y1="0" x2="732" y2="18"/>
  </g>

  <!-- ── Header ───────────────────────────────────────────────────── -->
  <g id="header">
    <rect x="28" y="28" width="704" height="90" fill="#0a0a0a" rx="4"/>
    <text x="48" y="64" font-family="Helvetica Neue,Arial,sans-serif" font-size="22" font-weight="bold" letter-spacing="4" fill="#C9A84C">GRACE STUDIOS</text>
    <text x="48" y="82" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" letter-spacing="2.5" fill="#888">PRODUCTION ARTWORK FILE — SUBLIMATION PRINT</text>
    <text x="48" y="108" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" fill="#aaa">${safeTeam}${city ? ` · ${esc(city)}` : ""} · ${esc(sport.charAt(0).toUpperCase() + sport.slice(1))}</text>
    <text x="722" y="57" font-family="Helvetica Neue,Arial,sans-serif" font-size="11" font-weight="bold" fill="#f0f0f0" text-anchor="end">ORDER: ${safeOrder}</text>
    <text x="722" y="73" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" fill="#aaa" text-anchor="end">Generated ${date}</text>
    <text x="722" y="89" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" fill="#aaa" text-anchor="end">${contactName ? esc(contactName) : ""}</text>
  </g>

  <!-- Design notes sidebar -->
  ${notesEl}
  ${visionEl}

  <!-- ── Jersey Front ──────────────────────────────────────────────── -->
  <g id="jersey-front">
    <text x="380" y="133" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" letter-spacing="2.5" fill="#aaa" text-anchor="middle">JERSEY · FRONT PANEL · ADULT MEDIUM</text>

    <path id="zone-body"         fill="${c.jerseyTop}"         stroke="#ddd" stroke-width="0.5" d="${JERSEY_TOP_PATH}"/>
    <path id="zone-side-l"       fill="${c.jerseySidePanels}"  d="${LEFT_SIDE_PANEL}"/>
    <path id="zone-side-r"       fill="${c.jerseySidePanels}"  d="${RIGHT_SIDE_PANEL}"/>
    <path id="zone-lower-l"      fill="${c.jerseyLowerPanels}" d="${LEFT_LOWER_PANEL}"/>
    <path id="zone-lower-r"      fill="${c.jerseyLowerPanels}" d="${RIGHT_LOWER_PANEL}"/>
    <path id="zone-collar"       fill="${c.collar}"            d="${COLLAR_PATH}"/>
    <path id="zone-armhole-l"    fill="${c.sleevePanels}"      d="${LEFT_ARMHOLE}"/>
    <path id="zone-armhole-r"    fill="${c.sleevePanels}"      d="${RIGHT_ARMHOLE}"/>

    <!-- Silhouette outline -->
    <path fill="none" stroke="#1a1a1a" stroke-width="1.2" d="${JERSEY_OUTLINE}"/>
    <!-- Seam lines -->
    <line x1="238" y1="425" x2="250" y2="830" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>
    <line x1="522" y1="425" x2="510" y2="830" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>
    <line x1="238" y1="595" x2="380" y2="615" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>
    <line x1="522" y1="595" x2="380" y2="615" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>

    <!-- Logo on jersey -->
    ${logoEl}
    ${extraLogos}

    <!-- Zone labels -->
    ${zoneTag("MAIN BODY",  380, 490)}
    ${zoneTag("SIDE",  196, 660)}
    ${zoneTag("SIDE",  564, 660)}
    ${zoneTag("LOWER", 296, 770)}
    ${zoneTag("LOWER", 466, 770)}
    ${zoneTag("COLLAR",  380, 152)}
    ${zoneTag("ARMHOLE", 152, 295)}
    ${zoneTag("ARMHOLE", 610, 295)}

    <!-- Width dimension -->
    <g fill="none" stroke="#aaa" stroke-width="0.5">
      <line x1="140" y1="845" x2="620" y2="845"/>
      <line x1="140" y1="840" x2="140" y2="850"/>
      <line x1="620" y1="840" x2="620" y2="850"/>
    </g>
    <text x="380" y="858" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" fill="#aaa" text-anchor="middle">← 480 mm chest width (size M) →</text>
  </g>

  <!-- ── Shorts Front ───────────────────────────────────────────────── -->
  <g id="shorts-front">
    <text x="380" y="915" font-family="Helvetica Neue,Arial,sans-serif" font-size="9" letter-spacing="2.5" fill="#aaa" text-anchor="middle">SHORTS · FRONT PANEL · ADULT MEDIUM</text>

    <path id="zone-shorts-main"  fill="${c.jerseyShorts}"    stroke="#ddd" stroke-width="0.5" d="${SHORTS_MAIN}"/>
    <path id="zone-shorts-l"     fill="${c.shortSidePanels}" d="${SHORTS_LEFT_PANEL}"/>
    <path id="zone-shorts-r"     fill="${c.shortSidePanels}" d="${SHORTS_RIGHT_PANEL}"/>
    <path fill="${c.jerseyShorts}" stroke="#33333355" stroke-width="1" d="${SHORTS_WAISTBAND}"/>
    <path fill="none" stroke="#1a1a1a" stroke-width="1.2" d="${SHORTS_MAIN}"/>
    <line x1="${SL}" y1="${SY+42}" x2="${SR}" y2="${SY+42}" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>
    <line x1="${SL+80}" y1="${SY}" x2="${SL+85}" y2="${SB}" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>
    <line x1="${SR-80}" y1="${SY}" x2="${SR-85}" y2="${SB}" stroke="#1a1a1a" stroke-width="0.6" stroke-dasharray="4 3"/>

    ${zoneTag("WAISTBAND",   380, SY + 26)}
    ${zoneTag("SHORTS BODY", 380, 1150)}
    ${zoneTag("SIDE",        176, 1150)}
    ${zoneTag("SIDE",        582, 1150)}

    <!-- Approved concept thumbnail (for reference) -->
    ${conceptEl}

    <g fill="none" stroke="#aaa" stroke-width="0.5">
      <line x1="140" y1="1365" x2="620" y2="1365"/>
      <line x1="140" y1="1360" x2="140" y2="1370"/>
      <line x1="620" y1="1360" x2="620" y2="1370"/>
    </g>
    <text x="380" y="1377" font-family="Helvetica Neue,Arial,sans-serif" font-size="8" fill="#aaa" text-anchor="middle">← 480 mm waist width (size M) →</text>
  </g>

  <!-- ── Color Specifications ───────────────────────────────────────── -->
  <g id="color-legend">
    <line x1="28" y1="${LEGEND_Y - 22}" x2="732" y2="${LEGEND_Y - 22}" stroke="#eee" stroke-width="0.8"/>
    <text x="28" y="${LEGEND_Y - 7}" font-family="Helvetica Neue,Arial,sans-serif" font-size="8.5" letter-spacing="2.5" fill="#aaa">ZONE COLOR SPECIFICATIONS</text>
    ${swatches}
  </g>

  <!-- ── Player Roster ──────────────────────────────────────────────── -->
  ${rosterSection ? `<g id="roster">${rosterSection}</g>` : "<!-- No roster provided -->"}

  <!-- ── Footer ─────────────────────────────────────────────────────── -->
  <g id="footer">
    <line x1="28" y1="${totalH - 38}" x2="732" y2="${totalH - 38}" stroke="#eee" stroke-width="0.5"/>
    <text x="28" y="${totalH - 22}" font-family="Helvetica Neue,Arial,sans-serif" font-size="7.5" fill="#bbb">
      Grace Studios · Production Artwork · ${safeOrder} · Auto-generated on client approval · Confidential
    </text>
    <text x="732" y="${totalH - 22}" font-family="Helvetica Neue,Arial,sans-serif" font-size="7.5" fill="#bbb" text-anchor="end">
      ${contactName ? esc(contactName) : ""}
    </text>
  </g>

</svg>`;
}

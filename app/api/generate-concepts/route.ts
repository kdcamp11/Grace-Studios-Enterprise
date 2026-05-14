import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { SupabaseClient } from "@supabase/supabase-js";
import { sendConceptsReady } from "@/lib/email";
import {
  resolveReferenceFiles,
  getGarmentTypeLabel,
  getReferenceUrls,
  buildReferenceAnnotation,
  SYSTEM_VISUAL_LANGUAGE,
} from "@/lib/reference-library";

export const maxDuration = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

export type GenerationStatus = "queued" | "generating" | "completed" | "failed";

export interface DesignMetadata {
  status?:    GenerationStatus;
  progress?:  number;   // 0–4 for renders pipeline
  total?:     number;   // 4 for renders pipeline
  startedAt?: string;
  error?:     string;
  /** "renders" = 4 separate garment renders assembled by app (current)
   *  "specboard" = legacy single spec-board image
   *  "multiview" = legacy 4-image format */
  boardFormat?: "specboard" | "multiview" | "renders";
  /** URL of the single spec-board image (boardFormat === "specboard") */
  boardImage?:  string;
  /** Semi-3D garment renders (boardFormat === "renders") */
  renders?: {
    frontJersey: string;
    backJersey:  string;
    frontShorts: string;
    backShorts:  string;
  };
  // Design spec fields
  garmentType:   string;
  designSystem?: string;
  colorway:      { role: string; name: string; hex: string; pantone?: string }[];
  materials:     string[];
  features:      string[];
  logoPlacement: string;
  description:   string;
  /** Legacy multi-view image URLs (boardFormat === "multiview") */
  images?: {
    front:   string;
    back:    string;
    detail1: string;
    detail2: string;
  };
}

// ─── Render view keys ─────────────────────────────────────────────────────────

const RENDER_VIEWS = [
  { key: "frontJersey" as const, label: "Front Jersey" },
  { key: "backJersey"  as const, label: "Back Jersey"  },
  { key: "frontShorts" as const, label: "Front Shorts" },
  { key: "backShorts"  as const, label: "Back Shorts"  },
];

type RenderViewKey = typeof RENDER_VIEWS[number]["key"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("http");
}

/**
 * Extracts the user's DIRECTLY SELECTED colors from the brief without any
 * AI interpretation. Returns locked colorway entries that override anything
 * Claude might suggest.
 */
function extractDirectColors(
  brief: Record<string, unknown>,
): { role: string; name: string; hex: string }[] {
  const colors: { role: string; name: string; hex: string }[] = [];

  const normalize = (val: unknown): string | null => {
    if (typeof val !== "string" || !val.trim()) return null;
    const v = val.trim();
    return v.startsWith("#") ? v : `#${v}`;
  };

  const primary   = normalize(brief.primary_colors);
  const secondary = normalize(brief.secondary_colors);
  const accent    = normalize(brief.accent_color);

  if (primary)   colors.push({ role: "Primary",   name: "Body Color",  hex: primary   });
  if (secondary) colors.push({ role: "Secondary", name: "Panel Color", hex: secondary });
  if (accent)    colors.push({ role: "Accent",    name: "Trim Color",  hex: accent    });

  return colors;
}

/**
 * Generates a single photorealistic garment render via OpenAI gpt-image-1.
 * Returns the public Supabase Storage URL of the uploaded PNG.
 */
async function generateGarmentRender(
  prompt:   string,
  supabase: SupabaseClient,
  orderId:  string,
  view:     RenderViewKey,
): Promise<string> {
  const apiKey       = process.env.OPENAI_API_KEY!;
  const MAX_ATTEMPTS = 4;
  const RETRY_MS     = 15_000;

  let b64: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:   "gpt-image-1",
        prompt,
        n:       1,
        size:    "1024x1024",
        quality: "high",
      }),
    });

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt >= MAX_ATTEMPTS) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`OpenAI render failed (${res.status}): ${text}`);
      }
      console.log(`[generate-concepts] OpenAI ${res.status} — waiting ${RETRY_MS / 1000}s (attempt ${attempt})`);
      await sleep(RETRY_MS);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI render failed (${res.status}): ${text}`);
    }

    const json = await res.json() as { data: { b64_json?: string }[] };
    b64 = json.data?.[0]?.b64_json ?? null;
    if (!b64) throw new Error("OpenAI returned no image data");
    break;
  }

  if (!b64) throw new Error("OpenAI render produced no output");

  // ── Upload PNG buffer to Supabase Storage ─────────────────────────────────
  const buffer   = Buffer.from(b64, "base64");
  const bucket   = "concepts";
  const filePath = `${orderId}/${view}-${Date.now()}.png`;

  await supabase.storage.createBucket(bucket, { public: true }).catch(() => {/* already exists */});

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: "image/png",
      upsert:      true,
    });

  if (uploadError) throw new Error(`Supabase storage upload failed: ${uploadError.message}`);

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return urlData.publicUrl;
}

/** Merge-patch briefs.ai_prompt without wiping fields set in earlier steps. */
async function saveStatus(
  supabase: SupabaseClient,
  order_id: string,
  patch: Partial<DesignMetadata>,
): Promise<void> {
  const { data } = await supabase
    .from("briefs")
    .select("ai_prompt")
    .eq("order_id", order_id)
    .single();

  let current: Partial<DesignMetadata> = {};
  if (data?.ai_prompt) {
    try { current = JSON.parse(data.ai_prompt as string); } catch { /* ignore */ }
  }
  await supabase
    .from("briefs")
    .update({ ai_prompt: JSON.stringify({ ...current, ...patch }) })
    .eq("order_id", order_id);
}

// ─── Claude prompt builder ────────────────────────────────────────────────────

/**
 * Builds the Claude brief-analysis prompt.
 *
 * When directColors are provided (user explicitly selected hex values in the
 * builder), they are passed as LOCKED USER SELECTIONS — Claude must return
 * them verbatim in the colorway array without modification.
 *
 * The `description` field Claude returns drives the design details that
 * appear in the `buildGarmentPrompt` for each render, but colors are ALWAYS
 * overridden by directColors after Claude responds.
 */
function buildClaudePrompt(
  brief:               Record<string, unknown>,
  client:              Record<string, unknown>,
  garmentLabel:        string,
  referenceAnnotation: string,
  directColors:        { role: string; name: string; hex: string }[],
): string {
  const designSystem = (brief.design_system as string) ?? "bold";
  const sport        = (client.sport as string) ?? "basketball";
  const teamName     = (client.name  as string) ?? "the team";
  const city         = (client.city  as string) ?? "";
  const construction = brief.sublimated === true
    ? "Sublimated (full-color dye into fabric)"
    : brief.sublimated === false
    ? "Tackle Twill (stitched letters and numbers)"
    : "Sublimated";
  const cut            = (brief.jersey_cut as string) ?? "standard";
  const numberStyle    = brief.number_style    ? `Number style: ${brief.number_style}.`           : "";
  const logos          = brief.logos_to_include ? `Additional logos required: ${brief.logos_to_include}.` : "";
  const sponsor        = brief.sponsor_text     ? `Sponsor text/patch: ${brief.sponsor_text}.`    : "";
  const negative       = brief.negative_references ? `AVOID: ${brief.negative_references}.`       : "";
  const vision         = brief.vision_prompt    ? `Client vision: ${brief.vision_prompt}`          : "";

  const logoUrls: string[] = Array.isArray(brief.logo_urls)
    ? (brief.logo_urls as string[]).filter(validUrl)
    : validUrl(brief.logo_url) ? [brief.logo_url as string] : [];

  // Colors: locked selections override everything else
  const colorInstruction = directColors.length > 0
    ? [
        `LOCKED USER SELECTIONS — return these EXACT hex values in the colorway array without modification:`,
        ...directColors.map(c => `• ${c.role}: ${c.hex} (${c.name})`),
        `DO NOT change, adjust, or substitute any of these hex codes.`,
      ].join("\n")
    : logoUrls.length > 0
    ? "EXTRACT the team's exact primary and secondary colors from the uploaded logo(s). Return precise hex codes — do not guess or invent."
    : brief.primary_colors
    ? `Use these exact client-specified colors — PRIMARY: ${brief.primary_colors}, SECONDARY: ${brief.secondary_colors ?? "contrasting"}.`
    : "Choose a strong sport-appropriate palette. Return precise hex codes.";

  const logoRule = logoUrls.length > 0
    ? `LOGO ZONE RULE: Team logos are uploaded LOCKED ASSETS. Do NOT describe logo artwork in the description field. Write ONLY "Clean logo zone — [size] on [location]". The logo is composited in production.`
    : `LOGO ZONE RULE: Describe clean empty logo placement zones only. Write "Clean logo zone — [size] on [location]". Do not generate or describe any logo artwork.`;

  const systemLanguage = SYSTEM_VISUAL_LANGUAGE[designSystem] ?? SYSTEM_VISUAL_LANGUAGE.bold;

  return `You are a senior sportswear designer at Grace Athletics analyzing a brief to produce controlled render directives.

═══ REFERENCE IMAGES PROVIDED ═══
${referenceAnnotation || "No reference images loaded — follow design system spec below."}

═══ DESIGN SYSTEM ═══
System: ${designSystem.toUpperCase()}
Visual language (do not blend with other systems):
${systemLanguage}

═══ PROJECT BRIEF ═══
Client: ${teamName}, ${city} — ${sport}
Garment: ${garmentLabel}
Construction: ${construction}, ${cut} cut
${numberStyle} ${logos} ${sponsor}
Grace Studios logo placement: ${(brief.gs_logo_placement as string) ?? "chest"}
${negative}
${vision}

═══ COLOR AUTHORITY ═══
${colorInstruction}

${logoRule}

═══ OUTPUT FORMAT ═══
Return ONLY valid JSON — no markdown fences:
{
  "garmentType": "${garmentLabel}",
  "colorway": [
    {"role": "Primary",   "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"},
    {"role": "Secondary", "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"},
    {"role": "Accent",    "name": "color name", "hex": "#xxxxxx"}
  ],
  "materials": [
    "Shell: 100% Recycled Polyester",
    "Lining: 100% Polyester Mesh",
    "Weight: 160GSM Performance Knit"
  ],
  "features": [
    "4–8 short feature labels following ${designSystem} system construction language",
    "Match the exact feature list style shown in the spec-board reference image"
  ],
  "logoPlacement": "One precise sentence: Grace Athletics logo placement zone description",
  "description": "GARMENT RENDER DIRECTIVE (max 80 words): Describe panel geometry and design details for ${designSystem.toUpperCase()} system ${sport} uniforms. Specify: body panel zones and their color roles (Primary/Secondary/Accent), diagonal or geometric cut lines with approximate angles, collar style, side panel construction, waistband style. NO color names — color assignment happens separately. Focus on geometry and construction only."
}`.trim();
}

// ─── Garment render prompt builder ────────────────────────────────────────────

/**
 * View-specific garment anatomy specs.
 *
 * Each view has independent construction requirements. The back jersey MUST NOT
 * mirror the front — real basketball jerseys have completely different neckline
 * geometry front-to-back (shallow rear scoop vs. deeper front scoop).
 *
 * These specs are injected near the top of each render prompt so the model
 * treats them as primary construction requirements.
 */
const GARMENT_CONSTRUCTION: Record<RenderViewKey, string> = {
  frontJersey: [
    "FRONT JERSEY — CONSTRUCTION SPECIFICATION:",
    "Neckline: moderately deep front scoop neckline, characteristic of modern basketball jerseys.",
    "Collar: rib-knit collar band, 12–15mm wide, hugging the neckline curve with visible knit texture.",
    "Collar trim: accent-color rib-knit binding along collar edge.",
    "Shoulder: natural tapered shoulder seam, realistic armhole curve, side seam visible.",
    "Chest area: clean empty primary-color panel — primary number zone, no markings.",
    "Armholes: clean curved armhole openings with rib-knit binding trim.",
    "Silhouette: slightly dimensional chest contour, subtle front lighting to show form.",
    "View: straight-on front-facing view. Ghost mannequin or flat lay. Centered.",
  ].join(" "),

  backJersey: [
    "BACK JERSEY — CONSTRUCTION SPECIFICATION:",
    "CRITICAL: The back neckline is COMPLETELY DIFFERENT from the front. DO NOT mirror the front scoop.",
    "Back neckline: HIGH, shallow rear neck opening. The back collar sits much higher on the neck than the front.",
    "Back collar geometry: nearly flat or very gently curved rear neckline — tight, close-fitting to the neck.",
    "Back collar height: the rear neck opening is narrow and high — approximately 4–6cm below the base of the neck, not a deep scoop.",
    "Collar: rib-knit collar band wraps the rear neckline at the high back position, visible knit texture.",
    "Back shoulder: flat rear shoulder structure, wider shoulder blade area, rear shoulder seams visible.",
    "Upper back: large clean empty primary-color panel — back name/number zone, no markings whatsoever.",
    "Back seam: center-back seam running vertically from collar to hem, realistic stitching.",
    "Silhouette: flatter rear profile compared to front. Back-specific shoulder taper.",
    "View: straight-on BACK-FACING view — we are looking at the BACK of the jersey, not the front. Ghost mannequin or flat lay. Centered.",
  ].join(" "),

  frontShorts: [
    "FRONT SHORTS — CONSTRUCTION SPECIFICATION:",
    "Waistband: wide elastic waistband with internal drawcord, 4–5cm tall, primary-color or accent-color.",
    "Waistband detail: visible drawcord exit with grommet or fabric tunnel at center front.",
    "Side panels: design system panel geometry runs vertically down the outer leg.",
    "Inseam length: modern basketball short length — approximately 3–5cm above the knee.",
    "Front view: shows the front face of both legs, waistband, and side panel geometry.",
    "Hem: clean hemline, no cuff, smooth cut edge with internal hem stitching.",
    "Silhouette: relaxed athletic fit, slight taper toward the hem.",
    "View: straight-on front-facing view. Ghost mannequin or flat lay. Centered.",
  ].join(" "),

  backShorts: [
    "BACK SHORTS — CONSTRUCTION SPECIFICATION:",
    "Waistband: same wide elastic waistband as front, showing rear view.",
    "Back waistband: clean rear face of waistband, no visible drawcord (it exits front only).",
    "Side panels: design system panel geometry continues from front, visible on both outer legs.",
    "Back panel: large clean empty primary-color rear panel across both seat panels.",
    "Back seam: inseam and seat seam construction visible, realistic stitching.",
    "Inseam length: same knee-length as front view.",
    "Hem: matching clean hemline.",
    "Silhouette: relaxed athletic fit rear profile, slight seat curve for realistic drape.",
    "View: straight-on BACK-FACING view — we are looking at the BACK of the shorts. Ghost mannequin or flat lay. Centered.",
  ].join(" "),
};

/**
 * Builds the OpenAI image-generation prompt for a single garment view.
 *
 * SPLIT BRANDING ARCHITECTURE:
 *
 * JERSEYS — AI renders integrated typography + number:
 *   The team name wordmark and player number must be sublimated/printed INTO
 *   the fabric by the AI. React overlays cannot follow fabric contour, lighting,
 *   or fold geometry — they always look pasted on. The AI handles all jersey
 *   typography; React handles ONLY the exact uploaded logo (which the AI cannot
 *   reproduce accurately).
 *
 * SHORTS — AI renders clean fabric only:
 *   Shorts looked good without text. Maintained as clean panels.
 *
 * Colors always appear first — OpenAI weighs prompt order heavily.
 * Each view has independent garment anatomy from GARMENT_CONSTRUCTION.
 */
function buildGarmentPrompt(
  view:         RenderViewKey,
  metadata:     DesignMetadata,
  designSystem: string,
  teamName:     string,
  brief:        Record<string, unknown>,
): string {
  const system      = designSystem.toLowerCase();
  const systemFull  = SYSTEM_VISUAL_LANGUAGE[system] ?? SYSTEM_VISUAL_LANGUAGE.bold;

  // ── Extract locked hex colors ─────────────────────────────────────────────
  const primary   = metadata.colorway.find(c => c.role.toLowerCase().includes("primary"));
  const secondary = metadata.colorway.find(c => c.role.toLowerCase().includes("secondary"));
  const accent    = metadata.colorway.find(c => c.role.toLowerCase().includes("accent"));

  // ── 1. COLOR BLOCK — always first (highest model attention weight) ─────────
  const colorLines = [
    primary   ? `BODY/PRIMARY panels: exact hex ${primary.hex}` : "",
    secondary ? `SIDE/SECONDARY panels: exact hex ${secondary.hex}` : "",
    accent    ? `TRIM/ACCENT details (collar binding, stripe edges, waistband): exact hex ${accent.hex}` : "",
  ].filter(Boolean);

  const colorBlock = colorLines.length > 0
    ? [`MANDATORY COLOR REQUIREMENTS — USE THESE EXACT HEX VALUES, NO SUBSTITUTIONS:`, ...colorLines].join("\n")
    : "";

  // ── 2. View-specific flags ────────────────────────────────────────────────
  const isJersey = view.includes("Jersey");
  const isFront  = view.startsWith("front");

  // ── 3. View-specific garment anatomy (independent per view) ───────────────
  const constructionSpec = GARMENT_CONSTRUCTION[view];

  // ── 4. Design system panel geometry from Claude ───────────────────────────
  const garmentDirective = (metadata.description ?? "").slice(0, 180);

  // ── 5. Brief details ──────────────────────────────────────────────────────
  const construction = brief.sublimated === true  ? "sublimated full-color dye-into-fabric"
                     : brief.sublimated === false ? "tackle-twill stitched"
                     : "sublimated full-color dye-into-fabric";
  const numStyleHint  = brief.number_style ? String(brief.number_style) : "collegiate varsity";
  const outlineColor  = secondary?.hex ?? accent?.hex ?? "#000000";

  // ── 6. Subject line ───────────────────────────────────────────────────────
  const garmentSubject = isJersey
    ? `Premium ${construction} basketball game jersey, ${isFront ? "front" : "back"} view, for ${teamName} athletic program.`
    : `Premium ${construction} basketball game shorts, ${isFront ? "front" : "back"} view, for ${teamName} athletic program.`;

  // ── 7. Jersey branding hierarchy (jerseys only) ───────────────────────────
  //   Typography must be rendered BY THE AI into the fabric — not overlaid.
  //   React will composite only the exact uploaded logo into the clean logo zone.
  const jerseyBranding = (() => {
    if (!isJersey) return "";

    const wordmarkName = teamName.toUpperCase();
    const logoSide     = String(brief.gs_logo_placement ?? "left").toLowerCase().includes("right")
                         ? "upper-right" : "upper-left";

    if (view === "frontJersey") {
      return [
        `FRONT JERSEY BRANDING HIERARCHY:`,

        // ── Logo zone: BLANK FABRIC — logo handled by app layer post-generation ──
        `APP-COMPOSITED LOGO ZONE (${logoSide} chest): Leave a clean, completely unmarked flat fabric area approximately 2 inches wide at the ${logoSide} chest position. The uploaded team logo is a LOCKED FILE ASSET managed exclusively by the application — the image model must NOT generate, render, trace, recreate, approximate, or hallucinate any logo, emblem, badge, crest, icon, or symbol in this zone or anywhere else on the jersey. After image generation, the application programmatically composites the exact uploaded logo file onto this zone as a separate pixel-accurate image layer. Pre-filling this zone with anything — even a placeholder mark — will cause a compositing conflict. Leave it completely blank fabric.`,

        // ── Wordmark: AI renders this ──
        `TEAM WORDMARK (primary visual element): Render "${wordmarkName}" as the dominant chest wordmark, sublimated into the fabric. Style: bold athletic jersey wordmark, slightly arched baseline following chest contour, ${numStyleHint}-inspired letterforms, approximately 60–65% of chest width. Must feel constructed INTO the jersey — following fabric drape, not floating on top. Outline/stroke in ${outlineColor} with white fill, layered for depth. Inspired by Nike Elite / NCAA tournament / EYBL jersey wordmarks.`,

        // ── Number: AI renders this ──
        `PLAYER NUMBER (secondary element): Render "00" centered below the team wordmark, sublimated into fabric. Style: ${numStyleHint} numerals, varsity proportions, layered ${outlineColor} outline with white fill. Proportionally balanced beneath the wordmark.`,
      ].join(" ");
    }

    if (view === "backJersey") {
      return [
        `BACK JERSEY BRANDING:`,

        // ── Back logo zone: blank fabric — app composites if back-neck placement ──
        `APP-COMPOSITED BACK LOGO ZONE (upper back, below rear collar): Leave a clean, completely unmarked flat fabric area approximately 1.5 inches wide centered below the rear collar. Do NOT generate any logo, emblem, or symbol here — this zone may receive a composited logo from the application layer post-generation.`,

        // ── Number: AI renders this ──
        `PLAYER NUMBER (dominant element): Render "00" large and centered on the back panel. Style: ${numStyleHint} numerals, approximately 50–55% of back panel height, layered ${outlineColor} outline with white fill, sublimated into the fabric with natural drape wrapping the letterforms. Bold, athletic, authentic basketball hierarchy.`,

        `OPTIONAL BACK IDENTIFIER: Optionally render "${wordmarkName}" in small arched text above the number if design system spacing allows — consistent with front wordmark style at reduced scale.`,
      ].join(" ");
    }

    return "";
  })();

  // ── 8. Branding restrictions (split by garment type) ─────────────────────
  const brandingRestrictions = isJersey
    // Jerseys: allow only the team wordmark text and player number specified above.
    // The team's own uploaded logo is NEVER rendered by the image model — it is
    // composited as a separate file by the application after generation.
    ? [
        `CRITICAL LOGO PROHIBITION: Do NOT render the team's own uploaded logo in any form.`,
        `Do NOT generate any circular emblem, shield, badge, crest, monogram, abstract mark, or symbol that could represent a team logo anywhere on the jersey.`,
        `Do NOT render Nike, Adidas, Jordan, Under Armour, or any external brand marks.`,
        `The ONLY graphics permitted on the jersey fabric are: (1) the team name wordmark text, and (2) the player number — both specified above. Everything else must be clean fabric.`,
      ].join(" ")
    // Shorts: keep entirely clean — no text, no graphics.
    : `CRITICAL — ABSOLUTELY ZERO on the shorts: text, numbers, logos, brand marks, wordmarks, watermarks, graphic overlays, or symbols of any kind. All panels must be completely clean fabric.`;

  return [
    // ── Colors first ──
    colorBlock,

    // ── Subject ──
    garmentSubject,

    // ── View-specific garment construction anatomy ──
    constructionSpec,

    // ── Design system panel geometry ──
    `Design system: ${system.toUpperCase()}. Panel geometry and visual language: ${systemFull.slice(0, 160)}`,

    // ── Panel details from brief analysis ──
    garmentDirective ? `Panel construction details from design brief: ${garmentDirective}` : "",

    // ── Rendering quality ──
    `Rendering: photorealistic semi-3D athletic garment. Performance mesh fabric with visible micro-weave texture. Dimensional studio lighting from upper-left with soft fill from right. Realistic seam stitching, natural fabric drape and weight. Production-accurate Nike/Adidas/FIBA-level manufacturing quality.`,

    // ── Jersey branding (jerseys only — typography integrated into fabric by AI) ──
    jerseyBranding,

    // ── Restrictions ──
    brandingRestrictions,

    // ── Background ──
    `Background: pure clean white (#ffffff). No cast shadows on background. No floor, no environment. Isolated garment only.`,

    // ── Output ──
    `Output: single isolated garment render, square crop, photorealistic premium sportswear quality.`,
  ].filter(Boolean).join("\n\n");
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();
    if (!order_id) {
      return NextResponse.json({ error: "order_id required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // ── 1. Duplicate-generation guard ─────────────────────────────────────────

    const { data: existingBrief } = await supabase
      .from("briefs")
      .select("ai_prompt")
      .eq("order_id", order_id)
      .single();

    if (existingBrief?.ai_prompt) {
      try {
        const existing = JSON.parse(existingBrief.ai_prompt as string) as DesignMetadata;
        if (existing.status === "generating" || existing.status === "queued") {
          return NextResponse.json({ status: "already_running" }, { status: 409 });
        }
        if (existing.status === "completed") {
          return NextResponse.json({ status: "already_completed" }, { status: 409 });
        }
      } catch { /* not valid JSON — proceed */ }
    }

    // ── 2. Fetch brief / order / client ───────────────────────────────────────

    const { data: brief, error: briefError } = await supabase
      .from("briefs").select("*").eq("order_id", order_id).single();
    if (briefError || !brief) {
      return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders").select("client_id, order_number").eq("id", order_id).single();
    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: client, error: clientError } = await supabase
      .from("clients").select("name, city, sport, email").eq("id", order.client_id).single();
    if (clientError || !client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const sport        = (client.sport as string) ?? "basketball";
    const designSystem = (brief.design_system as string) ?? "bold";
    const teamName     = (client.name as string) ?? "Team";
    const garmentLabel = getGarmentTypeLabel(sport);

    // ── 3. Extract direct colors from builder state (BEFORE Claude) ───────────
    //   These are the user's explicit palette selections (hex chips from the
    //   builder UI). They override anything Claude might suggest.

    const directColors = extractDirectColors(brief as Record<string, unknown>);
    console.log(
      `[generate-concepts] direct colors: ${directColors.length > 0
        ? directColors.map(c => `${c.role}=${c.hex}`).join(", ")
        : "none — Claude will choose palette"}`,
    );

    // ── 4. Resolve reference library (for Claude context) ─────────────────────

    const refs          = resolveReferenceFiles(sport, designSystem);
    const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "https://gs-first-pass.vercel.app";
    const allRefUrls    = getReferenceUrls(refs, appUrl);
    const refAnnotation = buildReferenceAnnotation(refs);

    console.log(
      `[generate-concepts] ${sport}/${designSystem} — ` +
      `refs for Claude: ${allRefUrls.length} (specBoard: ${!!refs.specBoard})`,
    );

    // ── 5. Mark queued ────────────────────────────────────────────────────────

    await saveStatus(supabase, order_id, {
      status:      "queued",
      progress:    0,
      total:       4,
      startedAt:   new Date().toISOString(),
      boardFormat: "renders",
      designSystem,
    });

    // ── 6. Build Claude content blocks ────────────────────────────────────────

    type ImageBlock   = { type: "image"; source: { type: "url"; url: string } };
    type TextBlock    = { type: "text"; text: string };
    type ContentBlock = ImageBlock | TextBlock;

    const logoUrls: string[] = Array.isArray(brief.logo_urls)
      ? (brief.logo_urls as string[]).filter(validUrl)
      : validUrl(brief.logo_url) ? [brief.logo_url as string] : [];

    const clientRefUrls: string[] = Array.isArray(brief.reference_image_urls)
      ? (brief.reference_image_urls as string[]).filter(validUrl)
      : validUrl(brief.reference_image_url) ? [brief.reference_image_url as string] : [];

    const maxClientImages = 19 - allRefUrls.length;
    const allClientUrls   = [...logoUrls, ...clientRefUrls].slice(0, maxClientImages);

    const refImageBlocks: ImageBlock[] = allRefUrls.map((url) => ({
      type: "image", source: { type: "url", url },
    }));

    const clientImageBlocks: ImageBlock[] = allClientUrls.map((url) => ({
      type: "image", source: { type: "url", url },
    }));

    const clientAnnotation = [
      logoUrls.length > 0
        ? `• Next ${logoUrls.length} image(s): CLIENT LOGOS — LOCKED ASSETS. Extract colors only if not already specified. Do NOT describe logo artwork in the description field.`
        : "",
      clientRefUrls.length > 0
        ? `• Final ${clientRefUrls.length} image(s): CLIENT REFERENCES — aesthetic direction only.`
        : "",
    ].filter(Boolean).join("\n");

    const fullAnnotation = [refAnnotation, clientAnnotation].filter(Boolean).join("\n");
    const designBriefPrompt = buildClaudePrompt(
      brief as Record<string, unknown>,
      client as Record<string, unknown>,
      garmentLabel,
      fullAnnotation,
      directColors,
    );

    const claudeContent: ContentBlock[] = [
      ...refImageBlocks,
      ...clientImageBlocks,
      ...(fullAnnotation ? [{ type: "text" as const, text: fullAnnotation }] : []),
      { type: "text" as const, text: designBriefPrompt },
    ];

    // ── 7. Call Claude — get structured design metadata ───────────────────────

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const aiResponse = await anthropic.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 1500,
      messages:   [{ role: "user", content: claudeContent }],
      stream:     false,
    });

    const rawText =
      "content" in aiResponse && aiResponse.content[0].type === "text"
        ? aiResponse.content[0].text
        : "";

    // ── 8. Parse Claude metadata ──────────────────────────────────────────────

    let metadata: DesignMetadata;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed  = JSON.parse(cleaned) as DesignMetadata;
      if (typeof parsed.description !== "string") throw new Error("invalid shape");
      metadata = { ...parsed, designSystem, boardFormat: "renders" };
    } catch {
      metadata = {
        garmentType:   garmentLabel,
        designSystem,
        boardFormat:   "renders",
        colorway:      [],
        materials:     [],
        features:      [],
        logoPlacement: (brief.gs_logo_placement as string) ?? "",
        description:   rawText.slice(0, 400),
      };
    }

    // ── 9. Override colorway with locked user selections ──────────────────────
    //   If the user explicitly selected hex values in the builder, those values
    //   WIN over anything Claude returned. This is the core fix for color
    //   hallucination.

    if (directColors.length > 0) {
      console.log(`[generate-concepts] overriding colorway with ${directColors.length} direct colors`);
      metadata.colorway = directColors.map(c => ({ ...c, pantone: undefined }));
    }

    // Mark generating
    await saveStatus(supabase, order_id, {
      ...metadata,
      status:   "generating",
      progress: 0,
      total:    4,
    });

    // ── 10. Generate 4 garment renders sequentially ───────────────────────────
    //   Each render prompt has hex colors at the TOP for maximum model attention.
    //   Progress is saved after each render so the UI can show incremental steps.

    const renders: Partial<Record<RenderViewKey, string>> = {};

    for (let i = 0; i < RENDER_VIEWS.length; i++) {
      const { key, label } = RENDER_VIEWS[i];

      const renderPrompt = buildGarmentPrompt(
        key,
        metadata,
        designSystem,
        teamName,
        brief as Record<string, unknown>,
      );

      console.log(`[generate-concepts] rendering ${label} (${i + 1}/4) — prompt: ${renderPrompt.slice(0, 120)}…`);

      try {
        const url = await generateGarmentRender(renderPrompt, supabase, order_id, key);
        renders[key] = url;
        console.log(`[generate-concepts] ${label} done: ${url.slice(0, 80)}`);
      } catch (imgErr: unknown) {
        const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
        console.error(`[generate-concepts] ${label} failed:`, msg);
        await saveStatus(supabase, order_id, {
          ...metadata,
          status: "failed",
          error:  `${label} render failed: ${msg}`,
        });
        return NextResponse.json({ error: `${label} render failed`, detail: msg }, { status: 500 });
      }

      // Save progress after each render so UI updates incrementally
      await saveStatus(supabase, order_id, {
        ...metadata,
        status:      "generating",
        progress:    i + 1,
        total:       4,
        boardFormat: "renders",
        renders: {
          frontJersey: renders.frontJersey ?? "",
          backJersey:  renders.backJersey  ?? "",
          frontShorts: renders.frontShorts ?? "",
          backShorts:  renders.backShorts  ?? "",
        },
      });
    }

    // ── 11. Mark completed ────────────────────────────────────────────────────

    const finalMetadata: DesignMetadata = {
      ...metadata,
      status:      "completed",
      progress:    4,
      total:       4,
      boardFormat: "renders",
      renders: {
        frontJersey: renders.frontJersey!,
        backJersey:  renders.backJersey!,
        frontShorts: renders.frontShorts!,
        backShorts:  renders.backShorts!,
      },
    };

    await supabase
      .from("briefs")
      .update({ ai_prompt: JSON.stringify(finalMetadata) })
      .eq("order_id", order_id);

    // ── 12. Insert concept rows (1 per render view for legacy fallback) ────────

    await supabase.from("concepts").delete().eq("order_id", order_id);

    const conceptRows = [
      { order_id, concept_number: 1, image_url: renders.frontJersey!, selected: false },
      { order_id, concept_number: 2, image_url: renders.backJersey!,  selected: false },
      { order_id, concept_number: 3, image_url: renders.frontShorts!, selected: false },
      { order_id, concept_number: 4, image_url: renders.backShorts!,  selected: false },
    ];

    const { error: conceptError } = await supabase.from("concepts").insert(conceptRows);
    if (conceptError) {
      console.warn("[generate-concepts] concept insert warning:", conceptError.message);
    }

    // ── 13. Notify client ─────────────────────────────────────────────────────

    try {
      if (client?.email) {
        const orderNumber = order.order_number ?? order_id.slice(0, 8).toUpperCase();
        await sendConceptsReady({
          clientEmail: client.email,
          teamName:    client.name ?? "Client",
          orderNumber,
          orderId:     order_id,
        });
      }
    } catch (emailErr) {
      console.warn("[generate-concepts] email failed:", emailErr instanceof Error ? emailErr.message : emailErr);
    }

    return NextResponse.json({
      status:      "completed",
      order_id,
      boardFormat: "renders",
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-concepts] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

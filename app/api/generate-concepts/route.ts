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
  TRACKSUIT_DESIGN_PHILOSOPHY,
  TRACKSUIT_SYSTEM_LANGUAGE,
} from "@/lib/reference-library";
import sharp from "sharp";
import fsPromises from "fs/promises";
import path from "path";
import { rateLimit } from "@/lib/rate-limit";
import { createServerClient } from "@/lib/supabase/server";
import { getRequestTenant } from "@/lib/tenant/get-request-tenant";

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
  /** Sport the concept was rendered for — persisted so a regenerate reuses the
   *  same garment type (e.g. tracksuit vs basketball) instead of re-deriving
   *  from client.sport, which may be empty and default to basketball. */
  sport?:        string;
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
 *
 * LOGO INTEGRATION PATH (jersey views when logoUrl provided):
 *   Fetches the uploaded logo and passes it as an image[] reference input to the
 *   images/edits endpoint. gpt-image-1 uses the provided images as visual context
 *   for generation — the model sees the actual logo shape/colors and integrates it
 *   naturally into the jersey fabric with realistic lighting and texture.
 *
 * FALLBACK PATH (shorts, no logo, or if logo fetch/edits fails):
 *   Falls back to images/generations (text-to-image) seamlessly.
 *
 * Returns the public Supabase Storage URL of the uploaded PNG.
 */

// ─── Watermark ────────────────────────────────────────────────────────────────
// Burns the Grace Athletics logo as a tiled semi-transparent stamp across the
// full image so concepts cannot be lifted from the URL directly.
let _watermarkStamp: Buffer | null = null;

async function getWatermarkStamp(): Promise<Buffer> {
  if (_watermarkStamp) return _watermarkStamp;

  const logoPath = path.join(process.cwd(), "public", "logo.png");
  const logoSrc  = await fsPromises.readFile(logoPath);

  const LOGO_W = 200; // rendered width of each stamp in the tiled grid

  // Resize and read raw RGBA pixels so we can scale alpha down to ~22%
  const { data, info } = await sharp(logoSrc)
    .resize(LOGO_W)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 3; i < data.length; i += 4) {
    data[i] = Math.round(data[i] * 0.22);
  }

  _watermarkStamp = await sharp(Buffer.from(data), {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();

  return _watermarkStamp;
}

async function applyWatermark(imageBuffer: Buffer): Promise<Buffer> {
  const stamp     = await getWatermarkStamp();
  const stampMeta = await sharp(stamp).metadata();
  const stampW    = stampMeta.width  ?? 200;
  const stampH    = stampMeta.height ?? 61;

  const { width = 1024, height = 1024 } = await sharp(imageBuffer).metadata();

  // Brick-offset grid — alternating rows shift half a step so removal is hard
  const gapX  = 50;
  const gapY  = 55;
  const stepX = stampW + gapX;
  const stepY = stampH + gapY;

  const composites: sharp.OverlayOptions[] = [];
  let row = 0;
  for (let y = -gapY; y < height + stepY; y += stepY) {
    const shiftX = (row % 2 === 0) ? 0 : Math.round(stepX / 2);
    for (let x = -gapX + shiftX; x < width + stepX; x += stepX) {
      composites.push({ input: stamp, top: Math.round(y), left: Math.round(x), blend: "over" });
    }
    row++;
  }

  return sharp(imageBuffer).composite(composites).png().toBuffer();
}

async function generateGarmentRender(
  prompt:        string,
  supabase:      SupabaseClient,
  orderId:       string,
  view:          RenderViewKey,
  logoUrl?:      string | null,
  garmentRefUrl?: string | null,  // visual construction reference (tracksuits)
): Promise<string> {
  const apiKey       = process.env.OPENAI_API_KEY!;
  const MAX_ATTEMPTS = 4;
  const RETRY_MS     = 15_000;

  const isJerseyView = view.includes("Jersey");

  // ── Fetch logo for jersey views when a URL is provided ────────────────────
  let logoBuffer: Buffer | null = null;
  let logoMime   = "image/png";

  if (logoUrl && isJerseyView) {
    try {
      const logoRes = await fetch(logoUrl, { signal: AbortSignal.timeout(15_000) });
      if (logoRes.ok) {
        logoBuffer = Buffer.from(await logoRes.arrayBuffer());
        const ct   = logoRes.headers.get("content-type") ?? "";
        logoMime   = (ct.includes("jpeg") || ct.includes("jpg")) ? "image/jpeg" : "image/png";
        console.log(`[generate-concepts] logo fetched for ${view}: ${logoBuffer.length} bytes (${logoMime})`);
      } else {
        console.warn(`[generate-concepts] logo fetch ${logoRes.status} for ${view} — using text-to-image`);
      }
    } catch (logoErr) {
      console.warn(`[generate-concepts] logo fetch failed for ${view}:`, logoErr instanceof Error ? logoErr.message : logoErr);
    }
  }

  // ── Fetch garment construction reference image (tracksuits) ─────────────
  let garmentRefBuffer: Buffer | null = null;
  if (garmentRefUrl) {
    try {
      const refRes = await fetch(garmentRefUrl, { signal: AbortSignal.timeout(15_000) });
      if (refRes.ok) {
        garmentRefBuffer = Buffer.from(await refRes.arrayBuffer());
        console.log(`[generate-concepts] garment ref fetched for ${view}: ${garmentRefBuffer.length} bytes`);
      } else {
        console.warn(`[generate-concepts] garment ref fetch ${refRes.status} for ${view}`);
      }
    } catch (refErr) {
      console.warn(`[generate-concepts] garment ref fetch failed for ${view}:`, refErr instanceof Error ? refErr.message : refErr);
    }
  }

  let b64:        string | null = null;
  let useLogoRef: boolean       = !!(logoBuffer || garmentRefBuffer);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;

    if (useLogoRef && (logoBuffer || garmentRefBuffer)) {
      // ── images/edits: garment reference + optional logo as visual context ─
      // Garment reference first → establishes correct construction baseline.
      // Logo second → team branding to integrate naturally into the fabric.
      const form = new FormData();
      form.append("model",   "gpt-image-1");
      if (garmentRefBuffer) {
        // Visual construction reference — shows the model correct cuff/hem construction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        form.append("image[]", new Blob([garmentRefBuffer as any], { type: "image/jpeg" }), "garment-reference.jpg");
      }
      if (logoBuffer) {
        const ext = logoMime === "image/jpeg" ? "logo.jpg" : "logo.png";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        form.append("image[]", new Blob([logoBuffer as any], { type: logoMime }), ext);
      }
      form.append("prompt",  prompt);
      form.append("n",       "1");
      form.append("size",    "1024x1024");
      form.append("quality", "high");

      res = await fetch("https://api.openai.com/v1/images/edits", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body:    form,
      });
    } else {
      // ── images/generations: text-to-image (no logo reference) ────────────
      res = await fetch("https://api.openai.com/v1/images/generations", {
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
    }

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
      const errText = await res.text().catch(() => res.statusText);
      // Edits client error → fall back to text-to-image on next attempt
      if (useLogoRef) {
        console.warn(`[generate-concepts] image-edits failed (${res.status}), retrying as text-to-image: ${errText.slice(0, 120)}`);
        useLogoRef = false;
        continue;
      }
      throw new Error(`OpenAI render failed (${res.status}): ${errText}`);
    }

    const json = await res.json() as { data: { b64_json?: string }[] };
    b64 = json.data?.[0]?.b64_json ?? null;
    if (!b64) throw new Error("OpenAI returned no image data");
    break;
  }

  if (!b64) throw new Error("OpenAI render produced no output");

  // ── Watermark then upload to Supabase Storage ────────────────────────────
  const rawBuffer = Buffer.from(b64, "base64");
  const buffer    = await applyWatermark(rawBuffer);
  const bucket    = "concepts";
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

type BriefFilter = { field: "order_id" | "design_id"; id: string };

/** Merge-patch briefs.ai_prompt without wiping fields set in earlier steps. */
async function saveStatus(
  supabase: SupabaseClient,
  bf: BriefFilter,
  patch: Partial<DesignMetadata>,
): Promise<void> {
  const q = supabase.from("briefs").select("ai_prompt");
  const { data } = bf.field === "design_id"
    ? await q.eq("design_id", bf.id).maybeSingle()
    : await q.eq("order_id",  bf.id).maybeSingle();

  let current: Partial<DesignMetadata> = {};
  if (data?.ai_prompt) {
    try { current = JSON.parse(data.ai_prompt as string); } catch { /* ignore */ }
  }
  const u = supabase.from("briefs").update({ ai_prompt: JSON.stringify({ ...current, ...patch }) });
  bf.field === "design_id"
    ? await u.eq("design_id", bf.id)
    : await u.eq("order_id",  bf.id);
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
  studioName:          string = "Grace Athletics",
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

  const isFreestyle    = designSystem.toLowerCase() === "freestyle";
  const isTracksuit    = sport.toLowerCase() === "tracksuits";
  const systemLanguage = isTracksuit
    ? (TRACKSUIT_SYSTEM_LANGUAGE[designSystem] ?? TRACKSUIT_SYSTEM_LANGUAGE.bold)
    : (SYSTEM_VISUAL_LANGUAGE[designSystem]    ?? SYSTEM_VISUAL_LANGUAGE.bold);

  // ── Tracksuit-specific Claude constraints ──────────────────────────────────
  const tracksuitConstraints = isTracksuit ? `
═══ TRACKSUIT CONSTRUCTION RULES — MANDATORY FOR ALL OUTPUT ═══
These rules govern what you write in materials, features, and description. Any output that contradicts these rules is wrong.

MATERIAL RULES:
- Material is premium lightweight nylon woven shell — NOT polyester knit, NOT fleece, NOT cotton.
- Use: "Shell: 100% Nylon Woven Shell", "Weight: 80–100GSM Lightweight Nylon", "Finish: Smooth matte or subtle sheen nylon"
- Do NOT write: polyester, performance knit, fleece, cotton, mesh body fabric.

FEATURES — FORBIDDEN TERMS (do NOT include any of these):
- "elastic cuffs", "ribbed cuffs", "wrist cuffs", "rib cuffs", "sweatshirt cuffs"
- "elastic hem", "ribbed waistband hem", "sweatshirt hem", "elastic waistband hem"
- "ankle cuffs", "elastic ankle", "ribbed ankle", "ankle zip", "ankle drawcord", "ankle opening"
- "jogger", "tapered leg", "slim fit", "fitted leg"
- Any mention of cuffs at sleeve ends or ankle ends

FEATURES — CORRECT TERMS TO USE:
- "OPEN SLEEVE HEM — clean nylon edge" (not cuffed)
- "OPEN-BOTTOM WIDE-LEG PANTS — straight nylon hem" (not cuffed, not tapered)
- "STRAIGHT NYLON HEM or HIDDEN DRAWCORD JACKET HEM" (not ribbed waistband)
- "FULL-LENGTH WIDE-LEG PANT SILHOUETTE"
- "PREMIUM NYLON SHELL FABRIC"
- "FULL-ZIP JACKET — STAND/MOCK COLLAR"
- Features related to panels, zippers, pockets, design system geometry

DESCRIPTION RULES:
- When describing jacket: do NOT mention ribbed cuffs, elastic cuffs, or waistband rib
- When describing pants: do NOT mention ankle cuffs, tapered leg, or jogger silhouette
- Jacket sleeves end with clean open hems. Jacket hem is straight nylon or hidden drawcord.
- Pants are wide-leg with open bottom nylon hem — they stack at the ankle.
`.trim() : "";

  // For Freestyle: silhouette/construction is the non-negotiable foundation,
  // then client vision is applied within it — not the other way around.
  const freestyleVisionDirective = isFreestyle && brief.vision_prompt
    ? `⚠️ FREESTYLE BRIEF ⚠️

STEP 1 — SILHOUETTE FOUNDATION (non-negotiable, applies before all other decisions):
Grace Athletics tracksuit construction standards govern the garment. Boxy relaxed jacket with nylon shell, stand collar, full-length sleeves with clean open hems, flat windbreaker bottom hem. Wide-leg straight nylon trousers with open ankle hems — absolutely no taper, no jogger. Vintage warmup energy. These silhouette rules cannot be overridden by client vision.

STEP 2 — CLIENT VISION (applied within the silhouette above):
Within the non-negotiable silhouette, execute the following client vision exactly as described. This drives all panel geometry, graphic placement, color blocking, and aesthetic direction.

CLIENT VISION: "${brief.vision_prompt}"

Do NOT impose Bold, Gradient, Program, or Culture system defaults unless the client explicitly referenced them. The client's stated direction is the creative law — the silhouette is the physical law.`
    : isFreestyle
    ? `⚠️ FREESTYLE — OPEN BRIEF ⚠️

STEP 1 — SILHOUETTE FOUNDATION (non-negotiable):
Grace Athletics tracksuit construction standards apply: boxy relaxed nylon jacket, wide-leg straight nylon trousers, stand collar, clean open hems throughout, vintage warmup energy. These cannot be changed.

STEP 2 — OPEN CREATIVE DIRECTION:
No client vision was provided. Produce a clean, elevated tracksuit within the silhouette above. Use tonal side-panel blocking and contrast piping as a tasteful default that can be refined in later rounds.`
    : "";

  return `You are a senior sportswear designer at ${studioName} analyzing a brief to produce controlled render directives.
${isTracksuit ? `\n${TRACKSUIT_DESIGN_PHILOSOPHY}\n` : ""}${freestyleVisionDirective ? `\n${freestyleVisionDirective}\n` : ""}
═══ REFERENCE IMAGES PROVIDED ═══
${referenceAnnotation || "No reference images loaded — follow design system spec below."}

═══ DESIGN SYSTEM ═══
System: ${designSystem.toUpperCase()}
${isFreestyle
  ? "This is a Freestyle brief. Design language is determined by the client vision above, not by a fixed system template."
  : `Visual language (do not blend with other systems):\n${systemLanguage}`
}

═══ PROJECT BRIEF ═══
Client: ${teamName}, ${city} — ${sport}
Garment: ${garmentLabel}
Construction: ${construction}, ${cut} cut
${numberStyle} ${logos} ${sponsor}
Logo placement: ${(brief.logo_placement as string) ?? "chest"}
${negative}
${vision}

═══ COLOR AUTHORITY ═══
${colorInstruction}

${logoRule}
${tracksuitConstraints ? `\n${tracksuitConstraints}` : ""}

═══ OUTPUT FORMAT ═══
Return ONLY valid JSON — no markdown fences:
{
  "garmentType": "${garmentLabel}",
  "colorway": [
    {"role": "Primary",   "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"},
    {"role": "Secondary", "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"},
    {"role": "Accent",    "name": "color name", "hex": "#xxxxxx"}
  ],
  "materials": ${isTracksuit
    ? `[
    "Shell: 100% Nylon Woven Shell",
    "Lining: 100% Polyester Mesh",
    "Weight: 80–100GSM Lightweight Nylon",
    "Finish: Smooth Matte Nylon"
  ]`
    : `[
    "Shell: 100% Recycled Polyester",
    "Lining: 100% Polyester Mesh",
    "Weight: 160GSM Performance Knit"
  ]`
  },
  "features": [
    ${isTracksuit
      ? `"4–8 short feature labels. MUST include: open sleeve hem, open-bottom wide-leg pants, nylon shell. MUST NOT include: elastic cuffs, ribbed cuffs, ankle cuffs, jogger, tapered. Follow ${designSystem} system construction language."`
      : `"4–8 short feature labels following ${designSystem} system construction language"`
    },
    "Match the exact feature list style shown in the spec-board reference image"
  ],
  "logoPlacement": "One precise sentence: logo placement zone description",
  "description": "GARMENT RENDER DIRECTIVE (max 80 words): Describe panel geometry and design details for ${designSystem.toUpperCase()} system ${isTracksuit ? "tracksuit" : sport} uniforms. Specify: body panel zones and their color roles (Primary/Secondary/Accent), diagonal or geometric cut lines with approximate angles, collar style, side panel construction, ${isTracksuit ? "OPEN sleeve hems, WIDE-LEG OPEN-BOTTOM pant silhouette" : "waistband style"}. NO color names — color assignment happens separately. Focus on geometry and construction only."
}`.trim();
}

// ─── Color utilities ──────────────────────────────────────────────────────────

/**
 * Returns true when a hex color is perceptually dark (relative luminance < 0.35).
 * Used to decide which palette color gives the logo sufficient contrast.
 */
function isColorDark(hex: string): boolean {
  const h = hex.replace(/^#/, "").padEnd(6, "0");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  // WCAG relative luminance
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.35;
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
/**
 * Tracksuit construction specs — injected in place of basketball specs
 * when sport === "tracksuits". Views reuse the same 4 keys (frontJersey
 * = front jacket, backJersey = back jacket, frontShorts = front pants,
 * backShorts = back pants).
 */
const TRACKSUIT_CONSTRUCTION: Record<RenderViewKey, string> = {
  frontJersey: [
    "FRONT VIEW — LUXURY NYLON ZIP JACKET CONSTRUCTION:",
    "MATERIAL: smooth woven nylon shell fabric. The surface has a subtle sheen and soft light reflections. Where the fabric folds it shows natural nylon crinkle. The texture looks like a premium windbreaker or shell jacket — lightweight and slightly glossy.",
    "ZIPPER: full-length center-front zipper, clean zip guard, visible metal pull tab.",
    "COLLAR: a clean stand collar, 3–4cm tall. The collar is made from the same woven nylon fabric as the jacket body — it is a flat woven tube of fabric, standing straight up. It is not ribbed, not knitted, not stretchy.",
    "SLEEVES: full-length sleeves reaching the wrist. The sleeve ends in a simple flat hem: the nylon fabric folds over once by about 1cm and is topstitched. The sleeve opening is a plain open tube of fabric — the same nylon as the sleeve, just hemmed. It looks like a hemmed shirt sleeve, not a cuffed sweatshirt sleeve. The sleeve is open and loose at the wrist.",
    "JACKET BOTTOM HEM: the bottom of the jacket is a straight horizontal edge of nylon fabric, flat and clean. It has a hidden internal drawcord running through the hem channel. The hem looks like a windbreaker or shell jacket hem — a flat nylon edge, not banded, not gathered.",
    "SILHOUETTE: relaxed and slightly oversized. The jacket hangs straight from the shoulders with no waist cinching. It falls to hip level or just below. The shoulders are slightly dropped. Fashion-forward elongated proportions.",
    "POCKETS: zip pockets at hip level on both sides.",
    "VIEW: straight-on front-facing. Ghost mannequin or flat lay. Centered.",
  ].join(" "),

  backJersey: [
    "BACK VIEW — LUXURY NYLON ZIP JACKET CONSTRUCTION:",
    "MATERIAL: smooth woven nylon shell fabric with subtle sheen. Surface shows soft light reflections and natural nylon drape.",
    "BACK PANEL ONLY — do not show zipper or front chest.",
    "COLLAR: the back of the stand collar is visible at the top — it is a flat woven nylon tube, clean and structured.",
    "SLEEVES: both full-length sleeves visible at the sides. Each sleeve ends in a simple flat hem: the nylon fabric folds over once and is topstitched — a plain open hemmed nylon tube, the same fabric as the sleeve. The sleeve is open and loose at the wrist end, like a hemmed shirt sleeve.",
    "JACKET BOTTOM HEM: the back hem is a clean flat horizontal nylon edge. A hidden drawcord runs through the internal hem channel. The hem is flat, not banded.",
    "SILHOUETTE: relaxed oversized back profile. Straight drop from shoulder. Hip-length or slightly longer. Fashion-forward elongated proportions.",
    "VIEW: straight-on BACK-FACING view. Ghost mannequin or flat lay. Centered.",
  ].join(" "),

  frontShorts: [
    "FRONT VIEW — LUXURY NYLON WIDE-LEG TROUSERS CONSTRUCTION:",
    "MATERIAL: smooth woven nylon shell fabric. Subtle sheen, soft light reflections, natural nylon drape in folds. The fabric looks like a premium windbreaker material — lightweight, slightly glossy, woven.",
    "LEG SILHOUETTE: the legs are wide and straight from hip to ankle. The leg width is consistent — it does not narrow below the knee. Both legs hang straight down like wide palazzo trousers or luxury wide-leg nylon trousers. This is not a jogger. This is not an athletic pant.",
    "ANKLE HEM: each leg ends in a simple flat hem — the nylon fabric folds over once and is topstitched, exactly like the sleeve hems of a windbreaker jacket. The ankle opening is the full width of the lower leg — wide, open, and unobstructed. The pant legs stack slightly on the floor, falling past the ankle. The hem is a plain hemmed nylon tube.",
    "WAISTBAND: a clean wide waistband 5–6cm tall at the top, with a visible drawcord at center front.",
    "PANELS: design system panel geometry and color blocking runs the full outer leg length on both sides.",
    "POCKETS: hip pockets on both sides.",
    "VIEW: straight-on front-facing. Both full-length legs visible. Ghost mannequin or flat lay. Centered.",
  ].join(" "),

  backShorts: [
    "BACK VIEW — LUXURY NYLON WIDE-LEG TROUSERS CONSTRUCTION:",
    "MATERIAL: smooth woven nylon shell fabric. Subtle sheen and soft reflections in fabric folds.",
    "LEG SILHOUETTE: wide straight legs from hip to ankle — no taper, no narrowing. Both legs hang straight down. Wide-leg nylon trousers proportions.",
    "ANKLE HEM: each leg ends in a simple flat nylon hem — fabric folds over once and is topstitched. The ankle opening is the full width of the lower leg, wide and open. The legs stack slightly at the bottom. Plain hemmed nylon edge.",
    "WAISTBAND BACK: clean flat waistband rear face. No drawcord visible from back.",
    "PANELS: design system color blocking and panel geometry continues from front, running full leg length on both sides.",
    "VIEW: straight-on BACK-FACING view. Ghost mannequin or flat lay. Centered.",
  ].join(" "),
};

/** Basketball-specific construction specs (original). */
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

// ─── Grace Athletics Tracksuit Render System ─────────────────────────────────
// Prepended to EVERY tracksuit render prompt. Defines the permanent visual
// standard for all Grace Athletics tracksuit generations.

// Jacket-only system spec — only injected into jacket (frontJersey/backJersey) prompts
const GRACE_TRACKSUIT_SYSTEM_JACKET = `
⚠️ CONSTRUCTION OVERRIDE — READ FIRST BEFORE ALL OTHER INSTRUCTIONS ⚠️
THIS IS A VINTAGE ATHLETIC WINDBREAKER JACKET. Elevated reinterpretation of late-90s / early-2000s basketball warmup jackets and collegiate sideline suits. Premium nylon shell — not modern techwear, not slim-fit, not luxury tailoring.

SLEEVE ENDS: The sleeve fabric simply ends. It folds over once (1cm) and is topstitched flat. The wrist opening is a plain open tube of nylon — wide, loose, open. Identical to the sleeve hem on a premium nylon windbreaker. There is NO ribbing. NO elastic band. NO knit cuff. NO gathered wrist. The sleeve just ends cleanly.
JACKET BOTTOM HEM: Straight flat nylon hem with hidden drawcord channel. Windbreaker hem. Not banded. Not ribbed.
COLLAR: Flat woven nylon stand collar. Same fabric as body. Not ribbed. Not knit.

GRACE ATHLETICS — VINTAGE NYLON WINDBREAKER JACKET RENDER RULES

GARMENT TYPE: Premium athletic windbreaker jacket — zip-front nylon shell. Vintage warmup energy. Grace Athletics nylon windbreaker standard.

SILHOUETTE: Relaxed, slightly boxy. Hip length or below. Straight drop from shoulders. No waist cinching. Slightly cropped proportions with fashion-forward elongated feel.

MATERIAL: Smooth woven nylon shell. Subtle sheen, soft light reflections, natural crinkle in folds. Slightly matte windbreaker surface — like vintage Nike Team or Adidas Team warmup fabric. Real and wearable, not futuristic.

AVOID IN THIS RENDER: skinny fit, techwear look, futuristic paneling, compression styling, ribbed cuffs, elastic ankle cuffs, AI-looking textures.

RENDER QUALITY: Studio-shot apparel photography quality. Real fabric behavior. Realistic nylon drape and folds. Soft studio lighting. Premium Grace Athletics sportswear campaign standard — not AI-looking.
`.trim();

// Pants-only system spec — only injected into pants (frontShorts/backShorts) prompts
const GRACE_TRACKSUIT_SYSTEM_PANTS = `
⚠️ CONSTRUCTION OVERRIDE — READ FIRST BEFORE ALL OTHER INSTRUCTIONS ⚠️
THESE ARE WIDE-LEG VINTAGE ATHLETIC NYLON TROUSERS. Elevated reinterpretation of late-90s / early-2000s basketball warmup pants, tearaway-inspired silhouette, collegiate sideline pant. Not joggers. Not tapered. Not slim. Not techwear.

ANKLE HEM: The pant leg simply ends. It folds over once (1cm) and is topstitched flat. The ankle opening is the full width of the lower leg — wide, open, flat. The pants stack on the floor. Like wide-leg windbreaker trousers. There is NO ribbing. NO elastic ankle. NO gathered cuff. NO tapered leg. The leg is the same width from hip to ankle.
LEG SHAPE: Wide and straight from hip to floor. Full volume. Palazzo trouser proportions. The same width at the knee as at the ankle.

GRACE ATHLETICS — VINTAGE NYLON WIDE-LEG TROUSERS RENDER RULES

GARMENT TYPE: Premium athletic wide-leg nylon trousers — windbreaker shell fabric. Tearaway/warmup inspiration. Grace Athletics wide-leg nylon pant standard.

SILHOUETTE: Relaxed and wide from hip to floor. Full-volume nylon shape. Natural stacking and fabric collapse at ankle. Long and flowing — fashion-forward elongated proportions.

MATERIAL: Smooth woven nylon shell. Subtle sheen, soft light reflections, natural drape in folds. Slightly matte windbreaker surface — vintage Nike Team / Adidas Team warmup fabric quality. Real and wearable, not futuristic.

AVOID IN THIS RENDER: tapered legs, jogger silhouette, slim fit, techwear aesthetics, elastic ankle cuffs, ribbed ankle bands, futuristic paneling, AI-looking textures.

RENDER QUALITY: Studio-shot apparel photography quality. Real fabric behavior. Realistic nylon drape. Soft studio lighting. Premium Grace Athletics sportswear campaign standard — not AI-looking.
`.trim();

// ─────────────────────────────────────────────────────────────────────────────

function buildGarmentPrompt(
  view:         RenderViewKey,
  metadata:     DesignMetadata,
  designSystem: string,
  teamName:     string,
  brief:        Record<string, unknown>,
  hasLogoRef:   boolean = false,
  sport:        string  = "basketball",
): string {
  const system      = designSystem.toLowerCase();
  const isTracksuit = sport.toLowerCase() === "tracksuits";
  const systemFull  = isTracksuit
    ? (TRACKSUIT_SYSTEM_LANGUAGE[system] ?? TRACKSUIT_SYSTEM_LANGUAGE.bold)
    : (SYSTEM_VISUAL_LANGUAGE[system]    ?? SYSTEM_VISUAL_LANGUAGE.bold);

  // ── Vision notes + mascot extraction ─────────────────────────────────────
  // vision_prompt is collected in the brief form. It carries client-specified
  // mascot details (animal type, style, accessories, pose, etc.) that MUST
  // reach the OpenAI render prompt verbatim — not just a keyword extraction.
  // The full vision text is injected as a TOP-PRIORITY directive so the model
  // treats it as a binding creative specification, not a suggestion.
  const visionText        = String(brief.vision_prompt ?? "").trim();
  const logoPlacementText = String(metadata.logoPlacement ?? "").trim();
  const combinedVision    = `${visionText} ${logoPlacementText}`.toLowerCase();

  const MASCOT_ANIMALS = [
    "bulldog","eagle","tiger","lion","bear","wolf","hawk","panther",
    "mustang","bronco","falcon","bull","ram","wildcat","husky","viking",
    "warrior","knight","spartan","trojan","jaguar","cougar","leopard",
    "grizzly","bobcat","hornet","wasp","maverick","patriot","pirate",
    "raider","rebel","dragon","griffin","phoenix","gator","alligator",
    "wolverine","badger","bison","buffalo","stallion","colt","cobra",
    "viper","shark","marlin","dolphin","penguin","pelican","osprey",
  ];
  const mascotKeyword = MASCOT_ANIMALS.find(m => combinedVision.includes(m));
  const mascotName    = mascotKeyword
    ? mascotKeyword.charAt(0).toUpperCase() + mascotKeyword.slice(1)
    : null;

  // Full vision text passed verbatim so specific details (accessories, poses,
  // style references like "70s baseball hat") are not lost in keyword extraction.
  const visionDirective = visionText
    ? `⚠️ CLIENT VISION — TOP PRIORITY: The client specified the following creative direction. You MUST incorporate every detail exactly as described. This overrides default mascot/graphic assumptions: "${visionText}"`
    : "";

  // ── Extract locked hex colors ─────────────────────────────────────────────
  const primary   = metadata.colorway.find(c => c.role.toLowerCase().includes("primary"));
  const secondary = metadata.colorway.find(c => c.role.toLowerCase().includes("secondary"));
  const accent    = metadata.colorway.find(c => c.role.toLowerCase().includes("accent"));

  // ── 1. COLOR BLOCK — always first (highest model attention weight) ─────────
  const colorLines = [
    primary   ? `BODY/PRIMARY panels: exact hex ${primary.hex}` : "",
    secondary ? `SIDE/SECONDARY panels: exact hex ${secondary.hex}` : "",
    accent    ? `TRIM/ACCENT details (collar binding, stripe edges, waistband, cuffs): exact hex ${accent.hex}` : "",
  ].filter(Boolean);

  const colorBlock = colorLines.length > 0
    ? [`MANDATORY COLOR REQUIREMENTS — USE THESE EXACT HEX VALUES, NO SUBSTITUTIONS:`, ...colorLines].join("\n")
    : "";

  // ── 2. View-specific flags ────────────────────────────────────────────────
  const isJersey = view.includes("Jersey");  // jacket views for tracksuits
  const isFront  = view.startsWith("front");

  // ── 3. View-specific garment anatomy (sport-aware) ────────────────────────
  const constructionSpec = isTracksuit
    ? TRACKSUIT_CONSTRUCTION[view]
    : GARMENT_CONSTRUCTION[view];

  // ── 4. Design system panel geometry from Claude ───────────────────────────
  const garmentDirective = (metadata.description ?? "").slice(0, 180);

  // ── 5. Brief details ──────────────────────────────────────────────────────
  const construction = brief.sublimated === true  ? "sublimated full-color dye-into-fabric"
                     : brief.sublimated === false ? "tackle-twill stitched"
                     : "sublimated full-color dye-into-fabric";
  const numStyleHint  = brief.number_style ? String(brief.number_style) : "collegiate varsity";
  const outlineColor  = secondary?.hex ?? accent?.hex ?? "#000000";

  // ── 6. Subject line (sport-aware) ────────────────────────────────────────
  // IMPORTANT: Do NOT use "track jacket" or "track pants" — those words
  // activate the model's default ribbed-cuff / tapered-jogger visual prior.
  // Use "nylon zip jacket" and "wide-leg nylon trousers" instead.
  const garmentSubject = isTracksuit
    ? isJersey
      ? `${isFront ? "Front" : "Back"} view of a premium nylon windbreaker jacket for ${teamName}. Grace Athletics windbreaker construction — smooth nylon shell, clean open sleeve hems, flat windbreaker bottom hem. ${construction} graphic print.`
      : `${isFront ? "Front" : "Back"} view of premium wide-leg nylon windbreaker trousers for ${teamName}. Grace Athletics wide-leg construction — straight wide legs from hip to floor, clean open ankle hems, nylon shell fabric. ${construction} graphic print.`
    : isJersey
      ? `Premium ${construction} basketball game jersey, ${isFront ? "front" : "back"} view, for ${teamName} athletic program.`
      : `Premium ${construction} basketball game shorts, ${isFront ? "front" : "back"} view, for ${teamName} athletic program.`;

  // ── 7. Jacket/Jersey branding hierarchy (jacket & jersey views only) ────────
  //   Typography must be rendered BY THE AI into the fabric — not overlaid.
  //   React will composite only the exact uploaded logo into the clean logo zone.
  const jerseyBranding = (() => {
    if (!isJersey) return "";

    const wordmarkName = teamName.toUpperCase();
    const logoSide     = String(brief.logo_placement ?? "left").toLowerCase().includes("right")
                         ? "upper-right" : "upper-left";

    // ── TRACKSUIT: jacket branding — wordmark + logo, no player number ───────
    if (isTracksuit && view === "frontJersey") {
      const bodyIsDark     = primary ? isColorDark(primary.hex) : true;
      const logoRecolorHex = bodyIsDark
        ? (secondary?.hex ?? accent?.hex ?? "#ffffff")
        : (primary?.hex   ?? accent?.hex ?? "#000000");

      const logoZone = hasLogoRef
        ? `LOGO INTEGRATION (${logoSide} chest): The provided image is the team's uploaded logo. Use its exact shape, proportions, and structure. Integrate it naturally into the ${logoSide} chest area of the jacket, approximately 2–2.5 inches wide, sublimated/printed into the fabric. LOGO RECOLOR: Recolor to ${logoRecolorHex} for contrast against body (${primary?.hex ?? "body color"}). Preserve original form exactly.`
        : `LOGO ZONE (${logoSide} chest): Leave a clean completely blank fabric area approximately 2 inches wide at the ${logoSide} chest for logo compositing. Do NOT generate any emblem or symbol here.`;

      const mascotZone = mascotName
        ? [
            visionDirective,
            `MASCOT GRAPHIC (dominant front graphic element — REQUIRED): Render a large bold illustrated ${mascotName} mascot graphic sublimated into the jacket fabric. Style: contemporary athletic mascot illustration — bold graphic-art style, NOT photorealistic. The ${mascotName} should be a large prominent graphic element centered on the chest, approximately 40–55% of the jacket front height. Strong silhouette, high contrast. Every detail from the client vision above MUST be reflected — accessories, pose, style references, era-specific elements. Rendered as dye-sublimated print INTO the fabric — not floating on top.`,
          ].filter(Boolean).join(" ")
        : visionDirective;

      return [
        `FRONT JACKET BRANDING:`,
        mascotZone,
        logoZone,
        `TEAM WORDMARK: Render "${wordmarkName}" as a clean chest wordmark sublimated into the fabric. Style: bold athletic lettering, ${system.toUpperCase()} system aesthetic, approximately 55–60% of chest width. Feels printed INTO the jacket fabric — not floating. Outline in ${outlineColor} with contrasting fill.`,
        `NO PLAYER NUMBERS — tracksuits do not carry player numbers. Do not render any numerals.`,
      ].filter(Boolean).join(" ");
    }

    if (isTracksuit && view === "backJersey") {
      const bodyIsDark      = primary ? isColorDark(primary.hex) : true;
      const logoRecolorHex  = bodyIsDark
        ? (secondary?.hex ?? accent?.hex ?? "#ffffff")
        : (primary?.hex   ?? accent?.hex ?? "#000000");

      const backLogoZone = hasLogoRef
        ? `LOGO INTEGRATION (upper back, below collar): Integrate the provided logo centered below the rear collar, approximately 1.5 inches wide. LOGO RECOLOR: Recolor to ${logoRecolorHex}. Preserve form exactly.`
        : `LOGO ZONE (upper back, below collar): Leave a clean blank 1.5-inch wide area below the rear collar. Do NOT generate any emblem here.`;

      return [
        `BACK JACKET BRANDING:`,
        backLogoZone,
        `TEAM NAME (dominant back element): Render "${wordmarkName}" large across the upper back panel, sublimated into fabric. Style: bold collegiate wordmark, approximately 70–75% of back panel width. Outline in ${outlineColor}. Feels printed INTO the jacket, not floating on top.`,
        `NO PLAYER NUMBERS — tracksuits do not carry player numbers. Do not render any numerals.`,
      ].join(" ");
    }

    // ── BASKETBALL: original jersey branding ─────────────────────────────────
    if (view === "frontJersey") {
      // ── Logo recolor: pick contrasting palette color based on body luminance ──
      const bodyIsDark    = primary ? isColorDark(primary.hex) : true;
      // Dark body → use secondary or accent (lighter marks); light body → use primary or accent
      const logoRecolorHex = bodyIsDark
        ? (secondary?.hex ?? accent?.hex ?? "#ffffff")
        : (primary?.hex   ?? accent?.hex ?? "#000000");

      const logoZone = hasLogoRef
        // ── Logo reference provided: integrate + recolor to match palette ──
        ? `LOGO INTEGRATION (${logoSide} chest): The provided image is the team's uploaded logo. Use its exact shape, proportions, typography, spacing, and icon structure — do not redraw, replace, simplify, or alter the logo design in any way. Integrate it naturally into the ${logoSide} chest area, approximately 2–2.5 inches wide, sublimated/printed into the fabric with realistic lighting, depth, and texture. LOGO RECOLOR: Recolor all logo elements to ${logoRecolorHex} so the logo reads cleanly against the jersey body (${primary?.hex ?? "body color"}). Apply the new color treatment uniformly across the logo; preserve the original form exactly.`
        // ── No logo reference: leave blank zone for app-layer compositing ──
        : `APP-COMPOSITED LOGO ZONE (${logoSide} chest): Leave a clean, completely unmarked flat fabric area approximately 2 inches wide at the ${logoSide} chest position. The uploaded team logo is a LOCKED FILE ASSET managed exclusively by the application — the image model must NOT generate, render, trace, recreate, approximate, or hallucinate any logo, emblem, badge, crest, icon, or symbol in this zone or anywhere else on the jersey. After image generation, the application programmatically composites the exact uploaded logo file onto this zone as a separate pixel-accurate image layer. Pre-filling this zone with anything — even a placeholder mark — will cause a compositing conflict. Leave it completely blank fabric.`;

      return [
        `FRONT JERSEY BRANDING HIERARCHY:`,

        logoZone,

        // ── Wordmark: AI renders this ──
        `TEAM WORDMARK (primary visual element): Render "${wordmarkName}" as the dominant chest wordmark, sublimated into the fabric. Style: bold athletic jersey wordmark, slightly arched baseline following chest contour, ${numStyleHint}-inspired letterforms, approximately 60–65% of chest width. Must feel constructed INTO the jersey — following fabric drape, not floating on top. Outline/stroke in ${outlineColor} with white fill, layered for depth. Inspired by elite collegiate and professional tournament jersey wordmarks.`,

        // ── Number: AI renders this ──
        `PLAYER NUMBER (secondary element): Render "00" centered below the team wordmark, sublimated into fabric. Style: ${numStyleHint} numerals, varsity proportions, layered ${outlineColor} outline with white fill. Proportionally balanced beneath the wordmark.`,

        // ── Mascot (if specified in client vision) ──
        mascotName
          ? [
              visionDirective,
              `MASCOT GRAPHIC (REQUIRED): Render a bold illustrated ${mascotName} mascot sublimated into the jersey fabric. Contemporary athletic mascot art style — bold, graphic illustration, NOT photorealistic. Every detail from the client vision above MUST appear: accessories, style references, era-specific elements. Place below the wordmark or on the chest panel.`,
            ].filter(Boolean).join(" ")
          : visionDirective,
      ].filter(Boolean).join(" ");
    }

    if (view === "backJersey") {
      // Same luminance-based recolor logic as front
      const bodyIsDark        = primary ? isColorDark(primary.hex) : true;
      const backLogoRecolorHex = bodyIsDark
        ? (secondary?.hex ?? accent?.hex ?? "#ffffff")
        : (primary?.hex   ?? accent?.hex ?? "#000000");

      const backLogoZone = hasLogoRef
        // ── Logo reference provided: integrate + recolor to match palette ──
        ? `LOGO INTEGRATION (upper back, below rear collar): The provided image is the team's uploaded logo. Use its exact shape, proportions, typography, spacing, and icon structure — do not redraw, replace, simplify, or alter the logo design in any way. Integrate it naturally centered below the rear collar, approximately 1.5 inches wide, sublimated/printed into the fabric with realistic lighting and texture. LOGO RECOLOR: Recolor all logo elements to ${backLogoRecolorHex} so the logo reads cleanly against the jersey body (${primary?.hex ?? "body color"}). Apply the new color treatment uniformly across the logo; preserve the original form exactly.`
        // ── No logo reference: leave blank zone ──
        : `APP-COMPOSITED BACK LOGO ZONE (upper back, below rear collar): Leave a clean, completely unmarked flat fabric area approximately 1.5 inches wide centered below the rear collar. Do NOT generate any logo, emblem, or symbol here — this zone may receive a composited logo from the application layer post-generation.`;

      return [
        `BACK JERSEY BRANDING:`,

        backLogoZone,

        // ── Number: AI renders this ──
        `PLAYER NUMBER (dominant element): Render "00" large and centered on the back panel. Style: ${numStyleHint} numerals, approximately 50–55% of back panel height, layered ${outlineColor} outline with white fill, sublimated into the fabric with natural drape wrapping the letterforms. Bold, athletic, authentic basketball hierarchy.`,

        `OPTIONAL BACK IDENTIFIER: Optionally render "${wordmarkName}" in small arched text above the number if design system spacing allows — consistent with front wordmark style at reduced scale.`,
      ].join(" ");
    }

    return "";
  })();

  // ── 8. Branding restrictions (sport + garment type aware) ────────────────
  const mascotPermission = mascotName
    ? `(${mascotName} mascot illustration is PERMITTED and REQUIRED per client brief)`
    : "";

  const brandingRestrictions = isTracksuit
    ? isJersey
      // Jacket: wordmark + logo permitted. No numbers ever.
      ? hasLogoRef
        ? [
            `LOGO FIDELITY: Use ONLY the provided uploaded logo — do not invent or replace it.`,
            `Do NOT render Nike, Adidas, Jordan, Under Armour, or any external brand marks.`,
            `CRITICAL: NO player numbers or numerals anywhere on the jacket. Tracksuits never carry player numbers.`,
            mascotName
              ? `Permitted graphics: (1) team logo in designated zone, (2) team name wordmark, (3) ${mascotName} mascot illustration as specified — nothing else.`
              : `Permitted graphics: (1) team logo in designated zone, (2) team name wordmark — nothing else.`,
          ].join(" ")
        : [
            mascotName ? "" : `Do NOT generate any logo, emblem, badge, crest, or symbol on the jacket.`,
            `Do NOT render Nike, Adidas, Jordan, Under Armour, or any external brand marks.`,
            `CRITICAL: NO player numbers or numerals anywhere on the jacket.`,
            mascotName
              ? `Permitted graphics: team name wordmark text and ${mascotName} mascot illustration — nothing else. ${mascotPermission}`
              : `Permitted graphics: team name wordmark text only — nothing else.`,
          ].filter(Boolean).join(" ")
      // Pants: completely clean — no text, no graphics.
      : `CRITICAL — ABSOLUTELY ZERO on the track pants: text, numbers, logos, brand marks, wordmarks, watermarks, or symbols of any kind. All panels must be completely clean fabric.`
    // Basketball jerseys/shorts (original restrictions):
    : isJersey
      ? hasLogoRef
        ? [
            `LOGO FIDELITY: Use ONLY the provided uploaded logo image exactly as supplied — do not invent, simplify, redraw, or replace it with a different mark.`,
            `Do NOT render Nike, Adidas, Jordan, Under Armour, or any external brand marks.`,
            mascotName
              ? `Permitted graphics on the jersey: (1) the provided uploaded team logo in the chest zone, (2) the team name wordmark text, (3) the player number, (4) ${mascotName} mascot illustration. ${mascotPermission} Everything else must be clean fabric.`
              : `The ONLY graphics permitted on the jersey fabric are: (1) the provided uploaded team logo in the chest zone, (2) the team name wordmark text, and (3) the player number — all specified above. Everything else must be clean fabric.`,
          ].join(" ")
        : [
            mascotName ? "" : `CRITICAL LOGO PROHIBITION: Do NOT render the team's own uploaded logo in any form.`,
            mascotName ? "" : `Do NOT generate any circular emblem, shield, badge, crest, monogram, abstract mark, or symbol that could represent a team logo anywhere on the jersey.`,
            `Do NOT render Nike, Adidas, Jordan, Under Armour, or any external brand marks.`,
            mascotName
              ? `Permitted graphics on the jersey: (1) the team name wordmark text, (2) the player number, (3) ${mascotName} mascot illustration as specified. ${mascotPermission} Everything else must be clean fabric.`
              : `The ONLY graphics permitted on the jersey fabric are: (1) the team name wordmark text, and (2) the player number — both specified above. Everything else must be clean fabric.`,
          ].filter(Boolean).join(" ")
      : `CRITICAL — ABSOLUTELY ZERO on the shorts: text, numbers, logos, brand marks, wordmarks, watermarks, graphic overlays, or symbols of any kind. All panels must be completely clean fabric.`;

  return [
    // ── CLIENT VISION — injected first so it dominates the model's attention ──
    // This must appear before everything else. LLM/image models weight early
    // tokens more heavily; vision notes placed at the top ensure specific
    // details (mascot accessories, style references, era-specific elements)
    // are not overridden by generic construction prompts below.
    !mascotName && visionDirective ? visionDirective : "",

    // ── TRACKSUIT PHILOSOPHY — top-level aesthetic foundation ──
    isTracksuit ? TRACKSUIT_DESIGN_PHILOSOPHY : "",

    // ── TRACKSUIT SYSTEM SPEC (view-specific — jacket rules for jacket, pant rules for pants) ──
    isTracksuit ? (isJersey ? GRACE_TRACKSUIT_SYSTEM_JACKET : GRACE_TRACKSUIT_SYSTEM_PANTS) : "",

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
    isTracksuit
      ? `Rendering: high-end semi-photorealistic 3D apparel render. Nylon/woven technical shell fabric with subtle sheen and realistic folds. Soft studio lighting from upper-left with soft fill. Realistic seam stitching and natural drape. Premium Grace Athletics sportswear campaign quality.`
      : `Rendering: photorealistic semi-3D athletic garment. Performance mesh fabric with visible micro-weave texture. Dimensional studio lighting from upper-left with soft fill from right. Realistic seam stitching, natural fabric drape and weight. Production-accurate Grace Athletics manufacturing quality.`,

    // ── Jersey branding (jerseys only — typography integrated into fabric by AI) ──
    jerseyBranding,

    // ── Restrictions ──
    brandingRestrictions,

    // ── Background ──
    `Background: pure clean white (#ffffff). No cast shadows on background. No floor, no environment. Isolated garment only.`,

    // ── Output ──
    `Output: single isolated garment render on a square canvas. The ENTIRE garment must be fully visible and centered within the frame with comfortable margin on all sides — do not crop, cut off, or let any edge of the garment touch or exceed the frame boundary. Full garment in view, photorealistic premium sportswear quality.`,
  ].filter(Boolean).join("\n\n");
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 5, windowMs: 10 * 60 * 1000 }); // 5 per 10 min per IP
  if (limited) return limited;

  // Require authentication — prevents unauthenticated callers from burning AI credits
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { order_id, design_id, force } = await req.json();
    if (!order_id && !design_id) {
      return NextResponse.json({ error: "order_id or design_id required" }, { status: 400 });
    }

    const bf: BriefFilter = design_id
      ? { field: "design_id", id: design_id as string }
      : { field: "order_id",  id: order_id  as string };

    console.log(`[generate-concepts] Starting (${bf.field}=${bf.id})`);

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Verify the record belongs to the request tenant
    const tenant = await getRequestTenant();
    if (tenant) {
      const table = bf.field === "design_id" ? "designs" : "orders";
      const { data: tenantCheck } = await supabase
        .from(table)
        .select("id")
        .eq("id", bf.id)
        .eq("tenant_id", tenant.id)
        .single();
      if (!tenantCheck) {
        return NextResponse.json({ error: bf.field === "design_id" ? "Design not found" : "Order not found" }, { status: 404 });
      }
    }

    // ── 1. Duplicate-generation guard ─────────────────────────────────────────

    const { data: existingBrief } = await supabase
      .from("briefs")
      .select("ai_prompt")
      .eq(bf.field, bf.id)
      .maybeSingle();

    // On a regenerate, reuse the garment context (sport + design system) from the
    // previously-rendered metadata so the new concept matches the original — never
    // silently fall back to the basketball/bold defaults.
    let priorSport:        string | null = null;
    let priorDesignSystem: string | null = null;

    if (existingBrief?.ai_prompt) {
      try {
        const existing = JSON.parse(existingBrief.ai_prompt as string) as DesignMetadata;
        if (existing.status === "generating" || existing.status === "queued") {
          return NextResponse.json({ status: "already_running" }, { status: 409 });
        }
        // force=true (explicit regenerate) skips the already_completed guard so a
        // new generation run can proceed even when a previous one finished.
        if (existing.status === "completed" && !force) {
          return NextResponse.json({ status: "already_completed" }, { status: 409 });
        }
        if (typeof existing.sport === "string" && existing.sport)               priorSport = existing.sport;
        if (typeof existing.designSystem === "string" && existing.designSystem) priorDesignSystem = existing.designSystem;
        // Back-compat: designs rendered before `sport` was persisted only have a
        // garmentType label — infer the sport from it so a tracksuit regenerate
        // doesn't silently default to basketball.
        if (!priorSport && typeof existing.garmentType === "string") {
          if (/tracksuit/i.test(existing.garmentType)) priorSport = "tracksuits";
          else if (/basketball/i.test(existing.garmentType)) priorSport = "basketball";
        }
      } catch { /* not valid JSON — proceed */ }
    }

    // ── 2. Fetch brief / design-or-order / client ─────────────────────────────

    const { data: brief, error: briefError } = await supabase
      .from("briefs").select("*").eq(bf.field, bf.id).maybeSingle();
    if (briefError || !brief) {
      console.error(`[generate-concepts] Brief not found (${bf.field}=${bf.id}):`, briefError);
      return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    let clientId:    string;
    let orderNumber: string | null = null;
    let tenantId:    string | null = null;

    if (bf.field === "design_id") {
      const { data: design, error: designError } = await supabase
        .from("designs").select("client_id, tenant_id").eq("id", bf.id).single();
      if (designError || !design) {
        return NextResponse.json({ error: "Design not found" }, { status: 404 });
      }
      clientId = design.client_id as string;
      tenantId = (design as { tenant_id?: string }).tenant_id ?? null;
    } else {
      const { data: order, error: orderError } = await supabase
        .from("orders").select("client_id, order_number, tenant_id").eq("id", bf.id).single();
      if (orderError || !order) {
        console.error(`[generate-concepts] Order not found (${bf.id}):`, orderError);
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      clientId    = order.client_id as string;
      orderNumber = (order.order_number as string | null) ?? null;
      tenantId    = (order as { tenant_id?: string }).tenant_id ?? null;
    }

    const { data: client, error: clientError } = await supabase
      .from("clients").select("name, city, sport, email").eq("id", clientId).single();
    if (clientError || !client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Prefer the prior render's garment context on regenerate; otherwise derive
    // from the client/brief, defaulting only when nothing else is available.
    const sport        = priorSport        ?? (client.sport as string)       ?? "basketball";
    const designSystem = priorDesignSystem ?? (brief.design_system as string) ?? "bold";
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

    await saveStatus(supabase, bf, {
      status:      "queued",
      progress:    0,
      total:       4,
      startedAt:   new Date().toISOString(),
      boardFormat: "renders",
      designSystem,
      sport,
    });
    console.log(`[generate-concepts] Marked queued`);

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
      tenant?.name ?? "Grace Athletics",
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
      metadata = { ...parsed, designSystem, sport, boardFormat: "renders" };
    } catch {
      metadata = {
        garmentType:   garmentLabel,
        designSystem,
        sport,
        boardFormat:   "renders",
        colorway:      [],
        materials:     [],
        features:      [],
        logoPlacement: (brief.logo_placement as string) ?? "",
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
    await saveStatus(supabase, bf, {
      ...metadata,
      status:   "generating",
      progress: 0,
      total:    4,
    });

    // ── 10. Generate 4 garment renders sequentially ───────────────────────────
    //   Each render prompt has hex colors at the TOP for maximum model attention.
    //   Progress is saved after each render so the UI can show incremental steps.

    const renders: Partial<Record<RenderViewKey, string>> = {};

    // Primary uploaded logo URL — passed to jersey renders for AI integration
    const primaryLogoUrl: string | null = logoUrls[0] ?? null;

    const isTracksuitSport = sport.toLowerCase() === "tracksuits";

    for (let i = 0; i < RENDER_VIEWS.length; i++) {
      const { key, label } = RENDER_VIEWS[i];

      // Jersey views with a logo URL get the logo passed as an image[] reference
      // to images/edits so the model integrates it naturally into the fabric.
      // Shorts views always use text-to-image (no logo reference needed).
      const isJerseyView = key.includes("Jersey");
      const hasLogoRef   = isJerseyView && !!primaryLogoUrl;

      // For tracksuit jacket views: pass the front-reference.jpeg as a visual
      // construction anchor — gives the model actual visual data for correct
      // windbreaker/nylon construction (open cuffs, clean hems) which text alone
      // cannot reliably override against the model's "jacket" visual priors.
      const garmentRefUrl = (isTracksuitSport && isJerseyView)
        ? `${appUrl}/reference-library/garments/tracksuits/${designSystem}/front-reference.jpeg`
        : null;

      const renderPrompt = buildGarmentPrompt(
        key,
        metadata,
        designSystem,
        teamName,
        brief as Record<string, unknown>,
        hasLogoRef,
        sport,
      );

      console.log(
        `[generate-concepts] rendering ${label} (${i + 1}/4) — logo=${hasLogoRef ? "ref" : "none"} garmentRef=${!!garmentRefUrl} — prompt: ${renderPrompt.slice(0, 120)}…`,
      );

      try {
        const url = await generateGarmentRender(
          renderPrompt,
          supabase,
          bf.id,
          key,
          hasLogoRef ? primaryLogoUrl : null,
          garmentRefUrl,
        );
        renders[key] = url;
        console.log(`[generate-concepts] ${label} done: ${url.slice(0, 80)}`);
      } catch (imgErr: unknown) {
        const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
        console.error(`[generate-concepts] ${label} failed:`, msg);
        await saveStatus(supabase, bf, {
          ...metadata,
          status: "failed",
          error:  `${label} render failed: ${msg}`,
        });
        return NextResponse.json({ error: `${label} render failed`, detail: msg }, { status: 500 });
      }

      // Save progress after each render so UI updates incrementally
      await saveStatus(supabase, bf, {
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
      .eq(bf.field, bf.id);

    // ── 12. Insert concept rows (1 per render view for legacy fallback) ────────

    await supabase.from("concepts").delete().eq(bf.field, bf.id);

    const conceptIdField = bf.field === "design_id" ? "design_id" : "order_id";
    const conceptRows = [
      { [conceptIdField]: bf.id, tenant_id: tenantId, concept_number: 1, image_url: renders.frontJersey!, selected: false },
      { [conceptIdField]: bf.id, tenant_id: tenantId, concept_number: 2, image_url: renders.backJersey!,  selected: false },
      { [conceptIdField]: bf.id, tenant_id: tenantId, concept_number: 3, image_url: renders.frontShorts!, selected: false },
      { [conceptIdField]: bf.id, tenant_id: tenantId, concept_number: 4, image_url: renders.backShorts!,  selected: false },
    ];

    const { error: conceptError } = await supabase.from("concepts").insert(conceptRows);
    if (conceptError) {
      console.warn("[generate-concepts] concept insert warning:", conceptError.message);
    }

    // ── 13. Notify client ─────────────────────────────────────────────────────

    try {
      // Only send concepts-ready email once there's an order (design_id flow has no order yet)
      if (client?.email && bf.field === "order_id") {
        const displayOrderNumber = orderNumber ?? bf.id.slice(0, 8).toUpperCase();
        await sendConceptsReady({
          clientEmail: client.email,
          teamName:    client.name ?? "Client",
          orderNumber: displayOrderNumber,
          orderId:     bf.id,
          tenant: tenant ? { name: tenant.name, brandColor: tenant.brand_primary, adminEmail: tenant.support_email } : undefined,
        });
      }
    } catch (emailErr) {
      console.warn("[generate-concepts] email failed:", emailErr instanceof Error ? emailErr.message : emailErr);
    }

    return NextResponse.json({
      status:      "completed",
      ...(bf.field === "order_id" ? { order_id: bf.id } : { design_id: bf.id }),
      boardFormat: "renders",
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-concepts] error:", message);
    // Best-effort: mark the brief as failed so the client stops polling
    try {
      const { order_id: oid, design_id: did } = await req.clone().json().catch(() => ({})) as { order_id?: string; design_id?: string };
      if (oid || did) {
        const bf: BriefFilter = did ? { field: "design_id", id: did } : { field: "order_id", id: oid! };
        const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
        await saveStatus(sb, bf, { status: "failed", progress: 0, total: 4, error: message });
      }
    } catch { /* ignore — best-effort only */ }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── GET /api/generate-concepts?order_id=<uuid> ───────────────────────────────
// Returns the full compiled prompt for each of the 4 render views — exactly
// what would be sent to OpenAI — without generating any images.
// Use this to review / debug prompt output before burning credits.

export async function GET(req: NextRequest) {
  try {
    const order_id = req.nextUrl.searchParams.get("order_id");
    if (!order_id) {
      return NextResponse.json({ error: "order_id query param required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: brief, error: briefError } = await supabase
      .from("briefs").select("*").eq("order_id", order_id).single();
    if (briefError || !brief) {
      return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    const { data: order } = await supabase
      .from("orders").select("client_id, order_number").eq("id", order_id).single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const { data: client } = await supabase
      .from("clients").select("name, city, sport, email").eq("id", order.client_id).single();
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const tenant = await getRequestTenant();

    const sport        = (client.sport as string) ?? "basketball";
    const designSystem = (brief.design_system as string) ?? "bold";
    const teamName     = (client.name as string) ?? "Team";
    const garmentLabel = getGarmentTypeLabel(sport);

    const directColors  = extractDirectColors(brief as Record<string, unknown>);
    const refs          = resolveReferenceFiles(sport, designSystem);
    const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "https://gs-first-pass.vercel.app";
    const allRefUrls    = getReferenceUrls(refs, appUrl);
    const refAnnotation = buildReferenceAnnotation(refs);

    const logoUrls: string[] = Array.isArray(brief.logo_urls)
      ? (brief.logo_urls as string[]).filter(validUrl)
      : validUrl(brief.logo_url) ? [brief.logo_url as string] : [];

    const clientRefUrls: string[] = Array.isArray(brief.reference_image_urls)
      ? (brief.reference_image_urls as string[]).filter(validUrl)
      : validUrl(brief.reference_image_url) ? [brief.reference_image_url as string] : [];

    const clientAnnotation = [
      logoUrls.length > 0     ? `• ${logoUrls.length} client logo(s) provided` : "",
      clientRefUrls.length > 0 ? `• ${clientRefUrls.length} reference image(s) provided` : "",
    ].filter(Boolean).join("\n");

    const fullAnnotation    = [refAnnotation, clientAnnotation].filter(Boolean).join("\n");
    const designBriefPrompt = buildClaudePrompt(
      brief as Record<string, unknown>,
      client as Record<string, unknown>,
      garmentLabel,
      fullAnnotation,
      directColors,
      tenant?.name ?? "Grace Athletics",
    );

    // ── Run Claude to get metadata (same as production) ────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    type ImageBlock   = { type: "image"; source: { type: "url"; url: string } };
    type TextBlock    = { type: "text"; text: string };
    type ContentBlock = ImageBlock | TextBlock;

    const refImageBlocks: ImageBlock[] = allRefUrls.map(url => ({
      type: "image", source: { type: "url", url },
    }));

    const claudeContent: ContentBlock[] = [
      ...refImageBlocks,
      ...(fullAnnotation ? [{ type: "text" as const, text: fullAnnotation }] : []),
      { type: "text" as const, text: designBriefPrompt },
    ];

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 1500,
      messages: [{ role: "user", content: claudeContent }],
      stream: false,
    });

    const rawText =
      "content" in aiResponse && aiResponse.content[0].type === "text"
        ? aiResponse.content[0].text : "";

    let metadata: DesignMetadata;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      metadata = { ...JSON.parse(cleaned) as DesignMetadata, designSystem, boardFormat: "renders" };
    } catch {
      metadata = {
        garmentType: garmentLabel, designSystem, boardFormat: "renders",
        colorway: [], materials: [], features: [],
        logoPlacement: (brief.logo_placement as string) ?? "",
        description: rawText.slice(0, 400),
      };
    }

    if (directColors.length > 0) {
      metadata.colorway = directColors.map(c => ({ ...c, pantone: undefined }));
    }

    const primaryLogoUrl: string | null = logoUrls[0] ?? null;

    // ── Build all 4 prompts without calling OpenAI ─────────────────────────────
    const isTracksuitSportDebug = sport.toLowerCase() === "tracksuits";
    const prompts: Record<string, string> = {};
    const garmentRefs: Record<string, string | null> = {};
    for (const { key, label } of RENDER_VIEWS) {
      const isJacketView = key.includes("Jersey");
      const hasLogoRef   = isJacketView && !!primaryLogoUrl;
      garmentRefs[label] = (isTracksuitSportDebug && isJacketView)
        ? `${appUrl}/reference-library/garments/tracksuits/${designSystem}/front-reference.jpeg`
        : null;
      prompts[label] = buildGarmentPrompt(
        key, metadata, designSystem, teamName,
        brief as Record<string, unknown>, hasLogoRef, sport,
      );
    }

    return NextResponse.json({
      order_id,
      sport,
      designSystem,
      teamName,
      claudeMetadata: {
        description: metadata.description,
        colorway:    metadata.colorway,
        materials:   metadata.materials,
      },
      garmentRefs,
      prompts,
    }, {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

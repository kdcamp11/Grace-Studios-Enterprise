import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";
import { SupabaseClient } from "@supabase/supabase-js";
import { sendConceptsReady } from "@/lib/email";
import {
  resolveReferenceFiles,
  getGarmentTypeLabel,
  getReferenceUrls,
  buildReferenceAnnotation,
  SYSTEM_VISUAL_LANGUAGE,
  SYSTEM_PROMPT_SHORT,
} from "@/lib/reference-library";

export const maxDuration = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

export type GenerationStatus = "queued" | "generating" | "completed" | "failed";

export interface DesignMetadata {
  status?:    GenerationStatus;
  progress?:  number;   // images completed (0–4)
  total?:     number;   // always 4
  startedAt?: string;
  error?:     string;
  // Design spec fields
  garmentType:    string;
  designSystem?:  string;
  colorway:       { role: string; name: string; hex: string; pantone?: string }[];
  materials:      string[];
  features:       string[];
  logoPlacement:  string;
  description:    string;
  images?: {
    front:   string;
    back:    string;
    detail1: string;
    detail2: string;
  };
}

// ─── View descriptors ─────────────────────────────────────────────────────────

const VIEW_KEYS   = ["front", "back", "detail1", "detail2"] as const;
const VIEW_LABELS = [
  "Front view",
  "Back view",
  "Collar & logo detail",
  "Sleeve & panel detail",
];

// Per-view Replicate prompt suffixes — view-specific render instructions only
const VIEW_SUFFIXES = [
  "full garment front view, ghost mannequin or flat lay, entire garment visible top to bottom, technical product render, dark studio background",
  "full garment back view, ghost mannequin or flat lay, entire garment visible top to bottom, technical product render, dark studio background",
  "close-up product detail: collar neckline and upper chest construction, fabric texture and finish visible, dark studio background",
  "close-up product detail: side panel seam construction, sleeve attachment, or lower hem treatment, dark studio background",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractImageUrl(result: unknown): string {
  const output = result as unknown[];
  const first  = Array.isArray(output) ? output[0] : result;
  return first && typeof (first as { url?: () => string }).url === "function"
    ? (first as { url: () => string }).url()
    : String(first);
}

function validUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("http");
}

/**
 * Calls Replicate for a single image.
 * On 429 reads retry_after and waits, then retries. Max 4 attempts.
 */
async function generateImageWithRetry(
  replicate: Replicate,
  prompt: string,
): Promise<string> {
  const MAX_ATTEMPTS    = 4;
  const DEFAULT_RETRY_MS = 12_000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await replicate.run("black-forest-labs/flux-schnell", {
        input: {
          prompt,
          num_outputs:    1,
          aspect_ratio:   "1:1",
          output_format:  "webp",
          output_quality: 90,
        },
      });
      return extractImageUrl(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") && attempt < MAX_ATTEMPTS) {
        const match        = msg.match(/"retry_after"\s*:\s*(\d+)/);
        const retryAfterMs = match ? parseInt(match[1]) * 1000 : DEFAULT_RETRY_MS;
        console.log(
          `[generate-concepts] 429 — waiting ${retryAfterMs / 1000}s ` +
          `before attempt ${attempt + 1}/${MAX_ATTEMPTS}`,
        );
        await sleep(retryAfterMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error("Exceeded max retry attempts for Replicate image generation");
}

/** Merge-patch briefs.ai_prompt — preserves fields set in earlier steps. */
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
 * Builds the Claude system design request.
 *
 * This prompt is now REFERENCE-DRIVEN:
 *   1. Reference images are passed alongside this text (see POST handler).
 *   2. The design system's visual language is the authoritative spec.
 *   3. Logo handling is explicitly constrained — no logo invention.
 *   4. The `description` field Claude writes is used directly as the Replicate base prompt.
 */
function buildClaudePrompt(
  brief:          Record<string, unknown>,
  client:         Record<string, unknown>,
  garmentLabel:   string,
  referenceAnnotation: string,
): string {
  const designSystem = (brief.design_system as string) ?? "bold";
  const sport        = (client.sport as string) ?? "basketball";
  const teamName     = (client.name  as string) ?? "the team";
  const city         = (client.city  as string) ?? "";
  const construction = brief.sublimated === true
    ? "Sublimated (full-color dye into fabric, unlimited complexity)"
    : brief.sublimated === false
    ? "Tackle Twill (stitched letters and numbers, classic durable finish)"
    : "Sublimated";
  const cut             = (brief.jersey_cut as string)       ?? "standard";
  const numberStyle     = brief.number_style                 ? `Number style: ${brief.number_style}.` : "";
  const logosToInclude  = brief.logos_to_include             ? `Additional logos required: ${brief.logos_to_include}.` : "";
  const sponsorText     = brief.sponsor_text                 ? `Sponsor text/patch: ${brief.sponsor_text}.` : "";
  const negative        = brief.negative_references          ? `AVOID: ${brief.negative_references}.` : "";
  const vision          = brief.vision_prompt                ? `Client vision note: ${brief.vision_prompt}` : "";

  const logoUrls: string[] = Array.isArray(brief.logo_urls)
    ? (brief.logo_urls as string[]).filter(validUrl)
    : validUrl(brief.logo_url) ? [brief.logo_url as string] : [];

  const colorInstruction = logoUrls.length > 0
    ? "EXTRACT the team's exact primary and secondary colors from the uploaded team logo(s). Return the precise hex codes you see — do not invent colors."
    : brief.primary_colors
    ? `PRIMARY COLOR: ${brief.primary_colors}. SECONDARY COLOR: ${brief.secondary_colors ?? "contrasting"}. Use these exact colors.`
    : "Choose a strong sport-appropriate palette. Return precise hex codes.";

  const logoHandlingRules = logoUrls.length > 0
    ? `
LOGO HANDLING — CRITICAL CONSTRAINT:
Team logos are LOCKED REFERENCE ASSETS uploaded by the client.
You MUST NOT: redraw logos, invent logos, reinterpret logos, change typography, change proportions, describe logo artwork in detail.
In your description field write ONLY the placement zone: "Clean logo application zone — [size] on [location]".
The logo will be composited in production. Leave the zone as a clean area.`
    : `
LOGO ZONES:
Specify clean empty logo placement zones in the description.
Write "Clean logo application zone — [size] on [location]" for each logo position.
Do not invent or describe any logo artwork.`;

  const systemLanguage = SYSTEM_VISUAL_LANGUAGE[designSystem] ?? SYSTEM_VISUAL_LANGUAGE.bold;

  return `You are a senior sportswear technical designer at Grace Athletics creating a controlled apparel spec board.

═══ REFERENCE IMAGES PROVIDED ═══
${referenceAnnotation || "No system reference images loaded — use design system spec below."}

═══ DESIGN SYSTEM AUTHORITY ═══
System: ${designSystem.toUpperCase()}
Visual language (follow exactly — do not blend systems):
${systemLanguage}

═══ PROJECT SPECIFICATION ═══
Client: ${teamName}, ${city}
Sport: ${sport}
Garment: ${garmentLabel}
Construction: ${construction}
Cut: ${cut}
${numberStyle} ${logosToInclude} ${sponsorText}
GS Logo placement: ${(brief.gs_logo_placement as string) ?? "chest"}
${negative}
${vision}

═══ COLOR AUTHORITY ═══
${colorInstruction}

${logoHandlingRules}

═══ OUTPUT RULES ═══
• Follow the spec-board reference layout exactly — your JSON populates that structure
• The "description" field is used as a controlled Replicate image generation prompt — write it as a precise technical render directive, NOT prose
• In description: specify colors by hex, describe panel positions and angles by geometry, DO NOT invent logos
• features[] must reflect the ${designSystem} system's construction language — 4–6 short labels
• materials[] should list realistic performance fabric specs for the garment type

Return ONLY valid JSON — no markdown fences, no explanation:
{
  "garmentType": "${garmentLabel}",
  "colorway": [
    {"role": "Primary",   "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"},
    {"role": "Secondary", "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"},
    {"role": "Accent",    "name": "color name", "hex": "#xxxxxx"}
  ],
  "materials": [
    "Shell: 100% Recycled Polyester Mesh",
    "Weight: 110 GSM",
    "Finish: Sublimated all-over print"
  ],
  "features": [
    "4–6 short design-system-specific feature labels, e.g. 'Diagonal chest panel cut'",
    "Each label derived from the ${designSystem} system visual language"
  ],
  "logoPlacement": "One precise sentence: Grace Athletics logo placement on the garment",
  "description": "RENDER DIRECTIVE (max 80 words): Describe the garment as a controlled technical render spec. Include: exact hex colors, panel geometry and angles, key graphic elements of the ${designSystem} system, logo zone location only (no artwork). This text is fed directly into an image model — write for accuracy and control, not for a human reader."
}`.trim();
}

// ─── Replicate prompt builder ─────────────────────────────────────────────────

/**
 * Builds a tightly controlled Replicate/FLUX prompt for one view.
 *
 * Structure: garment identity → design system → colors → key visual → logo zone → view
 * Kept under ~80 tokens to stay in FLUX's effective attention window.
 */
function buildReplicatePrompt(
  metadata:     DesignMetadata,
  designSystem: string,
  viewSuffix:   string,
): string {
  const system = designSystem.toLowerCase();

  // Top 3 colors as "role hex" pairs
  const colorStr = metadata.colorway
    .slice(0, 3)
    .map((c) => `${c.role.toLowerCase()} ${c.hex}`)
    .join(", ");

  // Short design-system descriptor
  const systemShort = SYSTEM_PROMPT_SHORT[system] ?? SYSTEM_PROMPT_SHORT["bold"];

  // Logo zone — no artwork, just a clean zone marker
  const logoZoneRaw = metadata.logoPlacement
    ? metadata.logoPlacement.split(".")[0].replace(/grace athletics/gi, "").trim().slice(0, 80)
    : "upper chest";
  const logoZone = `clean empty logo zone on ${logoZoneRaw}, no logos rendered, no text in placement area`;

  // Primary render description from Claude (trimmed to first 2 sentences for FLUX focus)
  const descSentences = (metadata.description ?? "")
    .split(/\.\s+/)
    .slice(0, 2)
    .join(". ")
    .trim()
    .slice(0, 200);

  return [
    `professional apparel product render, ${metadata.garmentType}`,
    `${system} design system: ${systemShort}`,
    colorStr ? `colors ${colorStr}` : "",
    descSentences,
    logoZone,
    viewSuffix,
    "product photography, no model, no background objects, no watermarks, no text overlays",
  ]
    .filter(Boolean)
    .join(". ");
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
    // Protects against React Strict Mode double-fire, button spam, and refreshes.

    const { data: existingBrief } = await supabase
      .from("briefs")
      .select("ai_prompt")
      .eq("order_id", order_id)
      .single();

    if (existingBrief?.ai_prompt) {
      try {
        const existing = JSON.parse(existingBrief.ai_prompt as string) as DesignMetadata;
        if (existing.status === "generating" || existing.status === "queued") {
          console.log(`[generate-concepts] already running for ${order_id} — rejecting duplicate`);
          return NextResponse.json({ status: "already_running" }, { status: 409 });
        }
        if (existing.status === "completed") {
          console.log(`[generate-concepts] already completed for ${order_id} — rejecting duplicate`);
          return NextResponse.json({ status: "already_completed" }, { status: 409 });
        }
      } catch { /* ai_prompt not valid JSON — proceed */ }
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
    const garmentLabel = getGarmentTypeLabel(sport);

    // ── 3. Resolve reference library files ────────────────────────────────────

    const refs           = resolveReferenceFiles(sport, designSystem);
    const appUrl         = process.env.NEXT_PUBLIC_APP_URL ?? "https://gs-first-pass.vercel.app";
    const refLibraryUrls = getReferenceUrls(refs, appUrl);
    const refAnnotation  = buildReferenceAnnotation(refs);

    console.log(
      `[generate-concepts] ${sport}/${designSystem} — ` +
      `reference files: ${refLibraryUrls.length} loaded ` +
      `(specBoard:${!!refs.specBoard} front:${!!refs.front} back:${!!refs.back})`,
    );

    // ── 4. Mark as queued ─────────────────────────────────────────────────────

    await saveStatus(supabase, order_id, {
      status:       "queued",
      progress:     0,
      total:        4,
      startedAt:    new Date().toISOString(),
      designSystem,
    });

    // ── 5. Build Claude content blocks ────────────────────────────────────────
    //
    // Block order (important — we annotate these positions in the prompt):
    //   1. Reference library images (spec-board, front, back, details)
    //   2. Client-uploaded logo images
    //   3. Client-uploaded inspiration/reference images
    //   4. Text: annotation of what each image is
    //   5. Text: main design brief prompt

    type ImageBlock   = { type: "image"; source: { type: "url"; url: string } };
    type TextBlock    = { type: "text"; text: string };
    type ContentBlock = ImageBlock | TextBlock;

    const logoUrls: string[] = Array.isArray(brief.logo_urls)
      ? (brief.logo_urls as string[]).filter(validUrl)
      : validUrl(brief.logo_url) ? [brief.logo_url as string] : [];

    const clientRefUrls: string[] = Array.isArray(brief.reference_image_urls)
      ? (brief.reference_image_urls as string[]).filter(validUrl)
      : validUrl(brief.reference_image_url) ? [brief.reference_image_url as string] : [];

    // Cap total images: reference library (up to 5) + client uploads (up to 14 = 19 max for Claude)
    const maxClientImages = 19 - refLibraryUrls.length;
    const allClientUrls   = [...logoUrls, ...clientRefUrls].slice(0, maxClientImages);

    const refLibraryBlocks: ImageBlock[] = refLibraryUrls.map((url) => ({
      type: "image",
      source: { type: "url", url },
    }));

    const clientImageBlocks: ImageBlock[] = allClientUrls.map((url) => ({
      type: "image",
      source: { type: "url", url },
    }));

    // Annotation for client-uploaded images (appended to refAnnotation)
    const clientAnnotation = [
      logoUrls.length > 0
        ? `• Next ${logoUrls.length} image(s): CLIENT TEAM LOGOS — these are LOCKED REFERENCE ASSETS. Extract exact colors only. Do NOT redraw, reinterpret, or describe logo artwork. Write "logo zone" in the description field only.`
        : "",
      clientRefUrls.length > 0
        ? `• Final ${clientRefUrls.length} image(s): CLIENT INSPIRATION REFERENCES — use for aesthetic direction and mood only, do not copy directly.`
        : "",
    ].filter(Boolean).join("\n");

    const fullAnnotation = [refAnnotation, clientAnnotation].filter(Boolean).join("\n");

    const designBriefPrompt = buildClaudePrompt(brief, client, garmentLabel, fullAnnotation);

    const claudeContent: ContentBlock[] = [
      ...refLibraryBlocks,
      ...clientImageBlocks,
      ...(fullAnnotation ? [{ type: "text" as const, text: fullAnnotation }] : []),
      { type: "text" as const, text: designBriefPrompt },
    ];

    // ── 6. Call Claude ────────────────────────────────────────────────────────

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

    // ── 7. Parse metadata ─────────────────────────────────────────────────────

    let metadata: DesignMetadata;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed  = JSON.parse(cleaned) as DesignMetadata;
      if (typeof parsed.description !== "string") throw new Error("invalid shape");
      metadata = { ...parsed, designSystem };
    } catch {
      // Fallback if Claude returns malformed JSON
      metadata = {
        garmentType:   garmentLabel,
        designSystem,
        colorway:      [],
        materials:     [],
        features:      [],
        logoPlacement: (brief.gs_logo_placement as string) ?? "",
        description:   rawText,
      };
    }

    // Save metadata with generating status so status endpoint can serve it
    await saveStatus(supabase, order_id, {
      ...metadata,
      status:   "generating",
      progress: 0,
      total:    4,
      images:   { front: "", back: "", detail1: "", detail2: "" },
    });

    // ── 8. Generate images SEQUENTIALLY — one at a time with 429 retry ────────

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    const imageUrls: string[]                  = [];
    const collectedImages: Record<string, string> = {
      front: "", back: "", detail1: "", detail2: "",
    };

    for (let i = 0; i < VIEW_SUFFIXES.length; i++) {
      const replicatePrompt = buildReplicatePrompt(metadata, designSystem, VIEW_SUFFIXES[i]);

      console.log(
        `[generate-concepts] image ${i + 1}/4 (${VIEW_LABELS[i]}) — ` +
        `system: ${designSystem}, prompt length: ${replicatePrompt.length}`,
      );

      try {
        const url = await generateImageWithRetry(replicate, replicatePrompt);
        imageUrls.push(url);
        collectedImages[VIEW_KEYS[i]] = url;

        await saveStatus(supabase, order_id, {
          ...metadata,
          status:   "generating",
          progress: i + 1,
          total:    4,
          images:   { ...collectedImages } as DesignMetadata["images"],
        });

        console.log(`[generate-concepts] image ${i + 1}/4 saved`);
      } catch (imgErr: unknown) {
        const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
        console.error(`[generate-concepts] image ${i + 1}/4 failed:`, msg);
        await saveStatus(supabase, order_id, {
          ...metadata,
          status: "failed",
          error:  `Image ${i + 1} (${VIEW_LABELS[i]}) failed: ${msg}`,
          images: { ...collectedImages } as DesignMetadata["images"],
        });
        return NextResponse.json(
          { error: `Image generation failed at step ${i + 1}`, detail: msg },
          { status: 500 },
        );
      }
    }

    // ── 9. Mark completed ─────────────────────────────────────────────────────

    const finalMetadata: DesignMetadata = {
      ...metadata,
      status:   "completed",
      progress: 4,
      total:    4,
      images: {
        front:   imageUrls[0] ?? "",
        back:    imageUrls[1] ?? "",
        detail1: imageUrls[2] ?? "",
        detail2: imageUrls[3] ?? "",
      },
    };

    await supabase
      .from("briefs")
      .update({ ai_prompt: JSON.stringify(finalMetadata) })
      .eq("order_id", order_id);

    // ── 10. Insert concept rows ───────────────────────────────────────────────

    const conceptRows = imageUrls.map((url, i) => ({
      order_id,
      concept_number: i + 1,
      image_url:      url,
      selected:       false,
    }));

    const { error: conceptError } = await supabase
      .from("concepts")
      .insert(conceptRows);

    if (conceptError) {
      return NextResponse.json(
        { error: "Failed to save concepts", detail: conceptError.message },
        { status: 500 },
      );
    }

    // ── 11. Notify client ─────────────────────────────────────────────────────

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
      console.warn(
        "[generate-concepts] Email notification failed:",
        emailErr instanceof Error ? emailErr.message : emailErr,
      );
    }

    return NextResponse.json({
      status:       "completed",
      order_id,
      concepts:     conceptRows.length,
      designSystem,
      refsLoaded:   refLibraryUrls.length,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-concepts] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

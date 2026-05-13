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
  SYSTEM_PROMPT_SHORT,
} from "@/lib/reference-library";

export const maxDuration = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

export type GenerationStatus = "queued" | "generating" | "completed" | "failed";

export interface DesignMetadata {
  status?:    GenerationStatus;
  progress?:  number;   // 0 or 1
  total?:     number;   // always 1 for spec-board format
  startedAt?: string;
  error?:     string;
  /** "specboard" = single complete spec-board image (current)
   *  "multiview" = legacy 4-image format */
  boardFormat?: "specboard" | "multiview";
  /** URL of the single spec-board image (boardFormat === "specboard") */
  boardImage?:  string;
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
 * Generates the spec-board image via the Replicate REST API directly.
 *
 * Bypasses replicate.run() / the SDK's SSE streaming layer entirely — the
 * eventsource-parser vendored in the SDK throws "s.slice is not a function"
 * in the Vercel runtime. Instead we POST to create a prediction, then poll
 * until succeeded/failed. Max 4 create attempts on 429; poll timeout 4 min.
 */
async function generateSpecBoard(prompt: string): Promise<string> {
  const token = process.env.REPLICATE_API_TOKEN!;
  const MODEL = "black-forest-labs/flux-schnell";
  const MAX_ATTEMPTS     = 4;
  const DEFAULT_RETRY_MS = 12_000;
  const POLL_INTERVAL_MS = 3_000;
  const POLL_TIMEOUT_MS  = 240_000;   // 4 min

  let predictionId: string | null = null;

  // ── 1. Create prediction (retry on 429) ──────────────────────────────────
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type":  "application/json",
        "Prefer":        "wait=5",   // short server-side wait, avoids extra polls
      },
      body: JSON.stringify({
        input: {
          prompt,
          num_outputs:    1,
          aspect_ratio:   "4:3",
          output_format:  "webp",
          output_quality: 90,
        },
      }),
    });

    if (res.status === 429) {
      if (attempt >= MAX_ATTEMPTS) throw new Error("Replicate rate limit — max retries exceeded");
      const body        = await res.json().catch(() => ({})) as Record<string, unknown>;
      const retryAfterMs = typeof body.retry_after === "number"
        ? body.retry_after * 1000
        : DEFAULT_RETRY_MS;
      console.log(`[generate-concepts] 429 — waiting ${retryAfterMs / 1000}s (attempt ${attempt})`);
      await sleep(retryAfterMs);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Replicate create prediction failed (${res.status}): ${text}`);
    }

    const data = await res.json() as { id: string; status: string; output?: unknown; error?: string };

    // "Prefer: wait" may return a completed prediction immediately
    if (data.status === "succeeded" && data.output) {
      return extractImageUrl(data.output);
    }
    if (data.status === "failed") {
      throw new Error(`Replicate prediction failed immediately: ${data.error ?? "unknown"}`);
    }

    predictionId = data.id;
    break;
  }

  if (!predictionId) throw new Error("Failed to obtain Replicate prediction ID");

  // ── 2. Poll until done ───────────────────────────────────────────────────
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const poll = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Bearer ${token}` },
    });

    if (!poll.ok) {
      console.warn(`[generate-concepts] poll ${predictionId} returned ${poll.status}`);
      continue;
    }

    const data = await poll.json() as { status: string; output?: unknown; error?: string };

    if (data.status === "succeeded" && data.output) {
      return extractImageUrl(data.output);
    }
    if (data.status === "failed") {
      throw new Error(`Replicate prediction failed: ${data.error ?? "unknown"}`);
    }
    if (data.status === "canceled") {
      throw new Error("Replicate prediction was canceled");
    }
    // still processing — keep polling
  }

  throw new Error("Replicate prediction timed out after 4 minutes");
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
 * Reference images are passed as separate image blocks (see POST handler).
 * This text prompt is REFERENCE-DRIVEN: Claude is shown the exact spec-board
 * reference and must output metadata + a controlled Replicate render directive.
 *
 * The `description` field Claude returns is used verbatim as the Replicate prompt
 * (prefixed with the spec-board structural framing).
 */
function buildClaudePrompt(
  brief:               Record<string, unknown>,
  client:              Record<string, unknown>,
  garmentLabel:        string,
  referenceAnnotation: string,
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

  const colorInstruction = logoUrls.length > 0
    ? "EXTRACT the team's exact primary and secondary colors from the uploaded logo(s). Return precise hex codes — do not guess or invent."
    : brief.primary_colors
    ? `Use these exact client-specified colors — PRIMARY: ${brief.primary_colors}, SECONDARY: ${brief.secondary_colors ?? "contrasting"}.`
    : "Choose a strong sport-appropriate palette. Return precise hex codes.";

  const logoRule = logoUrls.length > 0
    ? `LOGO ZONE RULE: Team logos are uploaded LOCKED ASSETS. Do NOT describe logo artwork in the description field. Write ONLY "Clean logo zone — [size] on [location]". The logo is composited in production.`
    : `LOGO ZONE RULE: Describe clean empty logo placement zones only. Write "Clean logo zone — [size] on [location]". Do not generate or describe any logo artwork.`;

  const systemLanguage = SYSTEM_VISUAL_LANGUAGE[designSystem] ?? SYSTEM_VISUAL_LANGUAGE.bold;

  return `You are a senior sportswear designer at Grace Athletics analyzing a brief to produce a controlled spec-board output.

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
  "description": "GARMENT DESIGN DIRECTIVE (max 80 words): Describe ONLY the jersey and shorts design — not the layout. Include: (1) exact hex colors for each panel zone, (2) panel geometry and angles following the ${designSystem} system visual language, (3) key construction details (side panels, collar, waistband style), (4) one sentence: 'Clean logo zone on [location]' — no logo artwork. This text is used inside a larger spec-board prompt. Be precise and technical. No storytelling."
}`.trim();
}

// ─── Spec-board Replicate prompt builder ──────────────────────────────────────

/**
 * Builds the COMPLETE Replicate prompt for the spec-board image.
 *
 * Because we use flux-schnell (text-to-image), the LAYOUT must be described
 * explicitly in the prompt. The structure mirrors the Grace Athletics basketball
 * spec-board reference exactly:
 *   LEFT COLUMN:  brand header, team name, colorway swatches, material, features, logo
 *   CENTER (2×2): jersey front/back, shorts front/back — flat ghost mannequin
 *   RIGHT COLUMN: 5 detail callout boxes (collar, logo zone, side panel, vent, waistband)
 */
function buildSpecBoardPrompt(
  metadata:     DesignMetadata,
  designSystem: string,
  teamName:     string,
): string {
  const system = designSystem.toLowerCase();

  // Color string: e.g. "primary #1A3055, secondary #C41230, accent #FFFFFF"
  const colors = metadata.colorway
    .slice(0, 3)
    .map((c) => `${c.role.toLowerCase()} ${c.hex}`)
    .join(", ");

  const systemShort = SYSTEM_PROMPT_SHORT[system] ?? SYSTEM_PROMPT_SHORT["bold"];

  // Claude's garment design directive (≤80 words of controlled design description)
  const garmentDesc = (metadata.description ?? "").slice(0, 350);

  // Logo zone label (strip "grace athletics" prefix, keep just placement location)
  const logoZoneRaw = (metadata.logoPlacement ?? "upper chest")
    .replace(/grace athletics/gi, "").replace(/\./g, "").trim().slice(0, 60) || "upper chest";

  return [
    // Document type + team identity
    `professional basketball uniform technical specification board, ${teamName} program`,

    // Explicit three-column layout — FLUX needs this spelled out since there's no init image
    "off-white background, three-column grid layout matching a Nike or Adidas apparel tech pack",
    "LEFT COLUMN narrow: GRACE ATHLETICS brand header, team program name, three color swatches labeled PRIMARY SECONDARY ACCENT with Pantone codes, MATERIAL specifications list three lines, FEATURES bullet list eight items, LOGO section with Grace Athletics brand mark zone",
    "CENTER SECTION wide: four basketball garment flat renders in 2-by-2 grid arrangement. Top row left basketball jersey front view, top row right basketball jersey back view. Bottom row left basketball shorts front view, bottom row right basketball shorts back view. All garments ghost mannequin flat lay technical illustration style. No people wearing garments",
    "RIGHT COLUMN narrow: five stacked rectangular labeled detail callout boxes. Box one RIB KNIT COLLAR closeup. Box two LOGO PRINT zone. Box three SIDE PANEL DETAIL seam closeup. Box four SIDE VENT DETAIL. Box five ELASTIC WAIST WITH DRAWCORD closeup",

    // Design content
    `${system} design system: ${systemShort}`,
    colors ? `garment colors: ${colors}` : "",
    garmentDesc,

    // Hard constraints
    `clean empty logo zone on ${logoZoneRaw}, no logos generated, no Nike swoosh, no Jordan jumpman, no Adidas stripes, no brand hallucinations, no invented sponsor marks`,
    "flat technical vector-style garment illustrations, clean precise lines, apparel manufacturer quality, no cinematic lighting, no people, no lifestyle photography, subtle drop shadow only",
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

    // ── 3. Resolve reference library (used by Claude, not Replicate) ────────────
    //   Reference images are passed to Claude so it can analyze the spec-board
    //   layout and write a controlled garment description. Replicate uses
    //   text-to-image only (flux-schnell) — the layout is encoded in the prompt.

    const refs          = resolveReferenceFiles(sport, designSystem);
    const appUrl        = process.env.NEXT_PUBLIC_APP_URL ?? "https://gs-first-pass.vercel.app";
    const allRefUrls    = getReferenceUrls(refs, appUrl);
    const refAnnotation = buildReferenceAnnotation(refs);

    console.log(
      `[generate-concepts] ${sport}/${designSystem} — ` +
      `refs for Claude: ${allRefUrls.length} (specBoard: ${!!refs.specBoard})`,
    );

    // ── 4. Mark queued ────────────────────────────────────────────────────────

    await saveStatus(supabase, order_id, {
      status:      "queued",
      progress:    0,
      total:       1,
      startedAt:   new Date().toISOString(),
      boardFormat: "specboard",
      designSystem,
    });

    // ── 5. Build Claude content blocks ────────────────────────────────────────

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
        ? `• Next ${logoUrls.length} image(s): CLIENT LOGOS — LOCKED ASSETS. Extract colors only. Do NOT describe logo artwork in the description field. Write logo zones only.`
        : "",
      clientRefUrls.length > 0
        ? `• Final ${clientRefUrls.length} image(s): CLIENT REFERENCES — aesthetic direction only.`
        : "",
    ].filter(Boolean).join("\n");

    const fullAnnotation = [refAnnotation, clientAnnotation].filter(Boolean).join("\n");
    const designBriefPrompt = buildClaudePrompt(brief, client, garmentLabel, fullAnnotation);

    const claudeContent: ContentBlock[] = [
      ...refImageBlocks,
      ...clientImageBlocks,
      ...(fullAnnotation ? [{ type: "text" as const, text: fullAnnotation }] : []),
      { type: "text" as const, text: designBriefPrompt },
    ];

    // ── 6. Call Claude — get structured metadata ──────────────────────────────

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

    // ── 7. Parse Claude metadata ──────────────────────────────────────────────

    let metadata: DesignMetadata;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed  = JSON.parse(cleaned) as DesignMetadata;
      if (typeof parsed.description !== "string") throw new Error("invalid shape");
      metadata = { ...parsed, designSystem, boardFormat: "specboard" };
    } catch {
      metadata = {
        garmentType:   garmentLabel,
        designSystem,
        boardFormat:   "specboard",
        colorway:      [],
        materials:     [],
        features:      [],
        logoPlacement: (brief.gs_logo_placement as string) ?? "",
        description:   rawText.slice(0, 400),
      };
    }

    // Mark generating so the status endpoint shows in-progress state
    await saveStatus(supabase, order_id, {
      ...metadata,
      status:   "generating",
      progress: 0,
      total:    1,
    });

    // ── 8. Build the Replicate spec-board prompt ──────────────────────────────

    const replicatePrompt = buildSpecBoardPrompt(metadata, designSystem, teamName);
    console.log(`[generate-concepts] Replicate prompt (${replicatePrompt.length} chars): ${replicatePrompt.slice(0, 120)}…`);

    // ── 9. Generate the single spec-board image ───────────────────────────────

    let boardImageUrl: string;
    try {
      boardImageUrl = await generateSpecBoard(replicatePrompt);
      console.log(`[generate-concepts] spec-board generated: ${boardImageUrl.slice(0, 80)}`);
    } catch (imgErr: unknown) {
      const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
      console.error("[generate-concepts] spec-board generation failed:", msg);
      await saveStatus(supabase, order_id, {
        ...metadata,
        status: "failed",
        error:  `Spec-board generation failed: ${msg}`,
      });
      return NextResponse.json({ error: "Spec-board generation failed", detail: msg }, { status: 500 });
    }

    // ── 10. Mark completed ────────────────────────────────────────────────────

    const finalMetadata: DesignMetadata = {
      ...metadata,
      status:      "completed",
      progress:    1,
      total:       1,
      boardFormat: "specboard",
      boardImage:  boardImageUrl,
    };

    await supabase
      .from("briefs")
      .update({ ai_prompt: JSON.stringify(finalMetadata) })
      .eq("order_id", order_id);

    // ── 11. Insert single concept row ─────────────────────────────────────────

    const { error: conceptError } = await supabase
      .from("concepts")
      .insert({
        order_id,
        concept_number: 1,
        image_url:      boardImageUrl,
        selected:       false,
      });

    if (conceptError) {
      return NextResponse.json(
        { error: "Failed to save concept", detail: conceptError.message },
        { status: 500 },
      );
    }

    // ── 12. Notify client ─────────────────────────────────────────────────────

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
      boardFormat: "specboard",
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-concepts] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

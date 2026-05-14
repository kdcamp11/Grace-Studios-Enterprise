import { NextRequest, NextResponse } from "next/server";
import fs   from "fs";
import path from "path";
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("http");
}

/**
 * Generates a single premium spec-board image via OpenAI gpt-image-1.
 *
 * PRIMARY MODE — image/edits with spec-board reference:
 *   Loads the Grace Athletics basketball spec-board reference image from disk
 *   and passes it to the gpt-image-1 edits endpoint. The reference provides
 *   the EXACT composition template (three-column grid, 2×2 garment layout,
 *   detail callout column). The prompt populates it with the team's design.
 *
 * FALLBACK MODE — image/generations (text-to-image):
 *   Used when the reference file is not found. Full layout described in prompt.
 *
 * Output is uploaded to Supabase Storage (bucket: "concepts") and the
 * public URL is returned.
 */
async function generateSpecBoard(
  prompt:   string,
  supabase: SupabaseClient,
  orderId:  string,
): Promise<string> {
  const apiKey       = process.env.OPENAI_API_KEY!;
  const MAX_ATTEMPTS = 4;
  const RETRY_MS     = 15_000;

  // ── Locate spec-board reference on disk ──────────────────────────────────
  const REF_CANDIDATES = [
    path.join(process.cwd(), "public", "reference", "Sport", "Basketball", "Basketball Spec Board", "basketball spec board.jpeg"),
    path.join(process.cwd(), "public", "reference", "Sport", "Basketball", "Basketball Spec Board", "basketball spec board.jpg"),
    path.join(process.cwd(), "public", "reference", "spec-board-reference.jpeg"),
    path.join(process.cwd(), "public", "reference", "spec-board-reference.jpg"),
  ];
  const refFilePath = REF_CANDIDATES.find(p => fs.existsSync(p)) ?? null;
  console.log(`[generate-concepts] spec-board reference: ${refFilePath ? "found" : "not found — text-to-image fallback"}`);

  // ── 1. Call OpenAI (edits if ref available, generations otherwise) ────────
  let b64: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;

    if (refFilePath) {
      // ── Image edits: reference drives the composition template ────────────
      const imgBuffer = fs.readFileSync(refFilePath);
      const mime      = refFilePath.endsWith(".png") ? "image/png" : "image/jpeg";
      const fname     = refFilePath.endsWith(".png") ? "reference.png" : "reference.jpg";

      const form = new FormData();
      form.append("model",   "gpt-image-1");
      form.append("image",   new Blob([imgBuffer], { type: mime }), fname);
      form.append("prompt",  prompt);
      form.append("n",       "1");
      form.append("size",    "1536x1024");
      form.append("quality", "high");

      res = await fetch("https://api.openai.com/v1/images/edits", {
        method:  "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body:    form,
      });
    } else {
      // ── Text-to-image fallback ────────────────────────────────────────────
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          model:         "gpt-image-1",
          prompt,
          n:             1,
          size:          "1536x1024",
          quality:       "high",
          output_format: "png",
        }),
      });
    }

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt >= MAX_ATTEMPTS) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`OpenAI spec-board generation failed (${res.status}): ${text}`);
      }
      console.log(`[generate-concepts] OpenAI ${res.status} — waiting ${RETRY_MS / 1000}s (attempt ${attempt})`);
      await sleep(RETRY_MS);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI spec-board generation failed (${res.status}): ${text}`);
    }

    const json = await res.json() as { data: { b64_json?: string }[] };
    b64 = json.data?.[0]?.b64_json ?? null;
    if (!b64) throw new Error("OpenAI returned no image data");
    break;
  }

  if (!b64) throw new Error("OpenAI spec-board generation produced no output");

  // ── 2. Upload PNG buffer to Supabase Storage ──────────────────────────────
  const buffer   = Buffer.from(b64, "base64");
  const bucket   = "concepts";
  const filePath = `${orderId}/spec-board-${Date.now()}.png`;

  await supabase.storage.createBucket(bucket, { public: true }).catch(() => {/* already exists */});

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: "image/png",
      upsert:      true,
    });

  if (uploadError) throw new Error(`Supabase storage upload failed: ${uploadError.message}`);

  // ── 3. Return public URL ─────────────────────────────────────────────────
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
 * Reference images are passed as separate image blocks (see POST handler).
 * This text prompt is REFERENCE-DRIVEN: Claude is shown the exact spec-board
 * reference and must output metadata + a controlled image-generation directive.
 *
 * The `description` field Claude returns is used verbatim as the OpenAI image prompt
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
  "description": "SPEC-BOARD RENDER DIRECTIVE (max 100 words): Describe the basketball uniform design for a premium spec-board render. Structure it as: (1) JERSEY — exact hex for each zone (body, panels, collar, trim), panel geometry following the ${designSystem} visual language (diagonal cut angles, side panel widths, yoke line positions), collar style, (2) SHORTS — hex for each zone, waistband construction (elastic with drawcord or covered elastic), side panel matching jersey geometry, (3) FABRIC TEXTURE — mesh zones, sublimated or tackle-twill, (4) RENDERING STYLE — semi-3D, realistic athletic fabric, dimensional lighting. No layout text. No logos. No numbers. Be precise and technical."
}`.trim();
}

// ─── Spec-board prompt builder ────────────────────────────────────────────────

/**
 * Builds the prompt sent to OpenAI gpt-image-1.
 *
 * PRIMARY PATH (image/edits): the spec-board reference image is provided as
 * the composition template. The prompt instructs the model to POPULATE that
 * exact three-column structure with the team's design — preserving grid
 * proportions, column layout, and detail callout boxes.
 *
 * FALLBACK PATH (image/generations): the same prompt is used but prefixed
 * with an explicit three-column layout description.
 *
 * ALL user inputs from the brief are included: colors (extracted from logos
 * or selected chips), design system, construction, number style, sponsor text.
 */
function buildSpecBoardPrompt(
  metadata:     DesignMetadata,
  designSystem: string,
  teamName:     string,
  brief:        Record<string, unknown>,
): string {
  const system      = designSystem.toLowerCase();
  const systemShort = SYSTEM_PROMPT_SHORT[system] ?? SYSTEM_PROMPT_SHORT["bold"];
  const systemFull  = SYSTEM_VISUAL_LANGUAGE[system] ?? SYSTEM_VISUAL_LANGUAGE.bold;

  // ── Colorway ──────────────────────────────────────────────────────────────
  const primary   = metadata.colorway.find(c => c.role.toLowerCase().includes("primary"));
  const secondary = metadata.colorway.find(c => c.role.toLowerCase().includes("secondary"));
  const accent    = metadata.colorway.find(c => c.role.toLowerCase().includes("accent"));

  const colorSpec = [
    primary   ? `PRIMARY ${primary.hex}${primary.pantone  ? ` / ${primary.pantone}`  : ""} — ${primary.name}`   : "",
    secondary ? `SECONDARY ${secondary.hex}${secondary.pantone ? ` / ${secondary.pantone}` : ""} — ${secondary.name}` : "",
    accent    ? `ACCENT ${accent.hex} — ${accent.name}`   : "",
  ].filter(Boolean).join(", ");

  // ── Garment design directive from Claude ──────────────────────────────────
  const garmentDirective = (metadata.description ?? "").slice(0, 400);

  // ── Additional brief data ─────────────────────────────────────────────────
  const construction = brief.sublimated === true  ? "sublimated full-color" :
                       brief.sublimated === false ? "tackle-twill stitched" : "sublimated";
  const numberStyle  = brief.number_style  ? String(brief.number_style)  : "";
  const sponsorText  = brief.sponsor_text  ? String(brief.sponsor_text)  : "";
  const logoZone     = (metadata.logoPlacement ?? "upper chest").replace(/grace athletics/gi, "").trim().slice(0, 60) || "upper chest";

  // ── Features & materials (left column data) ───────────────────────────────
  const featureList = (metadata.features ?? []).slice(0, 8).map(f => f.replace(/^[•\-–]\s*/, "")).join(", ");
  const materialStr = (metadata.materials ?? []).slice(0, 3).join("; ");

  return [
    // ── COMPOSITION AUTHORITY ──
    `Regenerate this basketball uniform specification board for the ${teamName} program using IDENTICAL three-column grid composition, column proportions, and overall layout structure from this reference. Do NOT alter the grid structure.`,

    // ── LEFT COLUMN ──
    `LEFT COLUMN: Replace content with — program header "GRACE ATHLETICS", team name "${teamName}", design system badge "${system.toUpperCase()}", colorway swatches labeled ${colorSpec}, materials "${materialStr || "100% Recycled Polyester Performance Mesh"}", features list "${featureList || systemShort}", logo placement zone "${logoZone}".`,

    // ── CENTER GARMENTS ──
    `CENTER 2×2 GARMENT GRID: Replace the four garment images with premium semi-3D ${construction} basketball uniforms using the ${system.toUpperCase()} design system. ${garmentDirective} Garment rendering style: realistic athletic mesh fabric texture, dimensional studio lighting from upper-left, authentic rib-knit collar, realistic seam stitching, natural fabric drape, premium Nike/Adidas quality. BLANK all garment surfaces — absolutely zero text, zero logos, zero numbers, zero brand marks on any garment panel. Logo zones are clean empty reserved areas.${numberStyle ? ` Number style for reference: ${numberStyle} — do NOT render any numbers.` : ""}${sponsorText ? ` Sponsor zone: clean empty patch area on left chest.` : ""}`,

    // ── RIGHT COLUMN ──
    `RIGHT COLUMN: Maintain the same five stacked technical detail callout boxes with close-up fabric details matching the ${system.toUpperCase()} design — rib-knit collar detail, logo placement zone close-up, side panel seam detail, vent construction detail, elastic waistband with drawcord.`,

    // ── QUALITY AND CONSTRAINTS ──
    `Background: same off-white (#f0ede6) board color. Premium manufacturer-quality presentation. Zero fake logos. Zero Nike/Adidas/Jordan/brand hallucinations. Zero text on garments. Photorealistic semi-3D garment renders only.`,
  ].join(" ");
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

    // ── 3. Resolve reference library (used by Claude, not OpenAI image gen) ─────
    //   Reference images are passed to Claude so it can analyze the spec-board
    //   layout and write a controlled garment description. OpenAI gpt-image-1
    //   is text-to-image — the layout is encoded in the prompt.

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

    // ── 8. Build the spec-board prompt ────────────────────────────────────────
    //   The prompt drives the image/edits endpoint — the reference image provides
    //   the composition template; the prompt populates it with the team's design.

    const boardPrompt = buildSpecBoardPrompt(metadata, designSystem, teamName, brief as Record<string, unknown>);
    console.log(`[generate-concepts] spec-board prompt (${boardPrompt.length} chars): ${boardPrompt.slice(0, 120)}…`);

    // ── 9. Generate the single spec-board image (OpenAI gpt-image-1) ─────────

    let boardImageUrl: string;
    try {
      boardImageUrl = await generateSpecBoard(boardPrompt, supabase, order_id);
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

    // ── 11. Insert concept row ────────────────────────────────────────────────

    const { error: conceptError } = await supabase
      .from("concepts")
      .insert({
        order_id,
        concept_number: 1,
        image_url:      boardImageUrl,
        selected:       false,
      });

    if (conceptError) {
      console.warn("[generate-concepts] concept insert warning:", conceptError.message);
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

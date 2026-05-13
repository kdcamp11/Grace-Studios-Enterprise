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

/** View keys for the four garment renders. */
type GarmentView = "front-jersey" | "back-jersey" | "front-shorts" | "back-shorts";

/**
 * Generates a single semi-3D garment render via OpenAI gpt-image-1,
 * uploads the PNG to Supabase Storage bucket "concepts", and returns
 * the public URL.
 *
 * Path: concepts/{orderId}/{viewKey}-{timestamp}.png
 */
async function generateGarmentRender(
  prompt:   string,
  supabase: SupabaseClient,
  orderId:  string,
  viewKey:  string,
): Promise<string> {
  const apiKey       = process.env.OPENAI_API_KEY!;
  const MAX_ATTEMPTS = 4;
  const RETRY_MS     = 15_000;

  // ── 1. Call OpenAI image generation ──────────────────────────────────────
  let b64: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({
        model:         "gpt-image-1",
        prompt,
        n:             1,
        size:          "1024x1024",
        quality:       "high",
        output_format: "png",
      }),
    });

    if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
      if (attempt >= MAX_ATTEMPTS) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(`OpenAI image generation failed (${res.status}): ${text}`);
      }
      console.log(`[generate-concepts] OpenAI ${res.status} on ${viewKey} — waiting ${RETRY_MS / 1000}s (attempt ${attempt})`);
      await sleep(RETRY_MS);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`OpenAI image generation failed (${res.status}): ${text}`);
    }

    const json = await res.json() as { data: { b64_json?: string }[] };
    b64 = json.data?.[0]?.b64_json ?? null;
    if (!b64) throw new Error(`OpenAI returned no image data for ${viewKey}`);
    break;
  }

  if (!b64) throw new Error(`OpenAI image generation produced no output for ${viewKey}`);

  // ── 2. Upload PNG buffer to Supabase Storage ──────────────────────────────
  const buffer   = Buffer.from(b64, "base64");
  const bucket   = "concepts";
  const filePath = `${orderId}/${viewKey}-${Date.now()}.png`;

  // Ensure bucket exists (service-role client; ignore if already there)
  await supabase.storage.createBucket(bucket, { public: true }).catch(() => {/* already exists */});

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: "image/png",
      upsert:      true,
    });

  if (uploadError) throw new Error(`Supabase storage upload failed (${viewKey}): ${uploadError.message}`);

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
  "description": "GARMENT DESIGN DIRECTIVE (max 80 words): Describe the basketball jersey and shorts design for semi-3D photorealistic rendering. Include: (1) exact hex colors for each panel zone, (2) panel geometry and cut angles following the ${designSystem} system visual language (be specific about diagonal cuts, side panels, yoke lines), (3) key construction details — collar style, waistband, side panel seam language. This text drives a gpt-image-1 render — be precise about fabric zones and panel cuts. No layout descriptions. No logo artwork. No numbers."
}`.trim();
}

// ─── Garment render prompt builder ───────────────────────────────────────────

/**
 * Builds a per-view semi-3D garment render prompt for OpenAI gpt-image-1.
 *
 * Each view is a single clean photorealistic render on a pure white background —
 * NO text, NO logos, NO numbers, NO layouts. The app assembles the spec-board
 * grid from the 4 renders.
 *
 * Because we use gpt-image-1 (text-to-image), the LAYOUT must be described
 * explicitly. However for garment renders the instruction is the opposite:
 * describe ONLY the garment, lighting, fabric, and design language.
 */
function buildGarmentPrompt(
  view:         GarmentView,
  metadata:     DesignMetadata,
  designSystem: string,
  teamName:     string,
): string {
  const system      = designSystem.toLowerCase();
  const systemShort = SYSTEM_PROMPT_SHORT[system] ?? SYSTEM_PROMPT_SHORT["bold"];
  const systemFull  = SYSTEM_VISUAL_LANGUAGE[system] ?? SYSTEM_VISUAL_LANGUAGE.bold;

  // Colors from Claude metadata
  const primary   = metadata.colorway.find(c => c.role.toLowerCase().includes("primary"));
  const secondary = metadata.colorway.find(c => c.role.toLowerCase().includes("secondary"));
  const accent    = metadata.colorway.find(c => c.role.toLowerCase().includes("accent"));

  const colorDesc = [
    primary   ? `primary body color ${primary.hex}`                        : "",
    secondary ? `secondary panel color ${secondary.hex}`                   : "",
    accent    ? `accent trim and detail color ${accent.hex}`               : "",
  ].filter(Boolean).join(", ");

  // Claude's controlled garment design directive
  const garmentDesc = (metadata.description ?? "").slice(0, 300);

  // View-specific instructions
  const VIEW_CONFIG: Record<GarmentView, {
    subject:   string;
    viewAngle: string;
    details:   string;
    blankRule: string;
  }> = {
    "front-jersey": {
      subject:   "basketball jersey",
      viewAngle: "front view, centered and floating",
      details:   [
        "slight forward dimensional curve showing garment depth and body",
        "realistic ribbed-knit collar with visible collar thickness and edge detail",
        "visible armhole seam construction, side seam stitching",
        "authentic athletic jersey proportions and hem length",
      ].join(", "),
      blankRule: "BLANK CHEST: completely clean — zero text, zero logo, zero numbers, zero lettering, zero brand marks anywhere on the garment surface",
    },
    "back-jersey": {
      subject:   "basketball jersey",
      viewAngle: "back view, centered and floating",
      details:   [
        "back collar neckline and rib-knit detail clearly visible",
        "shoulder seam and armhole back construction",
        "natural hang and drape from shoulder seams",
        "hem at bottom edge with realistic taper",
      ].join(", "),
      blankRule: "BLANK BACK: completely clean — zero numbers, zero name, zero text, zero lettering anywhere on garment",
    },
    "front-shorts": {
      subject:   "basketball shorts",
      viewAngle: "front view, centered and floating",
      details:   [
        "structured elastic waistband with exposed drawcord and visible cord-lock hardware",
        "realistic waistband depth, thickness, and fold",
        "natural fabric tension and slight flare at leg openings",
        "visible side seam and panel construction with authentic proportions",
      ].join(", "),
      blankRule: "BLANK FRONT: completely clean — zero text, zero logo, zero lettering anywhere on garment",
    },
    "back-shorts": {
      subject:   "basketball shorts",
      viewAngle: "back view, centered and floating",
      details:   [
        "rear elastic waistband construction and back waistband detail",
        "back yoke seam detail if applicable to design system",
        "realistic hem structure at leg openings with authentic proportions",
        "natural fabric drape and weight from waistband down",
      ].join(", "),
      blankRule: "BLANK BACK: completely clean — zero text, zero logo, zero numbers anywhere",
    },
  };

  const cfg = VIEW_CONFIG[view];

  return [
    // Subject + view
    `Photorealistic semi-3D ${cfg.subject} product render, ${cfg.viewAngle}, ${teamName} basketball uniform`,

    // Background and presentation
    "floating on pure white studio background with subtle soft drop shadow directly below garment, no other elements in frame",

    // Colors
    colorDesc,

    // Design system language
    `${system} design system panel geometry: ${systemShort}`,

    // Claude's garment directive (specific panel cuts and colors)
    garmentDesc,

    // Full design system visual language for reference
    `design system character: ${systemFull.split(".")[0]}`,

    // Fabric and material quality
    "realistic athletic performance fabric: breathable mesh texture zones with visible weave structure, moisture-wicking fabric texture, authentic garment weight, natural fabric drape and slight dimensional depth",

    // Lighting and rendering quality
    "professional product studio lighting: soft key light from upper-left at 45 degrees creating subtle dimensional shadows across fabric, soft fill light from opposite side, realistic fabric surface sheen on mesh zones, soft cast shadow below garment only",

    // View-specific structural details
    cfg.details,

    // CRITICAL: no text, no logos
    cfg.blankRule,

    // Quality bar
    "Nike or Adidas tier premium sportswear product mockup quality, manufacturer catalog render, photorealistic athletic fabric texture, no people, no lifestyle elements, no background, pure white only",
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
      total:       4,
      startedAt:   new Date().toISOString(),
      boardFormat: "renders",
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

    // Mark generating so the status endpoint shows in-progress state
    await saveStatus(supabase, order_id, {
      ...metadata,
      status:   "generating",
      progress: 0,
      total:    4,
    });

    // ── 8. Generate 4 semi-3D garment renders (OpenAI gpt-image-1) ───────────
    //   Each render is a clean photorealistic garment on white background.
    //   The app assembles these into the spec-board grid layout — AI generates
    //   ONLY the garments, never text/logos/layouts.

    const RENDER_VIEWS: GarmentView[] = [
      "front-jersey",
      "back-jersey",
      "front-shorts",
      "back-shorts",
    ];

    const VIEW_LABELS: Record<GarmentView, string> = {
      "front-jersey": "Jersey Front",
      "back-jersey":  "Jersey Back",
      "front-shorts": "Shorts Front",
      "back-shorts":  "Shorts Back",
    };

    const renderUrls: Partial<Record<GarmentView, string>> = {};

    for (let i = 0; i < RENDER_VIEWS.length; i++) {
      const view   = RENDER_VIEWS[i];
      const prompt = buildGarmentPrompt(view, metadata, designSystem, teamName);
      console.log(`[generate-concepts] rendering ${view} (${i + 1}/4): ${prompt.slice(0, 100)}…`);

      try {
        renderUrls[view] = await generateGarmentRender(prompt, supabase, order_id, view);
        console.log(`[generate-concepts] ${view} done: ${renderUrls[view]!.slice(0, 60)}`);
      } catch (imgErr: unknown) {
        const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
        console.error(`[generate-concepts] ${VIEW_LABELS[view]} render failed:`, msg);
        await saveStatus(supabase, order_id, {
          ...metadata,
          status: "failed",
          error:  `${VIEW_LABELS[view]} render failed: ${msg}`,
        });
        return NextResponse.json(
          { error: `${VIEW_LABELS[view]} render failed`, detail: msg },
          { status: 500 },
        );
      }

      // Progress update after each render completes
      await saveStatus(supabase, order_id, {
        ...metadata,
        status:   "generating",
        progress: i + 1,
        total:    4,
      });
    }

    // ── 9. Mark completed ─────────────────────────────────────────────────────

    const finalMetadata: DesignMetadata = {
      ...metadata,
      status:      "completed",
      progress:    4,
      total:       4,
      boardFormat: "renders",
      renders: {
        frontJersey: renderUrls["front-jersey"]!,
        backJersey:  renderUrls["back-jersey"]!,
        frontShorts: renderUrls["front-shorts"]!,
        backShorts:  renderUrls["back-shorts"]!,
      },
    };

    await supabase
      .from("briefs")
      .update({ ai_prompt: JSON.stringify(finalMetadata) })
      .eq("order_id", order_id);

    // ── 10. Insert concept rows (one per render for backward compat) ──────────

    await supabase.from("concepts").delete().eq("order_id", order_id);

    const conceptRows = RENDER_VIEWS.map((view, i) => ({
      order_id,
      concept_number: i + 1,
      image_url:      renderUrls[view]!,
      selected:       i === 0,   // front jersey is default selected
    }));

    const { error: conceptError } = await supabase.from("concepts").insert(conceptRows);

    if (conceptError) {
      console.warn("[generate-concepts] concept insert warning:", conceptError.message);
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

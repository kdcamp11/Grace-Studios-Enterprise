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
 * Builds the OpenAI image-generation prompt for a single garment view.
 *
 * CRITICAL DESIGN DECISION: hex colors appear at the TOP of the prompt as
 * MANDATORY requirements. OpenAI gpt-image-1 weighs prompt order heavily —
 * colors buried in the middle of long prompts get ignored. By placing exact
 * hex values as the FIRST thing the model reads, we eliminate color hallucination.
 *
 * The app assembles all 4 renders into the spec-board grid — the AI only
 * generates garment surfaces. No text, no logos, no layout.
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

  // ── COLOR BLOCK — always first ────────────────────────────────────────────
  const colorLines = [
    primary   ? `BODY/PRIMARY panels: exact hex ${primary.hex}` : "",
    secondary ? `SIDE/SECONDARY panels: exact hex ${secondary.hex}` : "",
    accent    ? `TRIM/ACCENT details: exact hex ${accent.hex}` : "",
  ].filter(Boolean);

  const colorBlock = colorLines.length > 0
    ? [
        `MANDATORY COLOR REQUIREMENTS — USE THESE EXACT HEX VALUES, NO SUBSTITUTIONS:`,
        ...colorLines,
      ].join("\n")
    : "";

  // ── View-specific details ─────────────────────────────────────────────────
  const isJersey = view.includes("Jersey");
  const isFront  = view.startsWith("front");

  const garmentName = isJersey
    ? `basketball game jersey, ${isFront ? "front view" : "back view"}`
    : `basketball game shorts, ${isFront ? "front view" : "back view"}`;

  const poseAndCamera = isFront
    ? "Straight-on front view, garment centered on clean white background, ghost mannequin or flat lay"
    : "Straight-on back view, garment centered on clean white background, ghost mannequin or flat lay";

  // ── Design system panel geometry from Claude ──────────────────────────────
  const garmentDirective = (metadata.description ?? "").slice(0, 200);

  // ── Brief details ─────────────────────────────────────────────────────────
  const construction = brief.sublimated === true  ? "sublimated full-color dye-into-fabric"
                     : brief.sublimated === false ? "tackle-twill stitched"
                     : "sublimated full-color dye-into-fabric";

  const numberStyle  = brief.number_style ? String(brief.number_style) : "";

  return [
    // ── 1. COLOR REQUIREMENTS (first — highest model attention) ──
    colorBlock,

    // ── 2. SUBJECT ──
    `Premium ${construction} ${garmentName} for ${teamName} athletic program.`,

    // ── 3. DESIGN SYSTEM GEOMETRY ──
    `Design system: ${system.toUpperCase()}. Panel geometry: ${systemFull.slice(0, 180)}`,

    // ── 4. DESIGN DETAILS FROM BRIEF ANALYSIS ──
    garmentDirective ? `Panel construction details: ${garmentDirective}` : "",

    // ── 5. RENDERING STYLE ──
    `Rendering: photorealistic semi-3D athletic garment render. Realistic performance mesh fabric texture with visible micro-weave. Dimensional studio lighting from upper-left, soft fill from right. ${isJersey ? "Authentic rib-knit V-collar detail. " : "Elastic waistband with internal drawcord. "}Natural fabric drape and realistic seam stitching. Premium Nike/Adidas manufacturing quality.`,

    // ── 6. CAMERA / POSE ──
    poseAndCamera,

    // ── 7. ABSOLUTE RESTRICTIONS ──
    `CRITICAL — ABSOLUTELY ZERO: text of any kind, numbers, player numbers, jersey numbers, logos, brand marks, wordmarks, watermarks, graphic overlays, or symbols anywhere on the garment. All number zones and logo zones must be completely clean empty fabric panels with no markings whatsoever.${numberStyle ? ` (Number style ${numberStyle} is for production reference only — DO NOT render any numbers.)` : ""}`,

    // ── 8. BACKGROUND ──
    `Background: pure clean white (#ffffff). No shadows on background. No floor. No environment. Garment only.`,

    // ── 9. QUALITY ──
    `Output: single isolated garment, square composition, photorealistic premium sportswear quality.`,
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

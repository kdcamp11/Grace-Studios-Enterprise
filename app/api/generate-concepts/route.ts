import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";
import { sendConceptsReady } from "@/lib/email";
import fs from "fs";
import path from "path";

export const maxDuration = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DesignMetadata {
  garmentType: string;
  colorway: { role: string; name: string; hex: string; pantone?: string }[];
  materials: string[];
  features: string[];
  logoPlacement: string;
  description: string;
  images?: { front: string; back: string; detail1: string; detail2: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VIEW_SUFFIXES = [
  "front view, full garment visible, clean technical flat render on dark background",
  "back view, full garment visible, clean technical flat render on dark background",
  "close-up detail: collar, neckline, and logo placement on dark background",
  "close-up detail: sleeve, side panel, or hem construction on dark background",
];

const SPEC_BOARD_REFERENCE_URL = `${
  process.env.NEXT_PUBLIC_APP_URL ?? "https://gs-first-pass.vercel.app"
}/reference/spec-board-reference.jpg`;

const IMAGE_PREFIX =
  "clean technical apparel flat render, sports uniform product board art, professional garment illustration, crisp detail on dark background —";

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(
  brief: Record<string, unknown>,
  client: Record<string, unknown>
): string {
  const designSystem     = brief.design_system ?? "bold";
  const sport            = (client.sport as string) ?? "sports";
  const teamName         = (client.name  as string) ?? "the team";
  const city             = (client.city  as string) ?? "";

  const logoUrls: string[] = Array.isArray(brief.logo_urls)
    ? (brief.logo_urls as string[])
    : brief.logo_url ? [brief.logo_url as string] : [];

  const refUrls: string[] = Array.isArray(brief.reference_image_urls)
    ? (brief.reference_image_urls as string[])
    : brief.reference_image_url ? [brief.reference_image_url as string] : [];

  const colorInstruction = logoUrls.length > 0
    ? `Extract the team's primary and secondary colors from the uploaded team logo(s). Return exact hex codes.`
    : "Choose a strong, sport-appropriate color palette. Return exact hex codes.";

  const refInstruction = refUrls.length > 0
    ? `${refUrls.length} client reference image(s) have been provided for aesthetic direction.`
    : "";

  const construction     = brief.sublimated === true ? "sublimated" : brief.sublimated === false ? "tackle twill" : "sublimated";
  const cut              = brief.jersey_cut ?? "standard";
  const numberStyle      = brief.number_style      ? `Number style: ${brief.number_style}.`           : "";
  const logoPlacementRaw = (brief.gs_logo_placement as string) ?? "chest";
  const logos            = brief.logos_to_include  ? `Logos to include: ${brief.logos_to_include}.`   : "";
  const sponsor          = brief.sponsor_text      ? `Sponsor text/patch: ${brief.sponsor_text}.`     : "";
  const negative         = brief.negative_references ? `Do not include: ${brief.negative_references}.` : "";
  const vision           = brief.vision_prompt     ? `Client vision: ${brief.vision_prompt}`          : "";

  return `You are a senior sportswear designer creating a technical apparel spec board for ${teamName} from ${city}.

The attached reference image shows the exact Grace Athletics spec-board style. Your JSON output populates that structured layout.

Design a ${designSystem} style ${sport} uniform. ${colorInstruction} ${refInstruction}
Construction: ${construction}, ${cut} cut. ${numberStyle} ${logos} ${sponsor} Grace Studios logo placement: ${logoPlacementRaw}. ${negative} ${vision}

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "garmentType": "e.g. Basketball Uniform",
  "colorway": [
    {"role": "Primary",   "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"},
    {"role": "Secondary", "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"}
  ],
  "materials": ["e.g. Shell: 100% Nylon", "e.g. Lining: 100% Polyester Mesh", "e.g. Weight: 110GSM"],
  "features": ["Short feature label 1", "Short feature label 2", "Short feature label 3", "Short feature label 4"],
  "logoPlacement": "Precise placement — e.g. Grace Athletics Crest Centered On Upper Chest, Below Team Name",
  "description": "Detailed visual description of the uniform for image generation — exact colors, panel layout, graphic elements, number style, stripe/piping/texture details, logo locations, cut silhouette, overall energy. Be specific."
}`.trim();
}

function validUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("http");
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();
    if (!order_id) {
      return NextResponse.json({ error: "order_id required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── 1. Fetch brief / order / client ──────────────────────────────────────

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

    // ── 2. Build Claude prompt ────────────────────────────────────────────────

    const designPrompt = buildPrompt(brief, client);

    const logoUrls: string[] = Array.isArray(brief.logo_urls)
      ? (brief.logo_urls as string[]).filter(validUrl)
      : validUrl(brief.logo_url) ? [brief.logo_url as string] : [];

    const refUrls: string[] = Array.isArray(brief.reference_image_urls)
      ? (brief.reference_image_urls as string[]).filter(validUrl)
      : validUrl(brief.reference_image_url) ? [brief.reference_image_url as string] : [];

    const clientImageUrls = [...logoUrls, ...refUrls].slice(0, 19);

    // ── 3. Call Claude ────────────────────────────────────────────────────────

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    type ImageBlock   = { type: "image"; source: { type: "url"; url: string } };
    type TextBlock    = { type: "text"; text: string };
    type ContentBlock = ImageBlock | TextBlock;

    // Only include spec-board reference if the file has been placed in public/reference/
    const refImagePath   = path.join(process.cwd(), "public", "reference", "spec-board-reference.jpg");
    const hasSpecBoardRef = fs.existsSync(refImagePath);

    const specBoardBlock: ImageBlock | null = hasSpecBoardRef
      ? { type: "image", source: { type: "url", url: SPEC_BOARD_REFERENCE_URL } }
      : null;

    const clientImageBlocks: ContentBlock[] = clientImageUrls.map((url) => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    }));

    const imageCountNote = [
      hasSpecBoardRef
        ? "The first image is a Grace Athletics spec-board style reference. Match this level of technical detail."
        : "",
      logoUrls.length > 0
        ? `${hasSpecBoardRef ? "The next" : "The first"} ${logoUrls.length} image(s) are team logo(s). Extract brand colors from them.`
        : "",
      refUrls.length > 0
        ? `The following ${refUrls.length} image(s) are client reference images for aesthetic direction.`
        : "",
    ].filter(Boolean).join(" ");

    const claudeContent: ContentBlock[] = [
      ...(specBoardBlock ? [specBoardBlock] : []),
      ...clientImageBlocks,
      ...(imageCountNote ? [{ type: "text" as const, text: imageCountNote }] : []),
      { type: "text" as const, text: designPrompt },
    ];

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

    // ── 4. Parse metadata ─────────────────────────────────────────────────────

    let metadata: DesignMetadata;
    try {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      metadata = JSON.parse(cleaned) as DesignMetadata;
      if (typeof metadata.description !== "string") throw new Error("invalid shape");
    } catch {
      metadata = {
        garmentType:   (brief.jersey_cut as string) ?? "Sports Uniform",
        colorway:      [],
        materials:     [],
        features:      [],
        logoPlacement: (brief.gs_logo_placement as string) ?? "",
        description:   rawText,
      };
    }

    // ── 5. Generate 4 images via Replicate ────────────────────────────────────

    const PLACEHOLDER_LABELS = ["Front", "Back", "Detail 1", "Detail 2"];
    let imageUrls: string[];

    try {
      const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

      const results = await Promise.all(
        VIEW_SUFFIXES.map((suffix) =>
          replicate.run("black-forest-labs/flux-schnell", {
            input: {
              prompt:         `${IMAGE_PREFIX} ${metadata.description} — ${suffix}`,
              num_outputs:    1,
              aspect_ratio:   "1:1",
              output_format:  "webp",
              output_quality: 90,
            },
          })
        )
      );

      imageUrls = results.map((result) => {
        const output = result as unknown[];
        const first  = Array.isArray(output) ? output[0] : result;
        return first && typeof (first as { url?: () => string }).url === "function"
          ? (first as { url: () => string }).url()
          : String(first);
      });
    } catch (replicateErr: unknown) {
      console.warn(
        "[generate-concepts] Replicate unavailable, using placeholders:",
        replicateErr instanceof Error ? replicateErr.message : replicateErr
      );
      imageUrls = PLACEHOLDER_LABELS.map(
        (label, i) =>
          `https://placehold.co/1024x1024/1a1a1a/C9A84C?text=Concept+${i + 1}%0A${encodeURIComponent(label)}&font=montserrat`
      );
    }

    // ── 6. Embed image URLs in metadata and save ──────────────────────────────

    const metadataWithImages: DesignMetadata = {
      ...metadata,
      images: {
        front:   imageUrls[0] ?? "",
        back:    imageUrls[1] ?? "",
        detail1: imageUrls[2] ?? "",
        detail2: imageUrls[3] ?? "",
      },
    };

    await supabase
      .from("briefs")
      .update({ ai_prompt: JSON.stringify(metadataWithImages) })
      .eq("order_id", order_id);

    // ── 7. Insert concept rows ────────────────────────────────────────────────

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
        { status: 500 }
      );
    }

    // ── 8. Notify client ──────────────────────────────────────────────────────

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
        emailErr instanceof Error ? emailErr.message : emailErr
      );
    }

    return NextResponse.json({ status: "complete", order_id, concepts: conceptRows.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-concepts] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

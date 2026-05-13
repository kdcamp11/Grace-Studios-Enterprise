import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";
import { sendConceptsReady } from "@/lib/email";

export const maxDuration = 300;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConceptVariation {
  direction: string;
  garmentType: string;
  colorway: { role: string; name: string; hex: string; pantone?: string }[];
  materials: string[];
  features: string[];
  logoPlacement: string;
  description: string;
}

export interface MultiConceptMetadata {
  concepts: (ConceptVariation & {
    images: { front: string; back: string; detail1: string; detail2: string };
  })[];
}

// Backward-compat alias used by the page
export type DesignMetadata = ConceptVariation;

// ─── Constants ────────────────────────────────────────────────────────────────

// Each concept generates 4 views
const VIEW_SUFFIXES = [
  "front view, full garment visible, clean technical flat render on dark background",
  "back view, full garment visible, clean technical flat render on dark background",
  "close-up detail: collar, neckline, and logo placement on dark background",
  "close-up detail: sleeve, side panel, or hem construction on dark background",
];

// Style reference always sent to Claude so it understands the target layout
const SPEC_BOARD_REFERENCE_URL = `${
  process.env.NEXT_PUBLIC_APP_URL ?? "https://gs-first-pass.vercel.app"
}/reference/spec-board-reference.jpg`;

const IMAGE_PREFIX =
  "clean technical apparel flat render, sports uniform product board art, professional garment illustration, crisp detail on dark background —";

// The four mandatory design directions
const CONCEPT_DIRECTIONS = [
  {
    label: "Minimal Clean",
    tone: "stripped-back, modern, refined — minimal graphic treatment, clean silhouette, monochromatic or tight two-tone palette, understated number treatment",
  },
  {
    label: "Bold Graphic",
    tone: "aggressive, high-contrast, visually dominant — strong colorblocking, bold paneling, graphic stripe or chevron elements, oversized or layered number treatment",
  },
  {
    label: "Heritage Classic",
    tone: "timeless, institutional, traditional construction — classic color palette, clean varsity typography, minimal graphic interruption, championship-cabinet energy",
  },
  {
    label: "Culture Forward",
    tone: "streetwear-influenced, fashion-forward — unexpected colorblocking, tonal details, modern edge, distinct detail work, feels like a limited collab drop",
  },
] as const;

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildMultiConceptPrompt(
  brief: Record<string, unknown>,
  client: Record<string, unknown>
): string {
  const designSystem = brief.design_system ?? "bold";
  const sport        = (client.sport as string) ?? "sports";
  const teamName     = (client.name  as string) ?? "the team";
  const city         = (client.city  as string) ?? "";

  const logoUrls: string[] = Array.isArray(brief.logo_urls)
    ? (brief.logo_urls as string[])
    : brief.logo_url ? [brief.logo_url as string] : [];

  const refUrls: string[] = Array.isArray(brief.reference_image_urls)
    ? (brief.reference_image_urls as string[])
    : brief.reference_image_url ? [brief.reference_image_url as string] : [];

  const colorInstruction =
    logoUrls.length > 0
      ? `Extract the team's primary and secondary colors from the uploaded team logo(s). Return exact hex codes.`
      : "Choose a strong, sport-appropriate color palette. Return exact hex codes.";

  const refInstruction =
    refUrls.length > 0
      ? `${refUrls.length} client reference image(s) have been provided for aesthetic direction.`
      : "";

  const construction   = brief.sublimated === true ? "sublimated" : brief.sublimated === false ? "tackle twill" : "sublimated";
  const cut            = brief.jersey_cut ?? "standard";
  const numberStyle    = brief.number_style     ? `Number style: ${brief.number_style}.`          : "";
  const logoPlacementRaw = (brief.gs_logo_placement as string) ?? "chest";
  const logos          = brief.logos_to_include  ? `Logos to include: ${brief.logos_to_include}.`  : "";
  const sponsor        = brief.sponsor_text       ? `Sponsor text/patch: ${brief.sponsor_text}.`   : "";
  const negative       = brief.negative_references ? `Do not include: ${brief.negative_references}.` : "";
  const vision         = brief.vision_prompt      ? `Client vision: ${brief.vision_prompt}`        : "";

  const directionsBlock = CONCEPT_DIRECTIONS.map(
    (d, i) => `  Concept ${i + 1} — "${d.label}": ${d.tone}`
  ).join("\n");

  return `You are a senior sportswear designer creating a 4-concept apparel proposal for ${teamName} from ${city}.

The attached reference image shows the exact Grace Athletics spec-board style. Your JSON output populates 4 SEPARATE boards using that identical layout structure.

Team brief: ${designSystem} style ${sport} uniform. ${colorInstruction} ${refInstruction}
Construction: ${construction}, ${cut} cut. ${numberStyle} ${logos} ${sponsor} Grace Studios logo placement: ${logoPlacementRaw}. ${negative} ${vision}

Generate 4 DISTINCT concept variations — same sport and garment type, but meaningfully different colorways, paneling, graphic treatments, and construction accents for each direction:

${directionsBlock}

Return ONLY valid JSON (no markdown fences) with this exact structure:
{
  "concepts": [
    {
      "direction": "Minimal Clean",
      "garmentType": "e.g. Basketball Uniform",
      "colorway": [
        {"role": "Primary",   "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"},
        {"role": "Secondary", "name": "color name", "hex": "#xxxxxx", "pantone": "Pantone XXXX C"}
      ],
      "materials": ["e.g. Shell: 100% Nylon", "e.g. Lining: 100% Polyester Mesh", "e.g. Weight: 110GSM"],
      "features": ["Short feature label 1", "Short feature label 2", "Short feature label 3", "Short feature label 4"],
      "logoPlacement": "Precise placement — e.g. Grace Athletics Crest Centered On Upper Chest",
      "description": "Detailed visual description specific to THIS concept variation — exact colors, panel layout, graphic elements, number style, stripe/piping/texture details, logo locations, cut silhouette. Must be distinct from all other concepts and specific enough for an image generator."
    },
    { "direction": "Bold Graphic",      ... },
    { "direction": "Heritage Classic",  ... },
    { "direction": "Culture Forward",   ... }
  ]
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
      .from("briefs")
      .select("*")
      .eq("order_id", order_id)
      .single();
    if (briefError || !brief) {
      return NextResponse.json({ error: "Brief not found" }, { status: 404 });
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("client_id, order_number")
      .eq("id", order_id)
      .single();
    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("name, city, sport, email")
      .eq("id", order.client_id)
      .single();
    if (clientError || !client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // ── 2. Build Claude prompt ────────────────────────────────────────────────

    const designPrompt = buildMultiConceptPrompt(brief, client);

    const logoUrls: string[] = Array.isArray(brief.logo_urls)
      ? (brief.logo_urls as string[]).filter(validUrl)
      : validUrl(brief.logo_url) ? [brief.logo_url as string] : [];

    const refUrls: string[] = Array.isArray(brief.reference_image_urls)
      ? (brief.reference_image_urls as string[]).filter(validUrl)
      : validUrl(brief.reference_image_url) ? [brief.reference_image_url as string] : [];

    const clientImageUrls = [...logoUrls, ...refUrls].slice(0, 19);

    // ── 3. Call Claude — returns 4 concept variations ─────────────────────────

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    type ImageBlock   = { type: "image"; source: { type: "url"; url: string } };
    type TextBlock    = { type: "text"; text: string };
    type ContentBlock = ImageBlock | TextBlock;

    const specBoardBlock: ImageBlock = {
      type: "image",
      source: { type: "url", url: SPEC_BOARD_REFERENCE_URL },
    };

    const clientImageBlocks: ContentBlock[] = clientImageUrls.map((url) => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    }));

    const imageCountNote = [
      "The first image is a Grace Athletics spec-board style reference. Match this level of technical detail and structured presentation in your output.",
      logoUrls.length > 0
        ? `The next ${logoUrls.length} image(s) are team logo(s). Extract brand colors from them.`
        : "",
      refUrls.length > 0
        ? `The following ${refUrls.length} image(s) are client reference images for aesthetic direction.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

    const claudeContent: ContentBlock[] = [
      specBoardBlock,
      ...clientImageBlocks,
      { type: "text", text: imageCountNote },
      { type: "text", text: designPrompt },
    ];

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: claudeContent }],
      stream: false,
    });

    const rawText =
      "content" in aiResponse && aiResponse.content[0].type === "text"
        ? aiResponse.content[0].text
        : "";

    // ── 4. Parse 4 concept variations ─────────────────────────────────────────

    let variations: ConceptVariation[];
    try {
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed  = JSON.parse(cleaned) as { concepts: ConceptVariation[] };
      if (!Array.isArray(parsed.concepts) || parsed.concepts.length === 0) {
        throw new Error("no concepts array");
      }
      variations = parsed.concepts;
    } catch {
      // Fallback: build 4 stub variations from raw text
      const stub: ConceptVariation = {
        direction:     "Concept",
        garmentType:   (brief.jersey_cut as string) ?? "Sports Uniform",
        colorway:      [],
        materials:     [],
        features:      [],
        logoPlacement: (brief.gs_logo_placement as string) ?? "",
        description:   rawText,
      };
      variations = CONCEPT_DIRECTIONS.map((d) => ({ ...stub, direction: d.label }));
    }

    // Normalise to exactly 4
    while (variations.length < 4) {
      const last = variations[variations.length - 1];
      variations.push({ ...last, direction: CONCEPT_DIRECTIONS[variations.length].label });
    }
    variations = variations.slice(0, 4);

    // ── 5. Generate 16 images via Replicate (4 concepts × 4 views) ────────────

    type ImageJob = {
      conceptIndex: number;
      viewIndex: number;
      suffix: string;
      description: string;
    };

    const imageJobs: ImageJob[] = variations.flatMap((v, ci) =>
      VIEW_SUFFIXES.map((suffix, vi) => ({
        conceptIndex: ci,
        viewIndex:    vi,
        suffix,
        description:  v.description || "",
      }))
    );

    // Map: conceptIndex → viewIndex → image URL
    const imageMap: Record<number, Record<number, string>> = {};

    try {
      const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

      const results = await Promise.all(
        imageJobs.map((job) =>
          replicate.run("black-forest-labs/flux-schnell", {
            input: {
              prompt:         `${IMAGE_PREFIX} ${job.description} — ${job.suffix}`,
              num_outputs:    1,
              aspect_ratio:   "1:1",
              output_format:  "webp",
              output_quality: 90,
            },
          })
        )
      );

      results.forEach((result, idx) => {
        const { conceptIndex, viewIndex } = imageJobs[idx];
        const output = result as unknown[];
        const first  = Array.isArray(output) ? output[0] : result;
        const url    =
          first && typeof (first as { url?: () => string }).url === "function"
            ? (first as { url: () => string }).url()
            : String(first);
        if (!imageMap[conceptIndex]) imageMap[conceptIndex] = {};
        imageMap[conceptIndex][viewIndex] = url;
      });
    } catch (replicateErr: unknown) {
      console.warn(
        "[generate-concepts] Replicate unavailable, using placeholders:",
        replicateErr instanceof Error ? replicateErr.message : replicateErr
      );
      variations.forEach((v, ci) => {
        imageMap[ci] = {
          0: `https://placehold.co/1024x1024/1a1a1a/C9A84C?text=Concept+${ci + 1}%0A${encodeURIComponent(v.direction)}&font=montserrat`,
          1: `https://placehold.co/1024x1024/1a1a1a/C9A84C?text=Concept+${ci + 1}%0ABack&font=montserrat`,
          2: `https://placehold.co/1024x1024/1a1a1a/C9A84C?text=Detail+1&font=montserrat`,
          3: `https://placehold.co/1024x1024/1a1a1a/C9A84C?text=Detail+2&font=montserrat`,
        };
      });
    }

    // ── 6. Assemble multi-concept metadata with embedded image URLs ───────────

    const multiConceptData: MultiConceptMetadata = {
      concepts: variations.map((v, ci) => ({
        ...v,
        images: {
          front:   imageMap[ci]?.[0] ?? "",
          back:    imageMap[ci]?.[1] ?? "",
          detail1: imageMap[ci]?.[2] ?? "",
          detail2: imageMap[ci]?.[3] ?? "",
        },
      })),
    };

    await supabase
      .from("briefs")
      .update({ ai_prompt: JSON.stringify(multiConceptData) })
      .eq("order_id", order_id);

    // ── 7. Insert one concept row per board (front image as canonical URL) ────

    const conceptRows = multiConceptData.concepts.map((c, i) => ({
      order_id,
      concept_number: i + 1,
      image_url:      c.images.front,
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

    return NextResponse.json({
      status:   "complete",
      order_id,
      concepts: conceptRows.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-concepts] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

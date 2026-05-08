import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";
import { sendConceptsReady } from "@/lib/email";

export const maxDuration = 300;

const CONCEPT_SUFFIXES = [
  "Home colorway",
  "Away colorway alternative",
  "Bold graphic variation",
  "Minimal clean variation",
];

const IMAGE_PREFIX =
  "flat lay product shot of a sports jersey on a dark background, front facing, full garment visible, professional apparel photography —";

function buildPrompt(brief: Record<string, unknown>, client: Record<string, unknown>): string {
  const designSystem = brief.design_system ?? "bold";
  const sport = (client.sport as string) ?? "sports";
  const teamName = (client.name as string) ?? "the team";
  const city = (client.city as string) ?? "";

  const logoUrls: string[] = Array.isArray(brief.logo_urls) ? (brief.logo_urls as string[]) : brief.logo_url ? [brief.logo_url as string] : [];
  const refUrls: string[] = Array.isArray(brief.reference_image_urls) ? (brief.reference_image_urls as string[]) : brief.reference_image_url ? [brief.reference_image_url as string] : [];

  const colorInstruction = logoUrls.length > 0
    ? `Extract the team's primary and secondary colors directly from the uploaded team logo${logoUrls.length > 1 ? "s" : ""}.`
    : "Choose a strong, sport-appropriate color palette that fits the design system.";

  const refInstruction = refUrls.length > 0
    ? `${refUrls.length} reference image${refUrls.length > 1 ? "s have" : " has"} been provided for visual direction — use them for style, energy, and aesthetic inspiration.`
    : "";

  const construction = brief.sublimated === true ? "sublimated" : brief.sublimated === false ? "tackle twill" : "sublimated";
  const cut = brief.jersey_cut ?? "standard";
  const numberStyle = brief.number_style ? `The number style is ${brief.number_style}.` : "";
  const logoPlacement = brief.gs_logo_placement ?? "chest";
  const logos = brief.logos_to_include ? `Include the following logos: ${brief.logos_to_include}.` : "";
  const sponsor = brief.sponsor_text ? `Sponsor text/patch: ${brief.sponsor_text}.` : "";
  const negative = brief.negative_references ? `Do not include: ${brief.negative_references}.` : "";
  const vision = brief.vision_prompt ? `\n\nAdditional vision from the client: ${brief.vision_prompt}` : "";

  return `You are a professional sports uniform designer. Design a ${designSystem} style ${sport} jersey for ${teamName} based in ${city}.

${colorInstruction} ${refInstruction}

The jersey is ${construction}, ${cut} cut. ${numberStyle} ${logos} ${sponsor} The Grace Studios logo must be placed at the ${logoPlacement} and must remain visible when the jersey is tucked in. ${negative}${vision}

Describe exactly what this jersey looks like — colors, panel layout, graphic elements, number placement, logo placement, and overall visual energy. Be specific enough that an image generator can render it accurately. Return only the design description, nothing else.`.trim();
}

function validUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith("http");
}

export async function POST(req: NextRequest) {
  try {
    const { order_id } = await req.json();
    if (!order_id) {
      return NextResponse.json({ error: "order_id required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // 1. Fetch brief + client
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

    // 2. Build prompt
    const designPrompt = buildPrompt(brief, client);

    // 3. Collect all image URLs (logos first, then references — max 20 for Anthropic)
    const logoUrls: string[] = Array.isArray(brief.logo_urls)
      ? (brief.logo_urls as string[]).filter(validUrl)
      : validUrl(brief.logo_url) ? [brief.logo_url as string] : [];

    const refUrls: string[] = Array.isArray(brief.reference_image_urls)
      ? (brief.reference_image_urls as string[]).filter(validUrl)
      : validUrl(brief.reference_image_url) ? [brief.reference_image_url as string] : [];

    const allImageUrls = [...logoUrls, ...refUrls].slice(0, 20);

    // 4. Generate design description via Anthropic
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    type ImageBlock = { type: "image"; source: { type: "url"; url: string } };
    type TextBlock = { type: "text"; text: string };
    type ContentBlock = ImageBlock | TextBlock;

    const imageBlocks: ContentBlock[] = allImageUrls.map((url) => ({
      type: "image" as const,
      source: { type: "url" as const, url },
    }));

    const promptPrefix = logoUrls.length > 0 || refUrls.length > 0
      ? [
          logoUrls.length > 0 ? `The first ${logoUrls.length} image(s) are team logo(s). Use them to extract brand colors and identity.` : "",
          refUrls.length > 0 ? `The next ${refUrls.length} image(s) are reference/inspiration images. Use them for style and aesthetic direction.` : "",
        ].filter(Boolean).join(" ")
      : "";

    const content: ContentBlock[] = [
      ...imageBlocks,
      ...(promptPrefix ? [{ type: "text" as const, text: promptPrefix }] : []),
      { type: "text" as const, text: designPrompt },
    ];

    const aiResponse = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content }],
      stream: false,
    });

    const designDescription =
      "content" in aiResponse && aiResponse.content[0].type === "text"
        ? aiResponse.content[0].text
        : "";

    // Save ai_prompt back to brief
    await supabase
      .from("briefs")
      .update({ ai_prompt: designDescription })
      .eq("order_id", order_id);

    // 5. Generate 4 concept images via Replicate (with placeholder fallback)
    const PLACEHOLDER_LABELS = ["Home", "Away", "Bold", "Minimal"];
    let conceptRows: { order_id: string; concept_number: number; image_url: string; selected: boolean }[];

    try {
      const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
      const imagePromises = CONCEPT_SUFFIXES.map((suffix) =>
        replicate.run("black-forest-labs/flux-schnell", {
          input: {
            prompt: `${IMAGE_PREFIX} ${designDescription} — ${suffix}`,
            num_outputs: 1,
            aspect_ratio: "1:1",
            output_format: "webp",
            output_quality: 90,
          },
        })
      );
      const imageResults = await Promise.all(imagePromises);
      conceptRows = imageResults.map((result, i) => {
        const output = result as unknown[];
        const first = Array.isArray(output) ? output[0] : result;
        const image_url =
          first && typeof (first as { url?: () => string }).url === "function"
            ? (first as { url: () => string }).url()
            : String(first);
        return { order_id, concept_number: i + 1, image_url, selected: false };
      });
    } catch (replicateErr: unknown) {
      console.warn("[generate-concepts] Replicate unavailable, using placeholders:", replicateErr instanceof Error ? replicateErr.message : replicateErr);
      conceptRows = PLACEHOLDER_LABELS.map((label, i) => ({
        order_id,
        concept_number: i + 1,
        image_url: `https://placehold.co/1024x1024/1a1a1a/C9A84C?text=Concept+${i + 1}%0A${label}&font=montserrat`,
        selected: false,
      }));
    }

    const { error: conceptError } = await supabase
      .from("concepts")
      .insert(conceptRows);

    if (conceptError) {
      return NextResponse.json({ error: "Failed to save concepts", detail: conceptError.message }, { status: 500 });
    }

    // Notify client that concepts are ready
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
      console.warn("[generate-concepts] Email notification failed:", emailErr instanceof Error ? emailErr.message : emailErr);
    }

    return NextResponse.json({ status: "complete", order_id, concepts: conceptRows.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-concepts] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

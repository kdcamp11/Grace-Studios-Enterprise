import { NextRequest, NextResponse } from "next/server";
import { assertClientDesign, isErrorResponse } from "@/lib/api/assert-client-design";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/designs/[design_id]/info
 *
 * Returns summary info for a pre-payment design: team name, sport, uploaded
 * file URL, notes, and current status. Used by the upload-review and checkout
 * pages before a real order exists.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { design_id: string } },
) {
  const ctx = await assertClientDesign(params.design_id);
  if (isErrorResponse(ctx)) return ctx;

  const { designId, clientId } = ctx;
  const admin = createAdminClient();

  const { data: client } = await admin
    .from("clients")
    .select("name, sport")
    .eq("id", clientId)
    .single();

  const { data: brief } = await admin
    .from("briefs")
    .select("client_concept_url, client_photo_url, client_concept_notes, ai_prompt")
    .eq("design_id", designId)
    .maybeSingle();

  const { data: design } = await admin
    .from("designs")
    .select("status, kind")
    .eq("id", designId)
    .single();

  // Pull generated concept renders out of the brief's ai_prompt metadata so the
  // checkout/activation page can show the user what they're activating.
  let renders: {
    frontJersey?: string | null;
    backJersey?:  string | null;
    frontShorts?: string | null;
    backShorts?:  string | null;
  } | null = null;
  if (brief?.ai_prompt) {
    try {
      const meta = JSON.parse(brief.ai_prompt as string) as {
        renders?: typeof renders;
      };
      if (meta.renders?.frontJersey) renders = meta.renders;
    } catch { /* not JSON metadata — ignore */ }
  }

  return NextResponse.json({
    teamName:           client?.name ?? null,
    sport:              client?.sport ?? null,
    clientConceptUrl:   brief?.client_concept_url ?? null,
    clientPhotoUrl:     brief?.client_photo_url ?? null,
    clientConceptNotes: brief?.client_concept_notes ?? null,
    renders,
    status:             design?.status ?? "draft",
    kind:               design?.kind ?? null,
  });
}

/**
 * POST /api/designs/[design_id]/info
 *
 * Saves the client's concept note (their notes about the generated concept
 * they're choosing to activate) to briefs.client_concept_notes. Used by the
 * Creative Activation page before redirecting to checkout.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { design_id: string } },
) {
  const ctx = await assertClientDesign(params.design_id);
  if (isErrorResponse(ctx)) return ctx;

  const { designId, tenantId } = ctx;
  const admin = createAdminClient();

  let body: { notes?: string };
  try {
    body = await req.json() as { notes?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const notes = (body.notes ?? "").trim().slice(0, 4000);

  const { data: existing } = await admin
    .from("briefs")
    .select("id")
    .eq("design_id", designId)
    .maybeSingle();

  if (existing) {
    await admin
      .from("briefs")
      .update({ client_concept_notes: notes || null })
      .eq("id", existing.id);
  } else {
    await admin.from("briefs").insert({
      tenant_id:            tenantId,
      design_id:            designId,
      client_concept_notes: notes || null,
    });
  }

  return NextResponse.json({ ok: true });
}

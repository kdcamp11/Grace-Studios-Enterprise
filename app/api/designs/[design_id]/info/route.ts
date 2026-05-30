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
    .select("client_concept_url, client_concept_notes")
    .eq("design_id", designId)
    .maybeSingle();

  const { data: design } = await admin
    .from("designs")
    .select("status, kind")
    .eq("id", designId)
    .single();

  return NextResponse.json({
    teamName:           client?.name ?? null,
    sport:              client?.sport ?? null,
    clientConceptUrl:   brief?.client_concept_url ?? null,
    clientConceptNotes: brief?.client_concept_notes ?? null,
    status:             design?.status ?? "draft",
    kind:               design?.kind ?? null,
  });
}

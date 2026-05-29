import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/server";
import type { GenerationStatus, DesignMetadata } from "../route";

export async function GET(req: NextRequest) {
  // Require authentication — status response contains brief metadata
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const order_id  = req.nextUrl.searchParams.get("order_id");
  const design_id = req.nextUrl.searchParams.get("design_id");
  if (!order_id && !design_id) {
    return NextResponse.json({ error: "order_id or design_id required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: brief } = design_id
    ? await supabase.from("briefs").select("ai_prompt").eq("design_id", design_id).maybeSingle()
    : await supabase.from("briefs").select("ai_prompt").eq("order_id", order_id!).maybeSingle();

  if (!brief?.ai_prompt) {
    return NextResponse.json({ status: "not_started" as GenerationStatus });
  }

  try {
    const parsed = JSON.parse(brief.ai_prompt as string) as DesignMetadata;
    return NextResponse.json({
      status:      parsed.status      ?? "not_started",
      progress:    parsed.progress    ?? 0,
      total:       parsed.total       ?? 4,
      error:       parsed.error       ?? null,
      startedAt:   parsed.startedAt   ?? null,
      boardFormat: parsed.boardFormat ?? "renders",
    });
  } catch {
    return NextResponse.json({ status: "not_started" as GenerationStatus });
  }
}

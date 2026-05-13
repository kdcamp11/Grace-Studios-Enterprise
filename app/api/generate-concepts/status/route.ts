import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { GenerationStatus, DesignMetadata } from "../route";

export async function GET(req: NextRequest) {
  const order_id = req.nextUrl.searchParams.get("order_id");
  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: brief } = await supabase
    .from("briefs")
    .select("ai_prompt")
    .eq("order_id", order_id)
    .single();

  if (!brief?.ai_prompt) {
    return NextResponse.json({ status: "not_started" as GenerationStatus });
  }

  try {
    const parsed = JSON.parse(brief.ai_prompt as string) as DesignMetadata;
    return NextResponse.json({
      status:    parsed.status    ?? "not_started",
      progress:  parsed.progress  ?? 0,
      total:     parsed.total     ?? 4,
      error:     parsed.error     ?? null,
      startedAt: parsed.startedAt ?? null,
    });
  } catch {
    return NextResponse.json({ status: "not_started" as GenerationStatus });
  }
}

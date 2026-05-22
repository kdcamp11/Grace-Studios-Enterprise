import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RosterPlayer } from "@/types/database";

export async function POST(req: NextRequest) {
  const { order_id, player_roster, player_names } = await req.json() as {
    order_id: string;
    player_roster: RosterPlayer[] | null;
    player_names: boolean;
  };

  if (!order_id) {
    return NextResponse.json({ error: "order_id required" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("briefs")
    .update({ player_roster: player_roster ?? null, player_names })
    .eq("order_id", order_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

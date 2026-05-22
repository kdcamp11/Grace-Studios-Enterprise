import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertRoleTenant, isErrorResponse } from "@/lib/api/assert-role-tenant";

export async function GET(
  _req: NextRequest,
  { params }: { params: { order_id: string } }
) {
  const ctx = await assertRoleTenant(["designer", "admin", "super_admin"]);
  if (isErrorResponse(ctx)) return ctx;

  const admin = createAdminClient();

  const { data: order, error } = await admin
    .from("orders")
    .select(`
      id,
      order_number,
      stage,
      created_at,
      deposit_paid,
      design_fee_paid,
      approved_at,
      clients ( name, sport, city, email ),
      briefs (
        id,
        design_system,
        primary_colors,
        secondary_colors,
        accent_color,
        colors_to_avoid,
        hex_confirmed,
        brand_match,
        negative_references,
        jersey_cut,
        sublimated,
        home_colorway,
        away_colorway,
        number_style,
        player_names,
        logo_placement,
        logos_to_include,
        sponsor_text,
        reference_image_url,
        vision_prompt,
        ai_prompt,
        player_roster
      ),
      concepts (
        id,
        concept_number,
        image_url,
        selected,
        client_feedback,
        created_at
      )
    `)
    .eq("id", params.order_id)
    .eq("tenant_id", ctx.tenant.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ order });
}

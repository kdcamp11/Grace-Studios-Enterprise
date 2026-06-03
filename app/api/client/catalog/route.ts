import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

async function assertAuth() {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return null;
  return user;
}

export async function GET() {
  const user = await assertAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("enabled_sports, enabled_products")
    .eq("id", user.id)
    .single();

  return NextResponse.json({ profile: profile ?? { enabled_sports: [], enabled_products: [] } });
}

export async function PATCH(req: NextRequest) {
  const user = await assertAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    enabled_sports?: string[];
    enabled_products?: string[];
  };

  const updates: Record<string, unknown> = {};
  if (body.enabled_sports   !== undefined) updates.enabled_sports   = body.enabled_sports;
  if (body.enabled_products !== undefined) updates.enabled_products = body.enabled_products;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await createAdminClient()
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

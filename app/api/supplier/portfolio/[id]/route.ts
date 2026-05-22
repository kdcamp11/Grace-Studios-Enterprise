import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const serverClient = createServerClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Verify ownership before deleting
  const { data: item } = await admin
    .from("supplier_portfolio")
    .select("id, image_url")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin
    .from("supplier_portfolio")
    .delete()
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

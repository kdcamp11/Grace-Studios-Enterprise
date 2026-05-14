import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const VALID_ROLES = ["client", "supplier", "admin"] as const;
type Role = typeof VALID_ROLES[number];

export async function POST(req: NextRequest) {
  try {
    const { email, role } = await req.json() as { email?: string; role?: string };

    if (!email || !role) {
      return NextResponse.json({ error: "email and role are required" }, { status: 400 });
    }
    if (!VALID_ROLES.includes(role as Role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Service-role client bypasses RLS — the only way to update another user's profile
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: profile, error: findError } = await admin
      .from("profiles")
      .select("id, email, full_name, company, created_at")
      .eq("email", email.trim().toLowerCase())
      .single();

    if (findError || !profile) {
      return NextResponse.json(
        { error: "No account found with that email. They need to sign up first." },
        { status: 404 },
      );
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", profile.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, profile: { ...profile, role } });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[set-user-role] error:", message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

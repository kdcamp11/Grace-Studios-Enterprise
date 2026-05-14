import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Creates or updates a profile row for a newly signed-up user.
 *
 * Called server-side from the signup page immediately after auth.signUp().
 * Uses the service role key to bypass RLS — required because the user has
 * no active session yet when email confirmation is enabled, so the anon-key
 * client would silently fail the RLS check.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId, email, fullName, company, role } = await req.json() as {
      userId:   string;
      email:    string;
      fullName?: string;
      company?:  string;
      role?:     string;
    };

    if (!userId || !email) {
      return NextResponse.json({ error: "userId and email are required" }, { status: 400 });
    }

    const validRoles = ["client", "supplier", "admin"];
    const safeRole   = validRoles.includes(role ?? "") ? role : "client";

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await admin.from("profiles").upsert(
      {
        id:         userId,
        email:      email.trim().toLowerCase(),
        full_name:  fullName || null,
        company:    company  || null,
        role:       safeRole,
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("[create-profile] upsert error:", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[create-profile] error:", message);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

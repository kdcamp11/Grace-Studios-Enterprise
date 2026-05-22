import { NextResponse } from "next/server";
import { assertAdminTenant, isErrorResponse } from "@/lib/api/assert-admin-tenant";

export async function GET() {
  const ctx = await assertAdminTenant();
  if (isErrorResponse(ctx)) return ctx;

  return NextResponse.json({
    has_replicate:    !!process.env.REPLICATE_API_TOKEN,
    has_anthropic:    !!process.env.GS_ANTHROPIC_API_KEY || !!process.env.ANTHROPIC_API_KEY,
    has_resend:       !!process.env.RESEND_API_KEY,
    has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

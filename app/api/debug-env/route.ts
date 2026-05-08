import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    has_replicate: !!process.env.REPLICATE_API_TOKEN,
    has_anthropic: !!process.env.GS_ANTHROPIC_API_KEY,
    has_resend: !!process.env.RESEND_API_KEY,
    has_supabase_url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

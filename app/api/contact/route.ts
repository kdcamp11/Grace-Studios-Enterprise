import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/contact
 * Accepts consultation form submissions from the landing page.
 * Currently logs to console — wire up an email provider here once
 * the Grace Studios contact email is confirmed.
 */
export async function POST(req: NextRequest) {
  try {
    const { name, email, program, message } = await req.json() as {
      name:    string;
      email:   string;
      program: string;
      message: string;
    };

    if (!name || !email || !message) {
      return NextResponse.json({ error: "name, email, and message are required" }, { status: 400 });
    }

    // TODO: replace with email send when contact address is confirmed
    // e.g. sendEmail({ to: "hello@gracestudios.com", subject: `Consultation request from ${name}`, ... })
    console.log("[contact] consultation request:", { name, email, program, message: message.slice(0, 120) });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

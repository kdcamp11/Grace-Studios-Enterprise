import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.EMAIL_FROM ?? "Grace Athletics <noreply@graceathletics.com>";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json() as { email?: string };

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Service-role client — required to call auth.admin.generateLink()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const appUrl     = process.env.NEXT_PUBLIC_APP_URL ?? "https://gs-first-pass.vercel.app";
    const redirectTo = `${appUrl}/auth/callback?next=/reset-password`;

    // Generate a real Supabase password-recovery link server-side.
    // Returns { data: { properties: { action_link } } } on success.
    // If the email doesn't exist Supabase still returns a link (it's a no-op
    // on their end) so we always show the same success state to the client.
    const { data, error: genError } = await supabase.auth.admin.generateLink({
      type:        "recovery",
      email:       email.trim().toLowerCase(),
      options:     { redirectTo },
    });

    if (genError) {
      console.error("[reset-password] generateLink error:", genError.message);
      return NextResponse.json({ error: genError.message }, { status: 500 });
    }

    const resetLink = data?.properties?.action_link;
    if (!resetLink) {
      console.error("[reset-password] no action_link returned");
      return NextResponse.json({ error: "Could not generate reset link" }, { status: 500 });
    }

    // Send via Resend — same template style as the rest of the app
    await resend.emails.send({
      from:    FROM,
      to:      email.trim(),
      subject: "Reset your Grace Athletics password",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fafafa;border:1px solid #e5e5e5;border-radius:12px;">
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#888;margin:0 0 20px;">Grace Studios</p>
          <h1 style="font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#111;margin:0 0 16px;">Reset Your Password</h1>
          <p style="font-size:14px;color:#444;margin:0 0 28px;line-height:1.6;">
            We received a request to reset the password for your Grace Athletics account.
            Click the button below to choose a new password. This link expires in 1 hour.
          </p>
          <a
            href="${resetLink}"
            style="display:inline-block;padding:14px 28px;background:#111;color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:28px;"
          >
            Reset Password →
          </a>
          <p style="font-size:12px;color:#888;margin:0 0 8px;">
            If you didn't request a password reset, you can safely ignore this email — your password won't change.
          </p>
          <p style="font-size:12px;color:#bbb;margin:0;word-break:break-all;">
            Or copy this link: ${resetLink}
          </p>
          <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 16px;" />
          <p style="font-size:11px;color:#aaa;margin:0;">Grace Studios · Custom Sportswear Platform</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reset-password] unexpected error:", message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

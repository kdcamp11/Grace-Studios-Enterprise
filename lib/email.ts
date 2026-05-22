import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM   = process.env.EMAIL_FROM ?? "Grace Athletics <noreply@graceathletics.com>";
const ADMIN  = process.env.DEFAULT_ADMIN_EMAIL ?? process.env.GRACE_STUDIOS_EMAIL ?? "";

export interface TenantEmailCtx {
  name: string;
  brandColor: string;
  adminEmail?: string | null;
}

// ─── Base template ──────────────────────────────────────────────────────────

function wrap(title: string, body: string, tenant?: TenantEmailCtx) {
  const studio = tenant?.name ?? "Grace Studios";
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#fafafa;border:1px solid #e5e5e5;border-radius:12px;">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#888;margin:0 0 20px;">${studio}</p>
      <h1 style="font-size:22px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#111;margin:0 0 24px;">${title}</h1>
      ${body}
      <hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0 16px;" />
      <p style="font-size:11px;color:#aaa;margin:0;">${studio} · Custom Sportswear Platform</p>
    </div>
  `;
}

function ctaButton(text: string, href: string, color = "#111") {
  return `<a href="${href}" style="display:inline-block;padding:14px 28px;background:${color};color:#fff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:24px;">${text}</a>`;
}

function row(label: string, value: string) {
  return `<tr><td style="padding:6px 0;font-size:12px;color:#888;width:140px;vertical-align:top;">${label}</td><td style="padding:6px 0;font-size:13px;color:#111;">${value}</td></tr>`;
}

function table(rows: string) {
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${rows}</table>`;
}

function adminTo(tenant?: TenantEmailCtx) {
  return tenant?.adminEmail ?? ADMIN;
}

// ─── Email senders ──────────────────────────────────────────────────────────

/** Admin is notified when a client submits a new brief */
export async function sendBriefSubmitted({
  orderNumber, teamName, sport, city, email, tenant,
}: {
  orderNumber: string; teamName: string; sport: string; city: string; email: string;
  tenant?: TenantEmailCtx;
}) {
  return resend.emails.send({
    from: FROM, to: adminTo(tenant),
    subject: `New Brief Submitted — ${teamName} (${orderNumber})`,
    html: wrap("New Brief Submitted", `
      <p style="font-size:14px;color:#444;margin:0 0 20px;">A client has submitted their design brief and AI concept generation has begun.</p>
      ${table([
        row("Order #", orderNumber),
        row("Team", teamName),
        row("Sport", sport),
        row("City", city),
        row("Contact", email),
      ].join(""))}
      <p style="font-size:13px;color:#666;">Concepts should be ready within 1–3 minutes. Check the admin portal to review.</p>
    `, tenant),
  });
}

/** Client is notified when their AI concepts are ready to review */
export async function sendConceptsReady({
  clientEmail, teamName, orderNumber, orderId, tenant,
}: {
  clientEmail: string; teamName: string; orderNumber: string; orderId: string;
  tenant?: TenantEmailCtx;
}) {
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000"}/orders/${orderId}/concepts`;
  const color = tenant?.brandColor ?? "#111";
  return resend.emails.send({
    from: FROM, to: clientEmail,
    subject: `Your concepts are ready — ${teamName}`,
    html: wrap("Your Concepts Are Ready", `
      <p style="font-size:14px;color:#444;margin:0 0 20px;">
        Great news! We've generated 4 custom jersey concepts for <strong>${teamName}</strong> (Order ${orderNumber}).
        Review them now and select the direction you want to move forward with.
      </p>
      ${ctaButton("View Your Concepts →", link, color)}
      <p style="font-size:12px;color:#888;margin:0;">Once you select a concept, you'll be able to review all production details and approve your order.</p>
    `, tenant),
  });
}

/** Admin is notified when a supplier submits first piece media for review */
export async function sendFirstPieceSubmitted({
  orderNumber, teamName, supplierName, tenant,
}: {
  orderNumber: string; teamName: string; supplierName: string;
  tenant?: TenantEmailCtx;
}) {
  return resend.emails.send({
    from: FROM, to: adminTo(tenant),
    subject: `First Piece Ready for Review — ${teamName} (${orderNumber})`,
    html: wrap("First Piece Submitted", `
      <p style="font-size:14px;color:#444;margin:0 0 20px;">
        <strong>${supplierName}</strong> has submitted first piece media for your review.
      </p>
      ${table([
        row("Order #", orderNumber),
        row("Team", teamName),
        row("Supplier", supplierName),
      ].join(""))}
      <p style="font-size:13px;color:#666;">Log into the admin portal to review the uploads before they're sent to the client.</p>
    `, tenant),
  });
}

/** Client is notified when admin approves and publishes first piece media */
export async function sendFirstPieceReady({
  clientEmail, teamName, orderNumber, orderId, tenant,
}: {
  clientEmail: string; teamName: string; orderNumber: string; orderId: string;
  tenant?: TenantEmailCtx;
}) {
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://localhost:3000"}/orders/${orderId}/tracker`;
  const color = tenant?.brandColor ?? "#111";
  return resend.emails.send({
    from: FROM, to: clientEmail,
    subject: `Your first piece is ready to review — ${teamName}`,
    html: wrap("First Piece Ready", `
      <p style="font-size:14px;color:#444;margin:0 0 20px;">
        Your first jersey sample is ready! Review the photos and video in your client portal and let us know what you think.
      </p>
      ${ctaButton("Review Your First Piece →", link, color)}
      ${table([
        row("Order #", orderNumber),
        row("Team", teamName),
      ].join(""))}
      <p style="font-size:12px;color:#888;margin:0;">Once you approve the first piece, we'll move forward with bulk production.</p>
    `, tenant),
  });
}

/** Admin is notified when client approves the first piece */
export async function sendClientApprovedFirstPiece({
  orderNumber, teamName, clientNote, tenant,
}: {
  orderNumber: string; teamName: string; clientNote: string | null;
  tenant?: TenantEmailCtx;
}) {
  return resend.emails.send({
    from: FROM, to: adminTo(tenant),
    subject: `First Piece Approved by Client — ${teamName} (${orderNumber})`,
    html: wrap("Client Approved First Piece", `
      <p style="font-size:14px;color:#444;margin:0 0 20px;">
        <strong>${teamName}</strong> has approved the first piece sample. You can now advance the order to bulk production.
      </p>
      ${table([
        row("Order #", orderNumber),
        row("Team", teamName),
        ...(clientNote ? [row("Client Note", clientNote)] : []),
      ].join(""))}
    `, tenant),
  });
}

/** Admin is notified when client requests changes on the first piece */
export async function sendClientRequestedChanges({
  orderNumber, teamName, clientNote, tenant,
}: {
  orderNumber: string; teamName: string; clientNote: string | null;
  tenant?: TenantEmailCtx;
}) {
  return resend.emails.send({
    from: FROM, to: adminTo(tenant),
    subject: `Client Requested Changes — ${teamName} (${orderNumber})`,
    html: wrap("Changes Requested by Client", `
      <p style="font-size:14px;color:#444;margin:0 0 20px;">
        <strong>${teamName}</strong> has reviewed the first piece and is requesting changes.
      </p>
      ${table([
        row("Order #", orderNumber),
        row("Team", teamName),
        ...(clientNote ? [row("Client Note", clientNote)] : []),
      ].join(""))}
      <p style="font-size:13px;color:#666;">Review the feedback and coordinate with the production partner.</p>
    `, tenant),
  });
}

/** Supplier is notified when admin requests changes on their upload */
export async function sendChangesRequested({
  supplierEmail, orderNumber, teamName, adminNote, tenant,
}: {
  supplierEmail: string; orderNumber: string; teamName: string; adminNote: string | null;
  tenant?: TenantEmailCtx;
}) {
  const studio = tenant?.name ?? "Grace Studios";
  return resend.emails.send({
    from: FROM, to: supplierEmail,
    subject: `Changes Requested — ${teamName} (${orderNumber})`,
    html: wrap("Changes Requested", `
      <p style="font-size:14px;color:#444;margin:0 0 20px;">
        ${studio} has reviewed your first piece submission and is requesting changes before it's sent to the client.
      </p>
      ${table([
        row("Order #", orderNumber),
        row("Team", teamName),
        ...(adminNote ? [row("Note", adminNote)] : []),
      ].join(""))}
      <p style="font-size:13px;color:#666;">Log into your supplier portal to review the feedback and upload revised media.</p>
    `, tenant),
  });
}

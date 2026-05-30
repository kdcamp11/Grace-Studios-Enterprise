import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/svg+xml",
  "application/postscript",       // EPS / AI (classic MIME)
  "application/illustrator",      // AI files in some browsers
  "application/x-illustrator",    // AI files variant
  "application/eps",
  "application/x-eps",
  "image/x-eps",
  "application/octet-stream",     // Many .ai files upload as binary — checked by extension below
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

// Extension-based fallback for files that upload as octet-stream
const ALLOWED_EXTENSIONS = [".ai", ".eps", ".pdf", ".svg", ".jpg", ".jpeg", ".png", ".webp"];

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * POST /api/orders/[order_id]/upload-concept
 *
 * Accepts a multipart/form-data upload with a `file` field.
 * - Uploads the file to Supabase Storage under `client-concepts/{order_id}/`
 * - Saves the public URL to briefs.client_concept_url
 * - Sets orders.concept_source = 'client_provided'
 * - Saves any text notes to briefs.client_concept_notes
 *
 * Returns { url, orderId }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { order_id: string } },
) {
  const limited = rateLimit(req, { limit: 5, windowMs: 60 * 1000 });
  if (limited) return limited;

  const ctx = await assertClientOrder(params.order_id);
  if (isErrorResponse(ctx)) return ctx;

  const { orderId, tenantId } = ctx;

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file  = formData.get("file") as File | null;
  const notes = (formData.get("notes") as string | null) ?? "";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
  const mimeAllowed = ALLOWED_MIME_TYPES.includes(file.type);
  const extAllowed  = ALLOWED_EXTENSIONS.includes(fileExt);

  if (!mimeAllowed && !extAllowed) {
    return NextResponse.json(
      { error: "File type not allowed. Upload a design file (.ai, .eps, .pdf, .svg) or a photo (.jpg, .png, .webp)." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Upload to Supabase Storage
  const ext       = file.name.split(".").pop() ?? "bin";
  const storagePath = `client-concepts/${tenantId}/${orderId}/${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);

  const { error: uploadError } = await admin.storage
    .from("order-files")
    .upload(storagePath, buffer, {
      contentType:  file.type,
      upsert:       true,
    });

  if (uploadError) {
    console.error("[upload-concept] storage error:", uploadError);
    return NextResponse.json({ error: "File upload failed. Please try again." }, { status: 500 });
  }

  const { data: publicUrl } = admin.storage
    .from("order-files")
    .getPublicUrl(storagePath);

  const conceptUrl = publicUrl.publicUrl;

  // Upsert the brief row with the concept URL, notes, and mark concept_source
  const { data: existingBrief } = await admin
    .from("briefs")
    .select("id")
    .eq("order_id", orderId)
    .single();

  if (existingBrief) {
    await admin
      .from("briefs")
      .update({
        client_concept_url:   conceptUrl,
        client_concept_notes: notes || null,
      })
      .eq("id", existingBrief.id);
  } else {
    await admin.from("briefs").insert({
      tenant_id:            tenantId,
      order_id:             orderId,
      client_concept_url:   conceptUrl,
      client_concept_notes: notes || null,
    });
  }

  // Mark the order as client-provided concept
  await admin
    .from("orders")
    .update({ concept_source: "client_provided" })
    .eq("id", orderId);

  return NextResponse.json({ url: conceptUrl, orderId });
}

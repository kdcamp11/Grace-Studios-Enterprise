import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientDesign, isErrorResponse } from "@/lib/api/assert-client-design";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/svg+xml",
  "application/postscript",
  "application/illustrator",
  "application/x-illustrator",
  "application/eps",
  "application/x-eps",
  "image/x-eps",
  "application/octet-stream",
];

const ALLOWED_EXTENSIONS = [".ai", ".eps", ".pdf", ".svg"];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * POST /api/designs/[design_id]/upload-concept
 *
 * Design-keyed version of the upload-concept endpoint. Used in the pre-payment
 * flow where no order exists yet. Uploads the file to Supabase Storage under
 * client-concepts/{tenantId}/{designId}/ and saves the URL to a briefs row
 * linked by design_id (order_id will be stamped by the webhook at payment).
 *
 * Returns { url, designId }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { design_id: string } },
) {
  const limited = rateLimit(req, { limit: 5, windowMs: 60 * 1000 });
  if (limited) return limited;

  const ctx = await assertClientDesign(params.design_id);
  if (isErrorResponse(ctx)) return ctx;

  const { designId, tenantId } = ctx;

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

  const fileExt    = `.${file.name.split(".").pop()?.toLowerCase()}`;
  const mimeOk     = ALLOWED_MIME_TYPES.includes(file.type);
  const extOk      = ALLOWED_EXTENSIONS.includes(fileExt);

  if (!mimeOk && !extOk) {
    return NextResponse.json(
      { error: "File type not allowed. Upload a production-ready file: Adobe Illustrator (.ai), EPS, PDF, or SVG." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "File too large. Maximum size is 50MB." }, { status: 400 });
  }

  const admin = createAdminClient();

  const storagePath = `client-concepts/${tenantId}/${designId}/${Date.now()}${fileExt}`;
  const buffer      = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("order-files")
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("[designs/upload-concept] storage error:", uploadError);
    return NextResponse.json({ error: "File upload failed. Please try again." }, { status: 500 });
  }

  const { data: publicUrlData } = admin.storage.from("order-files").getPublicUrl(storagePath);
  const conceptUrl = publicUrlData.publicUrl;

  // Upsert brief row linked by design_id.
  // NOTE: briefs.order_id is still NOT NULL (migration 021 adds design_id but
  // leaves order_id required). Migration 022 makes order_id nullable. Until
  // 022 is applied, this insert path is blocked — the upload flow uses the
  // existing order-keyed route (/api/orders/[order_id]/upload-concept) for
  // orders that were created via the legacy flow. This endpoint activates
  // fully once 022_briefs_order_nullable.sql is deployed.
  const { data: existingBrief } = await admin
    .from("briefs")
    .select("id")
    .eq("design_id", designId)
    .maybeSingle();

  if (existingBrief) {
    await admin.from("briefs").update({
      client_concept_url:   conceptUrl,
      client_concept_notes: notes || null,
    }).eq("id", existingBrief.id);
  } else {
    await admin.from("briefs").insert({
      tenant_id:            tenantId,
      design_id:            designId,
      client_concept_url:   conceptUrl,
      client_concept_notes: notes || null,
    });
  }

  // Mark the design as submitted (file uploaded)
  await admin.from("designs").update({ status: "submitted" }).eq("id", designId);

  return NextResponse.json({ url: conceptUrl, designId });
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertClientOrder, isErrorResponse } from "@/lib/api/assert-client-order";
import { rateLimit } from "@/lib/rate-limit";

// Production-ready design file formats.
const DESIGN_MIME_TYPES = [
  "application/pdf",
  "image/svg+xml",
  "application/postscript",       // EPS / AI (classic MIME)
  "application/illustrator",      // AI files in some browsers
  "application/x-illustrator",    // AI files variant
  "application/eps",
  "application/x-eps",
  "image/x-eps",
  "application/octet-stream",     // Many .ai files upload as binary — checked by extension below
];
const DESIGN_EXTENSIONS = [".ai", ".eps", ".pdf", ".svg"];

// Reference photo formats.
const PHOTO_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const PHOTO_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function extOf(name: string): string {
  return `.${name.split(".").pop()?.toLowerCase() ?? ""}`;
}

/**
 * POST /api/orders/[order_id]/upload-concept
 *
 * Accepts a multipart/form-data upload with TWO required files:
 *   - `file`  → production design file (.ai/.eps/.pdf/.svg) → briefs.client_concept_url
 *   - `photo` → reference photo (.jpg/.png/.webp)           → briefs.client_photo_url
 * Also:
 *   - Saves any text notes to briefs.client_concept_notes
 *   - Sets orders.concept_source = 'client_provided'
 *
 * Returns { url, photoUrl, orderId }
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

  const file  = formData.get("file")  as File | null;
  const photo = formData.get("photo") as File | null;
  const notes = (formData.get("notes") as string | null) ?? "";

  if (!file) {
    return NextResponse.json({ error: "A design file is required" }, { status: 400 });
  }
  if (!photo) {
    return NextResponse.json({ error: "A reference photo is required" }, { status: 400 });
  }

  // Validate design file
  const fileExt = extOf(file.name);
  if (!DESIGN_MIME_TYPES.includes(file.type) && !DESIGN_EXTENSIONS.includes(fileExt)) {
    return NextResponse.json(
      { error: "Design file type not allowed. Upload a .ai, .eps, .pdf, or .svg file." },
      { status: 400 },
    );
  }

  // Validate photo
  const photoExt = extOf(photo.name);
  if (!PHOTO_MIME_TYPES.includes(photo.type) && !PHOTO_EXTENSIONS.includes(photoExt)) {
    return NextResponse.json(
      { error: "Photo type not allowed. Upload a .jpg, .png, or .webp image." },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE_BYTES || photo.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Upload helper — returns the public URL or null on failure.
  const uploadOne = async (f: File, kind: string): Promise<string | null> => {
    const ext         = f.name.split(".").pop() ?? "bin";
    const storagePath = `client-concepts/${tenantId}/${orderId}/${kind}-${Date.now()}.${ext}`;
    const buffer      = Buffer.from(await f.arrayBuffer());
    const { error }   = await admin.storage
      .from("order-files")
      .upload(storagePath, buffer, { contentType: f.type, upsert: true });
    if (error) {
      console.error(`[upload-concept] ${kind} storage error:`, error);
      return null;
    }
    return admin.storage.from("order-files").getPublicUrl(storagePath).data.publicUrl;
  };

  const conceptUrl = await uploadOne(file,  "design");
  const photoUrl   = await uploadOne(photo, "photo");

  if (!conceptUrl || !photoUrl) {
    return NextResponse.json({ error: "File upload failed. Please try again." }, { status: 500 });
  }

  // Upsert the brief row with both URLs, notes, and mark concept_source
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
        client_photo_url:     photoUrl,
        client_concept_notes: notes || null,
      })
      .eq("id", existingBrief.id);
  } else {
    await admin.from("briefs").insert({
      tenant_id:            tenantId,
      order_id:             orderId,
      client_concept_url:   conceptUrl,
      client_photo_url:     photoUrl,
      client_concept_notes: notes || null,
    });
  }

  // Mark the order as client-provided concept
  await admin
    .from("orders")
    .update({ concept_source: "client_provided" })
    .eq("id", orderId);

  return NextResponse.json({ url: conceptUrl, photoUrl, orderId });
}

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createB2UploadTicket } from "@/lib/security/b2-upload-ticket";
import { createCoverUploadTicket } from "@/lib/security/cover-upload-ticket";
import { createB2StorageManager } from "@/lib/storage/b2-server";
import { b2MetadataCategory, b2ObjectKey, validateB2UploadPolicy } from "@/lib/storage/b2-upload-policy";
import { createStorageMetadataRepository } from "@/lib/storage/metadata-repository";
import { createStorageManager } from "@/lib/storage/server";
import { assertStorageQuota, quotaExceededResponse } from "@/lib/system/quota";

const uploadSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive().max(5_242_880),
  sha256: z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/).nullable().optional(),
});

function selectedProvider() {
  return process.env.CONTENT_COVER_STORAGE_PROVIDER?.trim().toLowerCase() === "supabase" ? "supabase" : "b2";
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "封面需為 JPG、PNG 或 WebP，且不得超過 5 MB。" }, { status: 400 });
  if (selectedProvider() === "b2") {
    const bucket = process.env.B2_BUCKET_NAME?.trim();
    if (!bucket) return NextResponse.json({ error: "B2 儲存服務尚未設定。" }, { status: 503 });
    const metadata = createStorageMetadataRepository();
    let pendingId: string | null = null;
    try {
      validateB2UploadPolicy("content-cover", parsed.data.byteSize, parsed.data.mimeType);
      const objectKey = b2ObjectKey(context.userId, "content-cover", randomUUID());
      const pending = await metadata.reservePending({ userId: context.userId, provider: "b2", bucket, objectKey, category: b2MetadataCategory("content-cover"), byteSize: parsed.data.byteSize, mimeType: parsed.data.mimeType, checksum: parsed.data.sha256 ?? null }, 3600);
      pendingId = pending.id;
      const { data: signed, error } = await createB2StorageManager().createSignedUploadUrl(bucket, objectKey, { contentType: parsed.data.mimeType, checksumSha256: parsed.data.sha256 ?? undefined });
      if (error || !signed) throw error ?? new Error("B2 signed upload URL was not created.");
      const expiresAt = Date.now() + 10 * 60 * 1000;
      return NextResponse.json({ provider: "b2", storageObjectId: pending.id, method: "PUT", uploadUrl: signed.signedUrl, headers: signed.headers ?? {}, ticket: createB2UploadTicket({ ownerId: context.userId, storageObjectId: pending.id, bucket, objectKey, purpose: "content-cover", byteSize: parsed.data.byteSize, mimeType: parsed.data.mimeType, sha256: parsed.data.sha256 ?? null, expiresAt }), expiresAt }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (cause) {
      if (pendingId) await metadata.markFailed(pendingId, context.userId).catch(() => undefined);
      const quotaError = quotaExceededResponse(cause);
      return NextResponse.json(quotaError ?? { error: "暫時無法準備封面上傳。" }, { status: quotaError ? 413 : 503 });
    }
  }
  try {
    await assertStorageQuota(context.userId, parsed.data.byteSize);
    const storagePath = `${context.userId}/covers/${randomUUID()}`;
    const { data, error } = await createStorageManager().createSignedUploadUrl("content-covers", storagePath);
    if (error || !data) throw error;
    return NextResponse.json({
      provider: "supabase",
      storagePath,
      token: data.token,
      ticket: createCoverUploadTicket({ ownerId: context.userId, storagePath, mimeType: parsed.data.mimeType, byteSize: parsed.data.byteSize, expiresAt: Date.now() + 10 * 60 * 1000 }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const quotaError = quotaExceededResponse(cause);
    return NextResponse.json(quotaError ?? { error: "暫時無法準備封面上傳。" }, { status: quotaError ? 413 : 503 });
  }
}

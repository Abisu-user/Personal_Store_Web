import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createB2UploadTicket } from "@/lib/security/b2-upload-ticket";
import { getSecurityContext } from "@/lib/security/activity";
import { createB2StorageManager } from "@/lib/storage/b2-server";
import { b2ObjectKey, b2UploadPurposes, validateB2UploadPolicy } from "@/lib/storage/b2-upload-policy";
import { createStorageMetadataRepository } from "@/lib/storage/metadata-repository";
import { quotaExceededResponse } from "@/lib/system/quota";

const uploadSchema = z.object({
  purpose: z.enum(b2UploadPurposes),
  byteSize: z.number().int().positive(),
  mimeType: z.string().trim().min(1).max(150),
  sha256: z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/).nullable().optional(),
});

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "上傳資訊無效。" }, { status: 400 });

  try {
    validateB2UploadPolicy(parsed.data.purpose, parsed.data.byteSize, parsed.data.mimeType);
  } catch {
    return NextResponse.json({ error: "檔案類型或大小不符合此上傳用途。" }, { status: 400 });
  }

  const bucket = process.env.B2_BUCKET_NAME?.trim();
  if (!bucket) return NextResponse.json({ error: "B2 儲存服務尚未設定。" }, { status: 503 });

  const metadata = createStorageMetadataRepository();
  let pendingId: string | null = null;
  try {
    const objectKey = b2ObjectKey(context.userId, parsed.data.purpose, randomUUID());
    const pending = await metadata.reservePending({
      userId: context.userId,
      provider: "b2",
      bucket,
      objectKey,
      category: parsed.data.purpose,
      byteSize: parsed.data.byteSize,
      mimeType: parsed.data.mimeType,
      checksum: parsed.data.sha256 ?? null,
    }, 3600);
    pendingId = pending.id;

    const { data: signed, error } = await createB2StorageManager().createSignedUploadUrl(bucket, objectKey, {
      contentType: parsed.data.mimeType,
      checksumSha256: parsed.data.sha256 ?? undefined,
    });
    if (error || !signed) throw error ?? new Error("B2 signed upload URL was not created.");

    const expiresAt = Date.now() + 10 * 60 * 1000;
    const ticket = createB2UploadTicket({
      ownerId: context.userId,
      storageObjectId: pending.id,
      bucket,
      objectKey,
      purpose: parsed.data.purpose,
      byteSize: parsed.data.byteSize,
      mimeType: parsed.data.mimeType,
      sha256: parsed.data.sha256 ?? null,
      expiresAt,
    });
    return NextResponse.json({
      storageObjectId: pending.id,
      method: "PUT",
      uploadUrl: signed.signedUrl,
      headers: signed.headers ?? {},
      ticket,
      expiresAt,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    if (pendingId) await metadata.markFailed(pendingId, context.userId).catch(() => undefined);
    const quotaError = quotaExceededResponse(cause);
    return NextResponse.json(quotaError ?? { error: "暫時無法準備 B2 上傳。" }, { status: quotaError ? 413 : 503 });
  }
}

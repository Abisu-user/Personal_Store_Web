import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createB2UploadTicket } from "@/lib/security/b2-upload-ticket";
import { BACKGROUND_IMAGE_MAX_BYTES, backgroundImageExtensionForMimeType, backgroundImageMimeTypes, normalizeBackgroundImageMimeType } from "@/lib/appearance/background-image-format";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createB2StorageManager } from "@/lib/storage/b2-server";
import { b2MetadataCategory, b2ObjectKey, type B2UploadPurpose, validateB2UploadPolicy } from "@/lib/storage/b2-upload-policy";
import { createStorageMetadataRepository } from "@/lib/storage/metadata-repository";
import { createStorageManager } from "@/lib/storage/server";
import { quotaExceededResponse } from "@/lib/system/quota";

const uploadSchema = z.object({
  device: z.enum(["desktop", "mobile"]),
  byteSize: z.number().int().positive(),
  mimeType: z.string().trim().min(1).max(150),
  sha256: z.string().trim().toLowerCase().regex(/^[a-f0-9]{64}$/).nullable().optional(),
});
const deleteSchema = z.object({ device: z.enum(["desktop", "mobile"]), reference: z.string().max(600) });
const legacyReferencePrefix = "workspace-storage:";
const objectReferencePrefix = "workspace-object:";
const objectIdPattern = /^[0-9a-f-]{36}$/i;
const purposeFor = (device: "desktop" | "mobile") => `workspace-background-${device}` as B2UploadPurpose;

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "背景圖片上傳資料無效。" }, { status: 400 });
  if (parsed.data.byteSize > BACKGROUND_IMAGE_MAX_BYTES) return NextResponse.json({ error: "圖片大小超過上限。單張背景圖片不可超過 8 MB。" }, { status: 413 });
  const mimeType = normalizeBackgroundImageMimeType(parsed.data.mimeType);
  if (!mimeType || !backgroundImageMimeTypes.includes(mimeType)) return NextResponse.json({ error: "不支援此圖片格式。請使用 JPG、JPEG、PNG、WebP 或 AVIF。" }, { status: 400 });
  const purpose = purposeFor(parsed.data.device);
  const bucket = process.env.B2_BUCKET_NAME?.trim();
  if (!bucket) return NextResponse.json({ error: "B2 儲存服務尚未設定。" }, { status: 503 });
  const metadata = createStorageMetadataRepository();
  let pendingId: string | null = null;
  try {
    validateB2UploadPolicy(purpose, parsed.data.byteSize, mimeType);
    const objectKey = `${b2ObjectKey(context.userId, purpose, crypto.randomUUID())}${backgroundImageExtensionForMimeType(mimeType) ?? ""}`;
    const pending = await metadata.reservePending({ userId: context.userId, provider: "b2", bucket, objectKey, category: b2MetadataCategory(purpose), byteSize: parsed.data.byteSize, mimeType, checksum: parsed.data.sha256 ?? null }, 3600);
    pendingId = pending.id;
    const { data: signed, error } = await createB2StorageManager().createSignedUploadUrl(bucket, objectKey, { contentType: mimeType, checksumSha256: parsed.data.sha256 ?? undefined });
    if (error || !signed) throw error ?? new Error("B2 signed upload URL was not created.");
    const expiresAt = Date.now() + 10 * 60 * 1000;
    return NextResponse.json({ storageObjectId: pending.id, method: "PUT", uploadUrl: signed.signedUrl, headers: signed.headers ?? {}, ticket: createB2UploadTicket({ ownerId: context.userId, storageObjectId: pending.id, bucket, objectKey, purpose, byteSize: parsed.data.byteSize, mimeType, sha256: parsed.data.sha256 ?? null, expiresAt }), expiresAt }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    if (pendingId) await metadata.markFailed(pendingId, context.userId).catch(() => undefined);
    const quotaError = quotaExceededResponse(cause);
    return NextResponse.json(quotaError ?? { error: "目前無法準備背景上傳。" }, { status: quotaError ? 413 : 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "背景圖片資料無效。" }, { status: 400 });
  const objectId = parsed.data.reference.startsWith(objectReferencePrefix) ? parsed.data.reference.slice(objectReferencePrefix.length) : "";
  const legacyPath = parsed.data.reference.startsWith(legacyReferencePrefix) ? parsed.data.reference.slice(legacyReferencePrefix.length) : "";
  if (!objectIdPattern.test(objectId) && !legacyPath.startsWith(`${context.userId}/${parsed.data.device}/`)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const admin = createAdminClient();
    if (objectId) {
      const object = await createStorageMetadataRepository(admin).findOwnedActive(objectId, context.userId);
      const expectedPrefix = `${context.userId}/${purposeFor(parsed.data.device)}/`;
      if (!object || object.provider !== "b2" || object.category !== "workspace-backgrounds" || !object.objectKey.startsWith(expectedPrefix)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const { error: deleteError } = await createB2StorageManager().delete(object.bucket, [object.objectKey]);
      if (deleteError) throw deleteError;
      const { error: metadataError } = await admin.from("storage_objects").update({ status: "failed", deleted_at: new Date().toISOString(), reservation_expires_at: null }).eq("id", object.id).eq("user_id", context.userId).eq("status", "active");
      if (metadataError) throw metadataError;
    } else {
      const { error: deleteError } = await createStorageManager(admin).delete("workspace-backgrounds", [legacyPath]);
      if (deleteError) throw deleteError;
    }
    const { data: row } = await admin.from("user_appearance_settings").select("preferences").eq("user_id", context.userId).eq("device_type", parsed.data.device).maybeSingle();
    if (row?.preferences && typeof row.preferences === "object") {
      const preferences = row.preferences as Record<string, unknown>;
      const images = Array.isArray(preferences.backgroundImages) ? preferences.backgroundImages.filter((image) => image !== parsed.data.reference) : [];
      const currentIndex = typeof preferences.backgroundActiveIndex === "number" ? preferences.backgroundActiveIndex : 0;
      const activeIndex = Math.min(currentIndex, Math.max(0, images.length - 1));
      await admin.from("user_appearance_settings").update({ preferences: { ...preferences, backgroundImages: images, backgroundActiveIndex: activeIndex, backgroundImage: images[activeIndex] } }).eq("user_id", context.userId).eq("device_type", parsed.data.device);
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "目前無法移除背景圖片。" }, { status: 503 });
  }
}

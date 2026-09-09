import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { verifyB2UploadTicket } from "@/lib/security/b2-upload-ticket";
import { getSecurityContext } from "@/lib/security/activity";
import { createB2StorageManager } from "@/lib/storage/b2-server";
import { createStorageMetadataRepository } from "@/lib/storage/metadata-repository";
import { b2MetadataCategory } from "@/lib/storage/b2-upload-policy";

const finalizeSchema = z.object({ ticket: z.string().min(1).max(4000) });

function normalizedMime(value: string | null) {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = finalizeSchema.safeParse(await request.json().catch(() => null));
  const ticket = parsed.success ? verifyB2UploadTicket(parsed.data.ticket) : null;
  if (!ticket || ticket.ownerId !== context.userId) {
    return NextResponse.json({ error: "上傳憑證無效或已過期。" }, { status: 400 });
  }

  const metadata = createStorageMetadataRepository();
  try {
    const pending = await metadata.findOwnedPending(ticket.storageObjectId, context.userId);
    if (!pending || pending.provider !== "b2" || pending.bucket !== ticket.bucket || pending.objectKey !== ticket.objectKey || pending.category !== b2MetadataCategory(ticket.purpose)) {
      return NextResponse.json({ error: "找不到等待確認的上傳資料。" }, { status: 409 });
    }
    if (pending.byteSize !== ticket.byteSize || normalizedMime(pending.mimeType) !== normalizedMime(ticket.mimeType) || pending.checksum !== ticket.sha256) {
      await metadata.markFailed(pending.id, context.userId);
      return NextResponse.json({ error: "等待確認的上傳資料不一致。" }, { status: 422 });
    }

    const { data: object, error } = await createB2StorageManager().head(ticket.bucket, ticket.objectKey);
    if (error || !object) {
      return NextResponse.json({ error: "B2 尚未回報已上傳物件，請稍後重試。" }, { status: 503 });
    }

    const sizeMatches = object.byteSize === ticket.byteSize;
    const mimeMatches = normalizedMime(object.contentType) === normalizedMime(ticket.mimeType);
    const checksumMatches = ticket.sha256 === null || object.checksumSha256 === ticket.sha256;
    if (!sizeMatches || !mimeMatches || !checksumMatches || !object.name.startsWith(`${context.userId}/`)) {
      await metadata.markFailed(pending.id, context.userId);
      return NextResponse.json({ error: "B2 檔案驗證失敗，大小、類型或校驗碼不一致。" }, { status: 422 });
    }

    const active = await metadata.activateOwned({
      id: pending.id,
      userId: context.userId,
      byteSize: ticket.byteSize,
      mimeType: normalizedMime(object.contentType),
      checksum: ticket.sha256,
    });
    return NextResponse.json({
      storageObjectId: active.id,
      status: active.status,
      byteSize: active.byteSize,
      mimeType: active.mimeType,
      checksum: active.checksum,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "暫時無法完成 B2 上傳確認。" }, { status: 503 });
  }
}

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createCoverUploadTicket } from "@/lib/security/cover-upload-ticket";
import { createStorageManager } from "@/lib/storage/server";
import { assertStorageQuota, quotaExceededResponse } from "@/lib/system/quota";

const uploadSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive().max(5_242_880),
});

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "封面需為 JPG、PNG 或 WebP，且不得超過 5 MB。" }, { status: 400 });
  try {
    await assertStorageQuota(context.userId, parsed.data.byteSize);
    const storagePath = `${context.userId}/covers/${randomUUID()}`;
    const { data, error } = await createStorageManager().createSignedUploadUrl("content-covers", storagePath);
    if (error || !data) throw error;
    return NextResponse.json({
      storagePath,
      token: data.token,
      ticket: createCoverUploadTicket({ ownerId: context.userId, storagePath, mimeType: parsed.data.mimeType, byteSize: parsed.data.byteSize, expiresAt: Date.now() + 10 * 60 * 1000 }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const quotaError = quotaExceededResponse(cause);
    return NextResponse.json(quotaError ?? { error: "暫時無法準備封面上傳。" }, { status: quotaError ? 413 : 503 });
  }
}

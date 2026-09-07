import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertStorageQuota, quotaExceededResponse } from "@/lib/system/quota";

const uploadSchema = z.object({
  device: z.enum(["desktop", "mobile"]),
  byteSize: z.number().int().positive().max(8_388_608),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
const deleteSchema = z.object({ device: z.enum(["desktop", "mobile"]), reference: z.string().max(600) });
const referencePrefix = "workspace-storage:";

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = uploadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "背景圖片必須是 8 MB 以下的 JPG、PNG 或 WebP。" }, { status: 400 });
  try {
    await assertStorageQuota(context.userId, parsed.data.byteSize);
    const extension = parsed.data.mimeType === "image/png" ? "png" : parsed.data.mimeType === "image/jpeg" ? "jpg" : "webp";
    const path = `${context.userId}/${parsed.data.device}/${randomUUID()}.${extension}`;
    const { data, error } = await createAdminClient().storage.from("workspace-backgrounds").createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error("UPLOAD_TICKET_FAILED");
    return NextResponse.json({ storagePath: path, token: data.token }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const quotaError = quotaExceededResponse(cause);
    return NextResponse.json(quotaError ?? { error: "目前無法準備背景上傳。" }, { status: quotaError ? 413 : 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "背景圖片資料無效。" }, { status: 400 });
  const path = parsed.data.reference.startsWith(referencePrefix) ? parsed.data.reference.slice(referencePrefix.length) : "";
  if (!path.startsWith(`${context.userId}/${parsed.data.device}/`)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const admin = createAdminClient();
    const { data: row } = await admin.from("user_appearance_settings").select("preferences").eq("user_id", context.userId).eq("device_type", parsed.data.device).maybeSingle();
    if (row?.preferences && typeof row.preferences === "object") {
      const preferences = row.preferences as Record<string, unknown>;
      const images = Array.isArray(preferences.backgroundImages) ? preferences.backgroundImages.filter((image) => image !== parsed.data.reference) : [];
      const currentIndex = typeof preferences.backgroundActiveIndex === "number" ? preferences.backgroundActiveIndex : 0;
      const activeIndex = Math.min(currentIndex, Math.max(0, images.length - 1));
      await admin.from("user_appearance_settings").update({ preferences: { ...preferences, backgroundImages: images, backgroundActiveIndex: activeIndex, backgroundImage: images[activeIndex] } }).eq("user_id", context.userId).eq("device_type", parsed.data.device);
    }
    const { error } = await admin.storage.from("workspace-backgrounds").remove([path]);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "目前無法移除背景圖片。" }, { status: 503 });
  }
}

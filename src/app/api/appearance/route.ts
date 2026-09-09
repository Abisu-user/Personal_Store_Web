import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appearanceDefaults, normalizeAppearance, type AppearanceDevice } from "@/lib/appearance/preferences";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createB2StorageManager } from "@/lib/storage/b2-server";
import { createStorageMetadataRepository } from "@/lib/storage/metadata-repository";
import { createStorageManager } from "@/lib/storage/server";

export const dynamic = "force-dynamic";

const deviceSchema = z.enum(["desktop", "mobile"]);
const updateSchema = z.object({ device: deviceSchema, appearance: z.record(z.string(), z.unknown()) });
const legacyPrefix = "workspace-storage:";
const objectPrefix = "workspace-object:";
const objectIdPattern = /^[0-9a-f-]{36}$/i;
const b2PurposeFor = (device: AppearanceDevice) => `workspace-background-${device}`;

async function ownedAppearance(value: unknown, userId: string, device: AppearanceDevice) {
  const normalized = normalizeAppearance(value);
  const ownedLegacyPrefix = `${legacyPrefix}${userId}/${device}/`;
  const metadata = createStorageMetadataRepository();
  const checked = await Promise.all(normalized.backgroundImages.slice(0, 10).map(async (reference) => {
    if (reference.startsWith(ownedLegacyPrefix)) return reference;
    if (!reference.startsWith(objectPrefix)) return null;
    const objectId = reference.slice(objectPrefix.length);
    if (!objectIdPattern.test(objectId)) return null;
    const object = await metadata.findOwnedActive(objectId, userId).catch(() => null);
    return object?.provider === "b2" && object.category === "workspace-backgrounds" && object.objectKey.startsWith(`${userId}/${b2PurposeFor(device)}/`) ? reference : null;
  }));
  const backgroundImages = checked.filter((reference): reference is string => Boolean(reference));
  const backgroundActiveIndex = Math.min(normalized.backgroundActiveIndex, Math.max(0, backgroundImages.length - 1));
  return { ...normalized, backgroundImages, backgroundActiveIndex, backgroundImage: backgroundImages[backgroundActiveIndex] };
}

async function signedImageUrls(userId: string, device: AppearanceDevice, references: string[]) {
  const supabaseStorage = createStorageManager();
  const metadata = createStorageMetadataRepository();
  const entries = await Promise.all(references.map(async (reference) => {
    if (reference.startsWith(objectPrefix)) {
      const objectId = reference.slice(objectPrefix.length);
      if (!objectIdPattern.test(objectId)) return null;
      const object = await metadata.findOwnedActive(objectId, userId).catch(() => null);
      if (!object || object.provider !== "b2" || object.category !== "workspace-backgrounds" || !object.objectKey.startsWith(`${userId}/${b2PurposeFor(device)}/`)) return null;
      const { data, error } = await createB2StorageManager().getSignedUrl(object.bucket, object.objectKey, 86400);
      return error || !data?.signedUrl ? null : [reference, data.signedUrl] as const;
    }
    const path = reference.slice(legacyPrefix.length);
    if (!reference.startsWith(legacyPrefix) || !path.startsWith(`${userId}/${device}/`)) return null;
    const { data, error } = await supabaseStorage.getSignedUrl("workspace-backgrounds", path, 86400);
    return error || !data?.signedUrl ? null : [reference, data.signedUrl] as const;
  }));
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry)));
}

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsedDevice = deviceSchema.safeParse(request.nextUrl.searchParams.get("device"));
  if (!parsedDevice.success) return NextResponse.json({ error: "裝置類型無效。" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("user_appearance_settings").select("preferences").eq("user_id", context.userId).eq("device_type", parsedDevice.data).maybeSingle();
  if (error) return NextResponse.json({ error: "目前無法讀取外觀設定。" }, { status: 503 });
  let appearance = data?.preferences ? await ownedAppearance(data.preferences, context.userId, parsedDevice.data) : appearanceDefaults;
  if (!data) {
    const { data: settings } = await admin.from("user_settings").select("theme").eq("user_id", context.userId).maybeSingle();
    if (settings?.theme) appearance = { ...appearance, theme: settings.theme };
  }
  const imageUrls = await signedImageUrls(context.userId, parsedDevice.data, appearance.backgroundImages);
  return NextResponse.json({ userId: context.userId, device: parsedDevice.data, appearance, imageUrls }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "外觀設定內容無效。" }, { status: 400 });
  const appearance = await ownedAppearance(parsed.data.appearance, context.userId, parsed.data.device);
  const admin = createAdminClient();
  const { error } = await admin.from("user_appearance_settings").upsert({ user_id: context.userId, device_type: parsed.data.device, preferences: appearance }, { onConflict: "user_id,device_type" });
  if (error) {
    const quota = error.message.includes("quota_exceeded:database");
    return NextResponse.json({ error: quota ? "資料庫使用量已達上限。" : "目前無法同步外觀設定。", code: quota ? "quota_exceeded" : undefined }, { status: quota ? 413 : 503 });
  }
  await admin.from("user_settings").update({ theme: appearance.theme }).eq("user_id", context.userId);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

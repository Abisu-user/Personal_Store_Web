import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createB2StorageManager } from "@/lib/storage/b2-server";
import { createStorageMetadataRepository } from "@/lib/storage/metadata-repository";
import { createStorageManager } from "@/lib/storage/server";

const entrySchema = z.string().uuid();

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("entry");
  if (!id || !entrySchema.safeParse(id).success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from("entries").select("cover_image_path,cover_storage_object_id").eq("id", id).eq("owner_id", context.userId).maybeSingle();
  if (error || (!data?.cover_image_path && !data?.cover_storage_object_id)) return NextResponse.json({ error: "找不到封面。" }, { status: 404 });
  if (data.cover_storage_object_id) {
    const object = await createStorageMetadataRepository(admin).findOwnedActive(data.cover_storage_object_id, context.userId);
    if (!object || object.provider !== "b2" || object.category !== "content-cover" || !object.objectKey.startsWith(`${context.userId}/content-cover/`)) return NextResponse.json({ error: "找不到封面。" }, { status: 404 });
    const { data: signed, error: signedError } = await createB2StorageManager().getSignedUrl(object.bucket, object.objectKey, 60);
    if (signedError || !signed) return NextResponse.json({ error: "暫時無法讀取封面。" }, { status: 503 });
    return NextResponse.redirect(signed.signedUrl, { status: 307, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!data.cover_image_path?.startsWith(`${context.userId}/covers/`)) return NextResponse.json({ error: "找不到封面。" }, { status: 404 });
  // Stream the private object from the server instead of redirecting the browser
  // to a signed Storage URL. This keeps the image same-origin and avoids an
  // expired/cross-origin signed URL being blocked by browser policy.
  const { data: object, error: objectError } = await createStorageManager(admin).download("content-covers", data.cover_image_path);
  if (objectError || !object) return NextResponse.json({ error: "暫時無法讀取封面。" }, { status: 503 });
  return new NextResponse(object, { headers: { "Content-Type": object.type || "image/webp", "Cache-Control": "private, no-store" } });
}

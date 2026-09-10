import { NextRequest, NextResponse } from "next/server";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStorageManager } from "@/lib/storage/server";
import { createB2StorageManager } from "@/lib/storage/b2-server";
import { createStorageMetadataRepository } from "@/lib/storage/metadata-repository";
import { hasAdultContentAccess } from "@/lib/security/adult-content";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const admin = createAdminClient();
  const { data, error } = await admin.from("anime_library").select("cover_url,cover_storage_object_id,is_adult").eq("id", id).eq("user_id", context.userId).maybeSingle();
  if (data?.is_adult && !(await hasAdultContentAccess(context.userId))) return NextResponse.json({ error: "你沒有成人內容存取權。" }, { status: 403 });
  if (error || (!data?.cover_url && !data?.cover_storage_object_id)) return NextResponse.json({ error: "找不到封面。" }, { status: 404 });
  if (data.cover_storage_object_id) {
    const object = await createStorageMetadataRepository(admin).findOwnedActive(data.cover_storage_object_id, context.userId);
    if (!object || object.provider !== "b2" || object.category !== "content-cover" || !object.objectKey.startsWith(`${context.userId}/content-cover/`)) return NextResponse.json({ error: "找不到封面。" }, { status: 404 });
    const { data: signed, error: signedError } = await createB2StorageManager().getSignedUrl(object.bucket, object.objectKey, 60);
    if (signedError || !signed) return NextResponse.json({ error: "暫時無法讀取封面。" }, { status: 503 });
    return NextResponse.redirect(signed.signedUrl, { status: 307, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!data.cover_url?.startsWith(`${context.userId}/covers/`)) return NextResponse.json({ error: "找不到封面。" }, { status: 404 });
  const { data: object, error: objectError } = await createStorageManager(admin).download("content-covers", data.cover_url);
  if (objectError || !object) return NextResponse.json({ error: "暫時無法讀取封面。" }, { status: 503 });
  return new NextResponse(object, { headers: { "Content-Type": object.type || "image/webp", "Cache-Control": "private, no-store" } });
}

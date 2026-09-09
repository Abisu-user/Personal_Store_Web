import { NextRequest, NextResponse } from "next/server";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStorageManager } from "@/lib/storage/server";
import { hasAdultContentAccess } from "@/lib/security/adult-content";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await createAdminClient().from("anime_library").select("cover_url,is_adult").eq("id", id).eq("user_id", context.userId).maybeSingle();
  if (data?.is_adult && !(await hasAdultContentAccess(context.userId))) return NextResponse.json({ error: "你沒有成人內容存取權。" }, { status: 403 });
  if (error || !data?.cover_url?.startsWith(`${context.userId}/covers/`)) return NextResponse.json({ error: "找不到封面。" }, { status: 404 });
  const { data: object, error: objectError } = await createStorageManager().download("content-covers", data.cover_url);
  if (objectError || !object) return NextResponse.json({ error: "暫時無法讀取封面。" }, { status: 503 });
  return new NextResponse(object, { headers: { "Content-Type": object.type || "image/webp", "Cache-Control": "private, no-store" } });
}

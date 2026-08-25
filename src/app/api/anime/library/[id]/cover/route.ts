import { NextRequest, NextResponse } from "next/server";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getSecurityContext(); if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const { data, error } = await createAdminClient().from("anime_library").select("cover_url").eq("id", id).eq("user_id", context.userId).maybeSingle();
  if (error || !data?.cover_url?.startsWith(`${context.userId}/covers/`)) return NextResponse.json({ error: "找不到封面。" }, { status: 404 });
  const { data: object, error: objectError } = await createAdminClient().storage.from("content-covers").download(data.cover_url);
  if (objectError || !object) return NextResponse.json({ error: "暫時無法讀取封面。" }, { status: 503 });
  return new NextResponse(object, { headers: { "Content-Type": object.type || "image/webp", "Cache-Control": "private, no-store" } });
}

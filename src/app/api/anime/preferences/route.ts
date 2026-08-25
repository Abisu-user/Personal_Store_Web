import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ preferredStreamingPlatform: z.enum(["bahamut", "netflix", "crunchyroll", "other"]) });
export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "請選擇有效的串流平台。" }, { status: 400 });
  const { error } = await createAdminClient().from("anime_preferences").upsert({ user_id: context.userId, preferred_streaming_platform: parsed.data.preferredStreamingPlatform });
  if (error) return NextResponse.json({ error: "無法儲存串流平台偏好。" }, { status: 503 });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAnimePreferences } from "@/lib/anime/data";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const schema = z.object({
  adultModeEnabled: z.boolean().optional(), adultHiddenByDefault: z.boolean().optional(), adultAccessMode: z.enum(["none", "passkey", "pin4", "pin6"]).optional(), blurAdultCovers: z.boolean().optional(),
});
const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return fail("Unauthorized", 401);
  return NextResponse.json(await getAnimePreferences(context.userId), { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return fail("Unauthorized", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("設定格式不正確。");
  const current = await getAnimePreferences(context.userId);
  const next = { ...current, ...parsed.data };
  try {
    const { error } = await createAdminClient().from("anime_preferences").upsert({
      user_id: context.userId,
      adult_mode_enabled: next.adultModeEnabled,
      adult_hidden_by_default: next.adultHiddenByDefault,
      require_adult_passkey: next.adultAccessMode === "passkey",
      blur_adult_covers: next.blurAdultCovers,
      adult_access_mode: next.adultAccessMode,
    }, { onConflict: "user_id" });
    if (error) throw error;
    return NextResponse.json(next, { headers: { "Cache-Control": "private, no-store" } });
  } catch (caught) {
    const databaseError = caught as { code?: string; message?: string; details?: string };
    console.error("[anime-preferences] unable to save", { code: databaseError.code, message: databaseError.message, details: databaseError.details });
    if (databaseError.code === "PGRST205" || databaseError.code === "42P01") return fail("成人內容資料表正在同步，請稍候後重新整理再試。", 503);
    return fail("無法儲存成人內容設定，請稍後再試。", 503);
  }
}

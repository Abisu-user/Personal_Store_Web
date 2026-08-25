import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { defaultAnimePreferences, getAnimePreferences } from "@/lib/anime/data";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const schema = z.object({
  adultModeEnabled: z.boolean().optional(), adultHiddenByDefault: z.boolean().optional(), requireAdultPasskey: z.boolean().optional(), blurAdultCovers: z.boolean().optional(), showAdultInMainLibrary: z.boolean().optional(),
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
      require_adult_passkey: next.requireAdultPasskey,
      blur_adult_covers: next.blurAdultCovers,
      show_adult_in_main_library: next.showAdultInMainLibrary,
    }, { onConflict: "user_id" });
    if (error) throw error;
    return NextResponse.json(next, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // A missing migration must never accidentally enable adult mode.
    return fail("成人內容設定尚未啟用，請先套用資料庫 migration。", 503);
  }
}

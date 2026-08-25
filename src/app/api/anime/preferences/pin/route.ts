import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashAppLockPin, makeAppLockSalt, validateAppLockPin, verifyAppLockPin } from "@/lib/app-lock/server";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const modeSchema = z.enum(["pin4", "pin6"]);
const configureSchema = z.object({ action: z.literal("configure"), mode: modeSchema, pin: z.string().min(1).max(12) });
const verifySchema = z.object({ action: z.literal("verify"), pin: z.string().min(1).max(12) });
const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return fail("Unauthorized", 401);
  try {
    const { data, error } = await createAdminClient().from("anime_preferences").select("adult_access_mode,adult_pin_hash").eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ configured: Boolean(data?.adult_pin_hash), mode: data?.adult_access_mode === "pin4" || data?.adult_access_mode === "pin6" ? data.adult_access_mode : null });
  } catch { return fail("目前無法讀取成人區 PIN 設定。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return fail("Unauthorized", 401);
  const body = await request.json().catch(() => null);
  const configure = configureSchema.safeParse(body);
  const verify = verifySchema.safeParse(body);
  if (!configure.success && !verify.success) return fail("請檢查成人區 PIN 資料。");
  try {
    const admin = createAdminClient();
    if (configure.success) {
      if (!validateAppLockPin(configure.data.mode, configure.data.pin)) return fail("PIN 碼格式不正確。");
      const salt = makeAppLockSalt();
      const hash = await hashAppLockPin(configure.data.pin, salt);
      const { error } = await admin.from("anime_preferences").upsert({ user_id: context.userId, adult_access_mode: configure.data.mode, adult_pin_salt: salt, adult_pin_hash: hash, adult_pin_failed_attempts: 0, adult_pin_locked_until: null }, { onConflict: "user_id" });
      if (error) throw error;
      return NextResponse.json({ ok: true, configured: true, mode: configure.data.mode });
    }
    if (!verify.success) return fail("請檢查成人區 PIN 資料。");
    const { data, error } = await admin.from("anime_preferences").select("adult_access_mode,adult_pin_salt,adult_pin_hash,adult_pin_failed_attempts,adult_pin_locked_until").eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    if (!data?.adult_pin_hash || !data.adult_pin_salt || (data.adult_access_mode !== "pin4" && data.adult_access_mode !== "pin6")) return fail("尚未設定成人區 PIN。", 404);
    if (data.adult_pin_locked_until && new Date(data.adult_pin_locked_until).getTime() > Date.now()) return fail("嘗試次數過多，請 1 分鐘後再試。", 429);
    const valid = validateAppLockPin(data.adult_access_mode, verify.data.pin) && await verifyAppLockPin(verify.data.pin, data.adult_pin_salt, data.adult_pin_hash);
    if (!valid) {
      const attempts = Number(data.adult_pin_failed_attempts ?? 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 60_000).toISOString() : null;
      await admin.from("anime_preferences").update({ adult_pin_failed_attempts: attempts >= 5 ? 0 : attempts, adult_pin_locked_until: lockedUntil }).eq("user_id", context.userId);
      return fail(lockedUntil ? "已連續輸入錯誤 5 次，請 1 分鐘後再試。" : "PIN 碼不正確，請再試一次。", 403);
    }
    await admin.from("anime_preferences").update({ adult_pin_failed_attempts: 0, adult_pin_locked_until: null }).eq("user_id", context.userId);
    return NextResponse.json({ ok: true });
  } catch (cause) {
    const error = cause as { code?: string; message?: string };
    console.error("[anime-adult-pin] request failed", { code: error.code, message: error.message });
    return fail("目前無法處理成人區 PIN，請稍後再試。", 503);
  }
}

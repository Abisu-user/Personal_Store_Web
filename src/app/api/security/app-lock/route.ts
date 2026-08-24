import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashAppLockPin, makeAppLockSalt, validateAppLockPin, verifyAppLockPin } from "@/lib/app-lock/server";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

const pinModeSchema = z.enum(["pin4", "pin6"]);
const configureSchema = z.object({ action: z.literal("configure"), mode: pinModeSchema, pin: z.string().min(1).max(12) });
const verifySchema = z.object({ action: z.literal("verify"), pin: z.string().min(1).max(12) });
const removeSchema = z.object({ action: z.literal("remove"), pin: z.string().min(1).max(12) });

function jsonError(error: string, status: number) { return NextResponse.json({ error }, { status }); }

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  try {
    const { data, error } = await createAdminClient().from("app_locks").select("pin_mode").eq("owner_id", context.userId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ configured: Boolean(data), mode: data?.pin_mode ?? null });
  } catch { return jsonError("目前無法讀取 App 鎖定設定。", 503); }
}

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const body = await request.json().catch(() => null);
  const configure = configureSchema.safeParse(body);
  const verify = verifySchema.safeParse(body);
  const remove = removeSchema.safeParse(body);
  if (!configure.success && !verify.success && !remove.success) return jsonError("請檢查 App 鎖定資料。", 400);
  try {
    const admin = createAdminClient();
    if (configure.success) {
      if (!validateAppLockPin(configure.data.mode, configure.data.pin)) return jsonError("PIN 碼格式不正確。", 400);
      const pinSalt = makeAppLockSalt();
      const pinHash = await hashAppLockPin(configure.data.pin, pinSalt);
      const { error } = await admin.from("app_locks").upsert({ owner_id: context.userId, pin_mode: configure.data.mode, pin_salt: pinSalt, pin_hash: pinHash, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() });
      if (error) throw error;
      return NextResponse.json({ ok: true, configured: true, mode: configure.data.mode });
    }
    const { data: lock, error } = await admin.from("app_locks").select("pin_mode, pin_salt, pin_hash, failed_attempts, locked_until").eq("owner_id", context.userId).maybeSingle();
    if (error) throw error;
    if (!lock) return jsonError("尚未設定 App 鎖定 PIN。", 404);
    if (lock.locked_until && new Date(lock.locked_until).getTime() > Date.now()) return jsonError("嘗試次數過多，請 1 分鐘後再試。", 429);
    const suppliedPin = verify.success ? verify.data.pin : remove.success ? remove.data.pin : "";
    const valid = validateAppLockPin(lock.pin_mode as "pin4" | "pin6", suppliedPin) && await verifyAppLockPin(suppliedPin, lock.pin_salt, lock.pin_hash);
    if (!valid) {
      const attempts = lock.failed_attempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 60_000).toISOString() : null;
      await admin.from("app_locks").update({ failed_attempts: attempts >= 5 ? 0 : attempts, locked_until: lockedUntil, updated_at: new Date().toISOString() }).eq("owner_id", context.userId);
      return jsonError(lockedUntil ? "已連續輸入錯誤 5 次，請 1 分鐘後再試。" : "PIN 碼不正確，請再試一次。", 403);
    }
    if (remove.success) {
      const { error: deleteError } = await admin.from("app_locks").delete().eq("owner_id", context.userId);
      if (deleteError) throw deleteError;
      return NextResponse.json({ ok: true, configured: false });
    }
    await admin.from("app_locks").update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).eq("owner_id", context.userId);
    return NextResponse.json({ ok: true });
  } catch { return jsonError("目前無法處理 App 鎖定，請稍後再試。", 503); }
}

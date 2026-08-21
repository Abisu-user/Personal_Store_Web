import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { folderExists, folderUnlockCookieName, getUnlockExpiry, hashFolderPassword, hashUnlockToken, makeSalt, makeUnlockToken, unlockLifetimeSeconds, validateFolderPassword, verifyFolderPassword } from "@/lib/folder-locks/server";

const kindSchema = z.enum(["bookmark", "note", "code", "file", "photo"]);
const passwordMode = z.enum(["pin4", "pin6", "password"]);
const configureSchema = z.object({ action: z.literal("configure"), kind: kindSchema, folderId: z.string().uuid(), mode: passwordMode, password: z.string().min(1).max(128) });
const verifySchema = z.object({ action: z.literal("verify"), kind: kindSchema, folderId: z.string().uuid(), password: z.string().min(1).max(128) });
const removeSchema = z.object({ action: z.literal("remove"), kind: kindSchema, folderId: z.string().uuid() });

function jsonError(error: string, status: number) { return NextResponse.json({ error }, { status }); }

export async function POST(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return jsonError("Unauthorized", 401);
  const body = await request.json().catch(() => null);
  const configure = configureSchema.safeParse(body);
  const verify = verifySchema.safeParse(body);
  const remove = removeSchema.safeParse(body);
  const requestData = configure.success ? configure.data : verify.success ? verify.data : remove.success ? remove.data : null;
  if (!requestData) return jsonError("請檢查資料夾鎖定設定。", 400);
  try {
    if (!(await folderExists(context.userId, requestData.kind, requestData.folderId))) return jsonError("找不到指定資料夾。", 404);
    const admin = createAdminClient();
    if (configure.success) {
      if (!validateFolderPassword(configure.data.mode, configure.data.password)) return jsonError(configure.data.mode === "password" ? "英文、數字與符號混合密碼至少需要 10 個字元。" : "PIN 碼長度不正確。", 400);
      const salt = makeSalt();
      const passwordHash = await hashFolderPassword(configure.data.password, salt);
      const { data, error } = await admin.from("folder_locks").upsert({ owner_id: context.userId, folder_kind: configure.data.kind, folder_id: configure.data.folderId, password_mode: configure.data.mode, password_salt: salt, password_hash: passwordHash, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }, { onConflict: "owner_id,folder_kind,folder_id" }).select("id").single();
      if (error) throw error;
      await admin.from("folder_unlock_sessions").delete().eq("owner_id", context.userId).eq("folder_lock_id", data.id);
      return NextResponse.json({ ok: true, mode: configure.data.mode });
    }
    if (remove.success) {
      const { error } = await admin.from("folder_locks").delete().eq("owner_id", context.userId).eq("folder_kind", remove.data.kind).eq("folder_id", remove.data.folderId);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    const verifyData = verify.data!;
    const { data: lock, error } = await admin.from("folder_locks").select("id, password_mode, password_salt, password_hash, failed_attempts, locked_until").eq("owner_id", context.userId).eq("folder_kind", verifyData.kind).eq("folder_id", verifyData.folderId).maybeSingle();
    if (error) throw error;
    if (!lock) return NextResponse.json({ ok: true, alreadyUnlocked: true });
    if (lock.locked_until && new Date(lock.locked_until).getTime() > Date.now()) return jsonError("嘗試次數過多，請稍後再試。", 429);
    const valid = await verifyFolderPassword(verifyData.password, lock.password_salt, lock.password_hash);
    if (!valid) {
      const attempts = lock.failed_attempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 60_000).toISOString() : null;
      await admin.from("folder_locks").update({ failed_attempts: attempts >= 5 ? 0 : attempts, locked_until: lockedUntil, updated_at: new Date().toISOString() }).eq("id", lock.id).eq("owner_id", context.userId);
      return jsonError(lockedUntil ? "已連續輸入錯誤 5 次，請 1 分鐘後再試。" : "密碼不正確，請再試一次。", 403);
    }
    const token = makeUnlockToken();
    const expiresAt = getUnlockExpiry();
    await admin.from("folder_unlock_sessions").delete().eq("owner_id", context.userId).eq("folder_lock_id", lock.id);
    const { error: sessionError } = await admin.from("folder_unlock_sessions").insert({ owner_id: context.userId, folder_lock_id: lock.id, token_hash: hashUnlockToken(token), expires_at: expiresAt });
    if (sessionError) throw sessionError;
    await admin.from("folder_locks").update({ failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() }).eq("id", lock.id).eq("owner_id", context.userId);
    const response = NextResponse.json({ ok: true, mode: lock.password_mode });
    response.cookies.set(folderUnlockCookieName(lock.id), token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: unlockLifetimeSeconds });
    return response;
  } catch {
    return jsonError("目前無法處理資料夾鎖定，請稍後再試。", 503);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { formatBytes } from "@/lib/format-bytes";
import { getSecurityContext } from "@/lib/security/activity";
import { isSystemAdmin } from "@/lib/security/system-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserCapacity } from "@/lib/system/quota";
import { getQuotaPool } from "@/lib/system/quota-pool";
import { projectStorageUsageLimits } from "@/lib/system/storage-usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.string().uuid();
const updateSchema = z.object({
  databaseLimitBytes: z.number().int().positive().safe(),
  storageLimitBytes: z.number().int().positive().safe(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

function responseError(error: string, code: string, status: number, details?: Record<string, unknown>) {
  return NextResponse.json({ error, code, ...details }, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function authorize(userId: string) {
  const context = await getSecurityContext();
  if (!context) return { error: responseError("Unauthorized", "UNAUTHORIZED", 401) };
  if (!(await isSystemAdmin(context.userId))) return { error: responseError("你沒有權限修改使用者配額。", "UNAUTHORIZED", 403) };
  if (!paramsSchema.safeParse(userId).success) return { error: responseError("找不到指定帳號。", "USER_NOT_FOUND", 404) };
  return { context };
}

async function details(userId: string) {
  const admin = createAdminClient();
  const [{ data: account, error: accountError }, { data: profile, error: profileError }, { data: settings, error: settingsError }, capacity] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("role,username,display_name").eq("id", userId).maybeSingle(),
    admin.from("quota_system_settings").select("maximum_database_limit_bytes,maximum_storage_limit_bytes").eq("singleton", true).single(),
    getUserCapacity(userId),
  ]);
  if (accountError || !account.user || profileError || !profile) throw accountError ?? profileError ?? new Error("USER_NOT_FOUND");
  if (settingsError || !settings) throw settingsError ?? new Error("QUOTA_SETTINGS_UNAVAILABLE");
  const safetyMaximums = {
    databaseBytes: Number(settings.maximum_database_limit_bytes),
    storageBytes: Number(settings.maximum_storage_limit_bytes),
  };
  const quotaPool = await getQuotaPool(userId, safetyMaximums);
  return {
    userId,
    email: account.user.email ?? "",
    username: profile.username,
    displayName: profile.display_name,
    role: profile.role,
    capacity,
    maximums: {
      databaseBytes: quotaPool.database.maximumForTargetBytes,
      storageBytes: quotaPool.storage.maximumForTargetBytes,
    },
    quotaPool,
    systemLimits: {
      databaseBytes: projectStorageUsageLimits.databaseBytes,
      storageBytes: projectStorageUsageLimits.storageBytes,
    },
  };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const authorization = await authorize(userId);
  if (authorization.error) return authorization.error;
  try {
    return NextResponse.json(await details(userId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return responseError(message.includes("USER_NOT_FOUND") ? "找不到指定帳號。" : "無法取得最新配額資訊。", message.includes("USER_NOT_FOUND") ? "USER_NOT_FOUND" : "QUOTA_LOAD_FAILED", message.includes("USER_NOT_FOUND") ? 404 : 503);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const authorization = await authorize(userId);
  if (authorization.error || !authorization.context) return authorization.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return responseError("容量設定格式錯誤。", "INVALID_QUOTA", 400);

  try {
    const { data, error } = await createAdminClient().rpc("vault_admin_update_user_quota_v2", {
      acting_admin_id: authorization.context.userId,
      target_user_id: userId,
      new_database_limit_bytes: parsed.data.databaseLimitBytes,
      new_storage_limit_bytes: parsed.data.storageLimitBytes,
      expected_updated_at: parsed.data.expectedUpdatedAt,
      system_database_capacity_bytes: projectStorageUsageLimits.databaseBytes,
      system_storage_capacity_bytes: projectStorageUsageLimits.storageBytes,
    });
    if (error) throw error;
    return NextResponse.json({ ...(await details(userId)), capacity: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const message = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause);
    if (message.includes("UNAUTHORIZED")) return responseError("你沒有權限修改使用者配額。", "UNAUTHORIZED", 403);
    if (message.includes("USER_NOT_FOUND")) return responseError("找不到指定帳號。", "USER_NOT_FOUND", 404);
    if (message.includes("QUOTA_CONFLICT")) return responseError("此帳號的配額已被其他管理員更新，請重新確認最新設定。", "QUOTA_CONFLICT", 409);
    if (message.includes("QUOTA_ABOVE_MAX")) return responseError("已超過目前系統允許設定的最大容量。", "QUOTA_ABOVE_MAX", 400);
    if (message.includes("SYSTEM_QUOTA_POOL_EXCEEDED")) {
      const resource = message.includes(":storage:") ? "Storage" : "Database";
      const bytes = Number(message.match(/:(\d+)(?:\D|$)/)?.[1] ?? 0);
      return responseError(`${resource} 系統可分配容量不足，目前此帳號最多可配額 ${formatBytes(bytes)}。`, "SYSTEM_QUOTA_POOL_EXCEEDED", 409, { resource: resource.toLowerCase(), availableBytes: bytes });
    }
    if (message.includes("QUOTA_BELOW_USAGE")) {
      const resource = message.includes(":storage:") ? "Storage" : "Database";
      const bytes = Number(message.match(/:(\d+)(?:\D|$)/)?.[1] ?? 0);
      return responseError(`${resource} 上限不可低於目前已使用容量 ${formatBytes(bytes)}。`, "QUOTA_BELOW_USAGE", 409, { resource: resource.toLowerCase(), usedBytes: bytes });
    }
    if (message.includes("INVALID_QUOTA")) return responseError("容量設定格式錯誤。", "INVALID_QUOTA", 400);
    return responseError("配額更新失敗，請稍後再試。", "QUOTA_UPDATE_FAILED", 503);
  }
}

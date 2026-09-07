import "server-only";

import { formatBytes } from "@/lib/format-bytes";
import { createAdminClient } from "@/lib/supabase/admin";
import { userStorageQuotaDefaults } from "@/lib/system/storage-usage";

type CapacityRow = {
  databaseUsedBytes?: number | string;
  databaseQuotaBytes?: number | string;
  storageUsedBytes?: number | string;
  storageQuotaBytes?: number | string;
  databaseUnlimited?: boolean;
  storageUnlimited?: boolean;
  databaseGroups?: Array<{ category: string; usedBytes: number | string }>;
  storageGroups?: Array<{ category: string; usedBytes: number | string }>;
  collectedAt?: string;
  quotaUpdatedAt?: string | null;
};

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};

export async function getUserCapacity(userId: string) {
  const { data, error } = await createAdminClient().rpc("vault_user_capacity", { target_user_id: userId });
  if (error || !data || typeof data !== "object") throw error ?? new Error("USER_CAPACITY_UNAVAILABLE");
  const row = data as CapacityRow;
  return {
    databaseUsedBytes: numberValue(row.databaseUsedBytes),
    databaseQuotaBytes: numberValue(row.databaseQuotaBytes, userStorageQuotaDefaults.databaseBytes),
    storageUsedBytes: numberValue(row.storageUsedBytes),
    storageQuotaBytes: numberValue(row.storageQuotaBytes, userStorageQuotaDefaults.storageBytes),
    databaseUnlimited: row.databaseUnlimited === true,
    storageUnlimited: row.storageUnlimited === true,
    databaseGroups: Array.isArray(row.databaseGroups) ? row.databaseGroups.map((group) => ({ category: group.category, usedBytes: numberValue(group.usedBytes) })) : [],
    storageGroups: Array.isArray(row.storageGroups) ? row.storageGroups.map((group) => ({ category: group.category, usedBytes: numberValue(group.usedBytes) })) : [],
    collectedAt: row.collectedAt ?? new Date().toISOString(),
    quotaUpdatedAt: row.quotaUpdatedAt ?? null,
  };
}

export class QuotaExceededError extends Error {
  constructor(public resource: "database" | "storage", public details?: { remainingBytes: number; incomingBytes: number }) {
    super(`quota_exceeded:${resource}`);
  }
}

export async function assertStorageQuota(userId: string, incomingBytes: number) {
  const capacity = await getUserCapacity(userId);
  if (!capacity.storageUnlimited && capacity.storageUsedBytes + incomingBytes > capacity.storageQuotaBytes) {
    throw new QuotaExceededError("storage", {
      remainingBytes: Math.max(0, capacity.storageQuotaBytes - capacity.storageUsedBytes),
      incomingBytes,
    });
  }
  return capacity;
}

export function quotaExceededResponse(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (!message.includes("quota_exceeded:")) return null;
  const resource = message.includes("storage") ? "storage" : "database";
  const detail = cause instanceof QuotaExceededError ? cause.details : undefined;
  return {
    error: resource === "storage"
      ? detail
        ? `儲存空間不足，目前剩餘 ${formatBytes(detail.remainingBytes)}，此檔案大小為 ${formatBytes(detail.incomingBytes)}。`
        : "檔案儲存空間已達上限，請先移除不需要的檔案。"
      : "Database 儲存空間不足，請刪除部分資料後再試。",
    code: resource === "storage" ? "STORAGE_QUOTA_EXCEEDED" : "DATABASE_QUOTA_EXCEEDED",
    resource,
    ...(detail ?? {}),
  } as const;
}

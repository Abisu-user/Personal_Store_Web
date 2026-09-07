import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { userStorageQuotaDefaults } from "@/lib/system/storage-usage";

type CapacityRow = {
  databaseUsedBytes?: number | string;
  databaseQuotaBytes?: number | string;
  storageUsedBytes?: number | string;
  storageQuotaBytes?: number | string;
  storageGroups?: Array<{ category: string; usedBytes: number | string }>;
  collectedAt?: string;
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
    storageGroups: Array.isArray(row.storageGroups) ? row.storageGroups.map((group) => ({ category: group.category, usedBytes: numberValue(group.usedBytes) })) : [],
    collectedAt: row.collectedAt ?? new Date().toISOString(),
  };
}

export class QuotaExceededError extends Error {
  constructor(public resource: "database" | "storage") {
    super(`quota_exceeded:${resource}`);
  }
}

export async function assertStorageQuota(userId: string, incomingBytes: number) {
  const capacity = await getUserCapacity(userId);
  if (capacity.storageUsedBytes + incomingBytes > capacity.storageQuotaBytes) throw new QuotaExceededError("storage");
  return capacity;
}

export function quotaExceededResponse(cause: unknown) {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (!message.includes("quota_exceeded:")) return null;
  const resource = message.includes("storage") ? "storage" : "database";
  return {
    error: resource === "storage" ? "檔案儲存空間已達上限，請先移除不需要的檔案。" : "資料庫使用量已達上限，請先移除不需要的資料。",
    code: "quota_exceeded",
    resource,
  } as const;
}

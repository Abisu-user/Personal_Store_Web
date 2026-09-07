import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { projectStorageUsageLimits } from "@/lib/system/storage-usage";

type RawAllocation = {
  userId?: string;
  email?: string;
  username?: string | null;
  displayName?: string | null;
  role?: string;
  databaseLimitBytes?: number | string;
  storageLimitBytes?: number | string;
};

type RawPool = {
  databaseAllocatedBytes?: number | string;
  storageAllocatedBytes?: number | string;
  allocations?: RawAllocation[];
};

const bytes = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export async function getQuotaPool(targetUserId: string, safetyMaximums: { databaseBytes: number; storageBytes: number }) {
  const { data, error } = await createAdminClient().rpc("vault_admin_quota_pool_summary");
  if (error || !data || typeof data !== "object") throw error ?? new Error("QUOTA_POOL_UNAVAILABLE");
  const raw = data as RawPool;
  const allocations = Array.isArray(raw.allocations) ? raw.allocations.map((allocation) => ({
    userId: allocation.userId ?? "",
    email: allocation.email ?? "",
    label: allocation.displayName || allocation.username || allocation.email?.split("@")[0] || "未命名帳號",
    role: allocation.role === "admin" ? "admin" as const : "user" as const,
    databaseLimitBytes: bytes(allocation.databaseLimitBytes),
    storageLimitBytes: bytes(allocation.storageLimitBytes),
  })).filter((allocation) => allocation.userId) : [];

  const target = allocations.find((allocation) => allocation.userId === targetUserId);
  const databaseAllocatedBytes = bytes(raw.databaseAllocatedBytes);
  const storageAllocatedBytes = bytes(raw.storageAllocatedBytes);
  const databaseOtherBytes = Math.max(0, databaseAllocatedBytes - (target?.databaseLimitBytes ?? 0));
  const storageOtherBytes = Math.max(0, storageAllocatedBytes - (target?.storageLimitBytes ?? 0));
  const databaseAvailable = Math.max(0, projectStorageUsageLimits.databaseBytes - databaseOtherBytes);
  const storageAvailable = Math.max(0, projectStorageUsageLimits.storageBytes - storageOtherBytes);

  return {
    database: {
      totalBytes: projectStorageUsageLimits.databaseBytes,
      allocatedBytes: databaseAllocatedBytes,
      remainingBytes: Math.max(0, projectStorageUsageLimits.databaseBytes - databaseAllocatedBytes),
      availableForTargetBytes: databaseAvailable,
      maximumForTargetBytes: Math.min(safetyMaximums.databaseBytes, Math.max(target?.databaseLimitBytes ?? 0, databaseAvailable)),
      allocations: allocations.map((allocation) => ({ userId: allocation.userId, email: allocation.email, label: allocation.label, role: allocation.role, limitBytes: allocation.databaseLimitBytes })),
    },
    storage: {
      totalBytes: projectStorageUsageLimits.storageBytes,
      allocatedBytes: storageAllocatedBytes,
      remainingBytes: Math.max(0, projectStorageUsageLimits.storageBytes - storageAllocatedBytes),
      availableForTargetBytes: storageAvailable,
      maximumForTargetBytes: Math.min(safetyMaximums.storageBytes, Math.max(target?.storageLimitBytes ?? 0, storageAvailable)),
      allocations: allocations.map((allocation) => ({ userId: allocation.userId, email: allocation.email, label: allocation.label, role: allocation.role, limitBytes: allocation.storageLimitBytes })),
    },
  };
}

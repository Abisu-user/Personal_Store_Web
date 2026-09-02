import { NextResponse } from "next/server";
import { getSecurityContext } from "@/lib/security/activity";
import { quota, storageUsageLimits } from "@/lib/system/storage-usage";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RawUsage = {
  database: { usedBytes: number; systemHeapBytes: number; personalHeapBytes: number; indexAndOtherBytes: number } | null;
  storage: { usedBytes: number } | null;
  tables: Array<{ name: string; group: "system" | "personal"; dataBytes: number; indexBytes: number; otherBytes: number; totalBytes: number }>;
  storageGroups: Array<{ category: string; usedBytes: number }>;
  errors: { database?: string; storage?: string };
  collectedAt: string;
};

type StorageGroup = { category: string; usedBytes: number };

function objectSize(value: unknown) {
  const size = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(size) && size > 0 ? Math.floor(size) : 0;
}

async function sumStoragePrefix(admin: ReturnType<typeof createAdminClient>, bucket: string, prefix: string) {
  const pageSize = 1000;
  let offset = 0;
  let total = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    const objects = data ?? [];
    total += objects.reduce((sum, object) => sum + objectSize(object.metadata?.size), 0);
    if (objects.length < pageSize) return total;
    offset += objects.length;
  }
}

/**
 * Some Supabase projects do not grant RPC functions access to storage.objects.
 * The Storage API is the supported server-side interface and only inspects the
 * current user's known Personal Vault prefixes, never file content or names.
 */
async function storageUsageFallback(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const [files, photos, covers] = await Promise.all([
    sumStoragePrefix(admin, "vault-files", userId),
    sumStoragePrefix(admin, "vault-files", `${userId}/photos`),
    sumStoragePrefix(admin, "content-covers", `${userId}/covers`),
  ]);
  const groups: StorageGroup[] = [
    { category: "files", usedBytes: files },
    { category: "photos", usedBytes: photos },
    { category: "content-covers", usedBytes: covers },
  ].filter((group) => group.usedBytes > 0);
  return { usedBytes: groups.reduce((total, group) => total + group.usedBytes, 0), groups };
}

function messageFor(part: "database" | "storage", detail?: string) {
  if (!detail) return undefined;
  if (/permission|not authorized/i.test(detail)) return part === "database" ? "目前沒有讀取資料庫容量的權限。" : "目前沒有讀取檔案容量的權限。";
  if (/timeout|timed out/i.test(detail)) return "容量查詢逾時，請再試一次。";
  return part === "database" ? "目前無法取得資料庫容量。" : "目前無法取得檔案容量。";
}

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("vault_project_storage_usage");
    if (error || !data) {
      console.error("[storage-usage] RPC failed", { message: error?.message, code: error?.code, userId: context.userId });
      try {
        const fallback = await storageUsageFallback(admin, context.userId);
        return NextResponse.json({
          database: null,
          storage: quota(fallback.usedBytes, storageUsageLimits.storageBytes),
          tables: [],
          storageGroups: fallback.groups,
          errors: { database: "目前無法取得資料庫容量。" },
          updatedAt: new Date().toISOString(),
        }, { headers: { "Cache-Control": "private, no-store" } });
      } catch (fallbackCause) {
        console.error("[storage-usage] Storage API fallback failed after RPC failure", { userId: context.userId, message: fallbackCause instanceof Error ? fallbackCause.message : String(fallbackCause) });
      }
      return NextResponse.json({ database: null, storage: null, tables: [], storageGroups: [], errors: { database: "目前無法取得資料庫容量。", storage: "目前無法取得檔案容量。" }, updatedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    const usage = data as RawUsage;
    let storage = usage.storage;
    let storageGroups = usage.storageGroups ?? [];
    let storageError = usage.errors?.storage;
    if (!storage) {
      try {
        const fallback = await storageUsageFallback(admin, context.userId);
        storage = { usedBytes: fallback.usedBytes };
        storageGroups = fallback.groups;
        storageError = undefined;
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        storageError = storageError || detail;
        console.error("[storage-usage] Storage API fallback failed", { userId: context.userId, message: detail });
      }
    }
    if (usage.errors?.database || usage.errors?.storage) console.error("[storage-usage] partial usage error", { userId: context.userId, errors: usage.errors });
    return NextResponse.json({
      database: usage.database ? { ...quota(Number(usage.database.usedBytes), storageUsageLimits.databaseBytes), composition: {
        systemBytes: Number(usage.database.systemHeapBytes), personalBytes: Number(usage.database.personalHeapBytes), indexAndOtherBytes: Number(usage.database.indexAndOtherBytes),
      } } : null,
      storage: storage ? quota(Number(storage.usedBytes), storageUsageLimits.storageBytes) : null,
      tables: usage.tables ?? [],
      storageGroups,
      errors: { database: messageFor("database", usage.errors?.database), storage: messageFor("storage", storageError) },
      updatedAt: usage.collectedAt || new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    console.error("[storage-usage] unexpected API error", cause);
    return NextResponse.json({ database: null, storage: null, tables: [], storageGroups: [], errors: { database: "目前無法取得資料庫容量。", storage: "目前無法取得檔案容量。" }, updatedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

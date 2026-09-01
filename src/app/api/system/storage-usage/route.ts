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
    const { data, error } = await createAdminClient().rpc("vault_project_storage_usage");
    if (error || !data) {
      console.error("[storage-usage] RPC failed", { message: error?.message, code: error?.code, userId: context.userId });
      return NextResponse.json({ database: null, storage: null, tables: [], storageGroups: [], errors: { database: "目前無法取得資料庫容量。", storage: "目前無法取得檔案容量。" }, updatedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
    }
    const usage = data as RawUsage;
    if (usage.errors?.database || usage.errors?.storage) console.error("[storage-usage] partial usage error", { userId: context.userId, errors: usage.errors });
    return NextResponse.json({
      database: usage.database ? { ...quota(Number(usage.database.usedBytes), storageUsageLimits.databaseBytes), composition: {
        systemBytes: Number(usage.database.systemHeapBytes), personalBytes: Number(usage.database.personalHeapBytes), indexAndOtherBytes: Number(usage.database.indexAndOtherBytes),
      } } : null,
      storage: usage.storage ? quota(Number(usage.storage.usedBytes), storageUsageLimits.storageBytes) : null,
      tables: usage.tables ?? [],
      storageGroups: usage.storageGroups ?? [],
      errors: { database: messageFor("database", usage.errors?.database), storage: messageFor("storage", usage.errors?.storage) },
      updatedAt: usage.collectedAt || new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    console.error("[storage-usage] unexpected API error", cause);
    return NextResponse.json({ database: null, storage: null, tables: [], storageGroups: [], errors: { database: "目前無法取得資料庫容量。", storage: "目前無法取得檔案容量。" }, updatedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getSecurityContext } from "@/lib/security/activity";
import { isSystemAdmin } from "@/lib/security/system-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { projectStorageUsageLimits, quota } from "@/lib/system/storage-usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectUsage = {
  database: { usedBytes: number } | null;
  storage: { usedBytes: number } | null;
  tables: Array<{ name: string; group: "system" | "personal"; dataBytes: number; indexBytes: number; otherBytes: number; totalBytes: number }>;
  storageGroups: Array<{ category: string; usedBytes: number }>;
  errors: { database?: string; storage?: string };
  collectedAt: string;
};

export async function GET(request: NextRequest) {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isSystemAdmin(context.userId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100) ?? "";
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
  try {
    const admin = createAdminClient();
    const [projectResult, accountsResult] = await Promise.all([
      admin.rpc("vault_project_storage_usage"),
      admin.rpc("vault_admin_user_capacity_page", { search_term: q, page_number: page, page_size: 20 }),
    ]);
    if (projectResult.error || !projectResult.data) throw projectResult.error ?? new Error("PROJECT_USAGE_UNAVAILABLE");
    if (accountsResult.error || !accountsResult.data) throw accountsResult.error ?? new Error("ACCOUNT_USAGE_UNAVAILABLE");
    const project = projectResult.data as ProjectUsage;
    const systemDatabaseGroups = [
      { category: "system-data", usedBytes: project.tables.filter((table) => table.group === "system").reduce((sum, table) => sum + Number(table.dataBytes), 0) },
      { category: "user-data", usedBytes: project.tables.filter((table) => table.group === "personal").reduce((sum, table) => sum + Number(table.dataBytes), 0) },
      { category: "indexes", usedBytes: project.tables.reduce((sum, table) => sum + Number(table.indexBytes) + Number(table.otherBytes), 0) },
    ];
    const knownDatabaseBytes = systemDatabaseGroups.reduce((sum, group) => sum + group.usedBytes, 0);
    const databaseRemainder = Math.max(0, Number(project.database?.usedBytes ?? 0) - knownDatabaseBytes);
    if (databaseRemainder) systemDatabaseGroups.push({ category: "auth-metadata-other", usedBytes: databaseRemainder });
    return NextResponse.json({
      project: {
        database: project.database ? quota(Number(project.database.usedBytes), projectStorageUsageLimits.databaseBytes) : null,
        storage: project.storage ? quota(Number(project.storage.usedBytes), projectStorageUsageLimits.storageBytes) : null,
        tables: project.tables ?? [],
        storageGroups: project.storageGroups ?? [],
        databaseGroups: systemDatabaseGroups.filter((group) => group.usedBytes > 0),
        errors: project.errors ?? {},
        updatedAt: project.collectedAt ?? new Date().toISOString(),
      },
      accounts: accountsResult.data,
      page,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    console.error("[storage-usage-admin] unable to read system capacity", {
      userId: context.userId,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return NextResponse.json({ error: "目前無法取得系統儲存空間資訊。" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

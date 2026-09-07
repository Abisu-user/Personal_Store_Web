import { NextResponse } from "next/server";

import { getSecurityContext } from "@/lib/security/activity";
import { isSystemAdmin } from "@/lib/security/system-admin";
import { getUserCapacity } from "@/lib/system/quota";
import { quota } from "@/lib/system/storage-usage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [capacity, admin] = await Promise.all([
      getUserCapacity(context.userId),
      isSystemAdmin(context.userId),
    ]);
    return NextResponse.json({
      scope: "self",
      isAdmin: admin,
      database: quota(capacity.databaseUsedBytes, capacity.databaseQuotaBytes),
      databaseGroups: capacity.databaseGroups,
      storage: quota(capacity.storageUsedBytes, capacity.storageQuotaBytes),
      storageGroups: capacity.storageGroups,
      errors: {},
      updatedAt: capacity.collectedAt,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    console.error("[storage-usage] unable to read account capacity", {
      userId: context.userId,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return NextResponse.json({
      scope: "self",
      isAdmin: false,
      database: null,
      databaseGroups: [],
      storage: null,
      storageGroups: [],
      errors: { database: "目前無法取得個人資料庫容量。", storage: "目前無法取得個人檔案容量。" },
      updatedAt: new Date().toISOString(),
    }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

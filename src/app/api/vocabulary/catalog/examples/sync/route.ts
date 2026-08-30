import { NextResponse } from "next/server";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSystemExamplesImport } from "../../../../../../../scripts/vocabulary/import-system-examples.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * An authenticated, server-only maintenance operation. The importer is not
 * exposed to anonymous callers and uses the same server-only Supabase key as
 * the rest of the catalogue APIs. It is deliberately idempotent: records are
 * only added when the sentence is not already present for the dictionary entry.
 */
export async function POST() {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const importer = runSystemExamplesImport as (options: { admin: ReturnType<typeof createAdminClient>; language?: string; dryRun?: boolean }) => Promise<unknown>;
    const report = await importer({ admin: createAdminClient() });
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[vocabulary.system-examples] import failed", { userId: context.userId, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "系統例句同步失敗，請稍後再試。" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAiMissingExamplesImport } from "../../../../../../../scripts/vocabulary/import-ai-example-fallback.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Complements, but never replaces, public source examples. Rows created here
 * are explicitly marked as unverified AI examples so the UI can distinguish
 * them from the imported source corpus.
 */
export async function POST() {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const importer = runAiMissingExamplesImport as (options: { admin: ReturnType<typeof createAdminClient> }) => Promise<unknown>;
    const report = await importer({ admin: createAdminClient() });
    return NextResponse.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[vocabulary.ai-examples] import failed", { userId: context.userId, message: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "AI 例句補齊失敗，請稍後再試。" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getSecurityContext } from "@/lib/security/activity";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COOLDOWN_MS = 60 * 60 * 1000;

export async function POST() {
  const context = await getSecurityContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: catalogAdmin, error: catalogAdminError } = await admin
    .from("vocabulary_catalog_admins")
    .select("user_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (catalogAdminError) {
    console.error("[vocabulary.catalog.import] could not verify catalog administrator", { message: catalogAdminError.message });
    return NextResponse.json({ error: "資料集管理權限尚未設定。" }, { status: 503 });
  }
  if (!catalogAdmin) return NextResponse.json({ error: "只有資料集管理者可以執行匯入。" }, { status: 403 });

  const { data: latest, error } = await admin
    .from("vocabulary_dataset_imports")
    .select("status,started_at,imported_at")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[vocabulary.catalog.import] could not read import state", { message: error.message });
    return NextResponse.json({ error: "無法讀取資料集匯入狀態。" }, { status: 503 });
  }
  if (latest?.status === "running") {
    return NextResponse.json({ error: "資料集正在更新，請稍後再試。" }, { status: 409 });
  }
  if (latest?.status === "completed" && latest.imported_at && Date.now() - new Date(latest.imported_at).getTime() < COOLDOWN_MS) {
    return NextResponse.json({ error: "資料集剛更新完成，請稍後再試。" }, { status: 429 });
  }

  try {
    // This script runs in Vercel's trusted Node runtime. The Supabase secret is
    // never returned to the browser or saved on a developer machine.
    const { runVocabularyDatasetImport } = await import("../../../../../../scripts/vocabulary/import-system-datasets.mjs");
    await runVocabularyDatasetImport();
    return NextResponse.json({ ok: true, message: "正式單字資料集已匯入。" });
  } catch (importError) {
    const message = importError instanceof Error ? importError.message : String(importError);
    console.error("[vocabulary.catalog.import] dataset import failed", { userId: context.userId, message });
    return NextResponse.json({ error: "資料集匯入失敗，請查看伺服器記錄。" }, { status: 503 });
  }
}

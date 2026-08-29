import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const COOLDOWN_MS = 60 * 60 * 1000;

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function runVocabularyCatalogImport(userId: string, { language = "all" }: { language?: "ja" | "en" | "all" } = {}) {
  const admin = createAdminClient();
  const { data: catalogAdmin, error: catalogAdminError } = await admin
    .from("vocabulary_catalog_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (catalogAdminError) throw new Error(`資料集管理權限驗證失敗：${catalogAdminError.message}`);
  if (!catalogAdmin) throw new Error("只有資料集管理者可以執行匯入。");

  const { data: latest, error } = await admin
    .from("vocabulary_dataset_imports")
    .select("status,created_at,imported_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`無法讀取資料集匯入狀態：${error.message}`);
  if (latest?.status === "running") throw new Error("資料集正在更新，請稍後再試。");
  if (latest?.status === "completed" && latest.imported_at && Date.now() - new Date(latest.imported_at).getTime() < COOLDOWN_MS) {
    throw new Error("資料集剛更新完成，請稍後再試。");
  }

  const { runVocabularyDatasetImport } = await import("../../../scripts/vocabulary/import-system-datasets.mjs");
  try {
    return await runVocabularyDatasetImport({ language });
  } catch (importError) {
    const message = errorMessage(importError);
    console.error("[vocabulary.catalog.import] importer failed", { userId, message });
    throw new Error(message);
  }
}

export async function getVocabularyCatalogImportStatus(userId: string) {
  const admin = createAdminClient();
  const { data: catalogAdmin, error: catalogAdminError } = await admin
    .from("vocabulary_catalog_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (catalogAdminError) throw new Error(`資料集管理權限驗證失敗：${catalogAdminError.message}`);
  if (!catalogAdmin) return null;

  const { data, error } = await admin
    .from("vocabulary_dataset_imports")
    .select("status, created_at, imported_at, error_message")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`無法讀取資料集匯入狀態：${error.message}`);
  return data;
}

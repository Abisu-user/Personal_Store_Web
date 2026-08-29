import { redirect } from "next/navigation";
import { getSecurityContext } from "@/lib/security/activity";
import { getVocabularyCatalogImportStatus, runVocabularyCatalogImport } from "@/lib/vocabulary/catalog-import";

export const maxDuration = 300;

type ImportPageProps = { searchParams: Promise<{ status?: string }> };

export default async function VocabularyDatasetImportPage({ searchParams }: ImportPageProps) {
  const security = await getSecurityContext();
  if (!security) redirect("/login");
  const { status } = await searchParams;
  const latestImport = await getVocabularyCatalogImportStatus(security.userId);

  async function importDatasetAction() {
    "use server";
    const currentSecurity = await getSecurityContext();
    if (!currentSecurity) redirect("/login");
    try {
      await runVocabularyCatalogImport(currentSecurity.userId, { language: "ja" });
    } catch (error) {
      console.error("[vocabulary.catalog.import] dataset import failed", { message: error instanceof Error ? error.message : JSON.stringify(error) });
      redirect("/vocabulary/import?status=failed");
    }
    redirect("/vocabulary/import?status=completed");
  }

  return (
    <main className="page-shell" style={{ maxWidth: 680, paddingTop: 56 }}>
      <section className="panel-card stack-lg">
        <div>
          <p className="eyebrow">VOCABULARY DATASET MAINTENANCE</p>
          <h1>同步日文正式單字資料集</h1>
          <p className="muted">此作業會在 Vercel 的受信任伺服器端下載 OpenJLPT 與已驗證的繁中詞義，並保留你的既有單字、收藏與學習進度。</p>
          {status === "completed" ? <p role="status">已完成日文正式資料集同步。</p> : null}
          {status === "failed" ? (
            <p role="alert">
              匯入失敗：{latestImport?.status === "failed" && latestImport.error_message ? latestImport.error_message : "伺服器未回傳詳細原因，請稍後再試。"}
            </p>
          ) : null}
        </div>
        <ul className="muted">
          <li>OpenJLPT：日文 N5～N1，共約 8,334 筆</li>
          <li>每個詞義會保留個別的繁中解釋，不會把英文 gloss 逐字翻譯成正式中文。</li>
          <li>同一時間只允許一個匯入作業，完成後一小時內不可重複執行。</li>
        </ul>
        <form action={importDatasetAction}>
          <button className="primary-button" type="submit">開始同步日文資料集</button>
        </form>
      </section>
    </main>
  );
}

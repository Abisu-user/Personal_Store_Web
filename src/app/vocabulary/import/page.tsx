import { redirect } from "next/navigation";
import { getSecurityContext } from "@/lib/security/activity";
import { runVocabularyCatalogImport } from "@/lib/vocabulary/catalog-import";

export const maxDuration = 300;

type ImportPageProps = { searchParams: Promise<{ status?: string }> };

export default async function VocabularyDatasetImportPage({ searchParams }: ImportPageProps) {
  const security = await getSecurityContext();
  if (!security) redirect("/login");
  const { status } = await searchParams;

  async function importDatasetAction() {
    "use server";
    const currentSecurity = await getSecurityContext();
    if (!currentSecurity) redirect("/login");
    try {
      await runVocabularyCatalogImport(currentSecurity.userId);
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
          <h1>匯入正式單字資料集</h1>
          <p className="muted">此作業會在 Vercel 的受信任伺服器端下載公開授權資料集，並保留你的既有單字、收藏與學習進度。</p>
          {status === "completed" ? <p role="status">已完成正式資料集匯入。</p> : null}
          {status === "failed" ? <p role="alert">匯入失敗，請查看伺服器記錄後再試。</p> : null}
        </div>
        <ul className="muted">
          <li>OpenJLPT：日文 N5～N1，共約 8,334 筆</li>
          <li>English–Traditional Chinese TOEIC 字彙，共約 11,154 筆</li>
          <li>同一時間只允許一個匯入作業，完成後一小時內不可重複執行。</li>
        </ul>
        <form action={importDatasetAction}>
          <button className="primary-button" type="submit">開始匯入正式資料集</button>
        </form>
      </section>
    </main>
  );
}

import { redirect } from "next/navigation";
import { getSecurityContext } from "@/lib/security/activity";

export default async function VocabularyDatasetImportPage() {
  const security = await getSecurityContext();
  if (!security) redirect("/login");

  return (
    <main className="page-shell" style={{ maxWidth: 680, paddingTop: 56 }}>
      <section className="panel-card stack-lg">
        <div>
          <p className="eyebrow">VOCABULARY DATASET MAINTENANCE</p>
          <h1>匯入正式單字資料集</h1>
          <p className="muted">此作業會在 Vercel 的受信任伺服器端下載公開授權資料集，並保留你的既有單字、收藏與學習進度。</p>
        </div>
        <ul className="muted">
          <li>OpenJLPT：日文 N5～N1，共約 8,334 筆</li>
          <li>English–Traditional Chinese TOEIC 字彙，共約 11,154 筆</li>
          <li>同一時間只允許一個匯入作業，完成後一小時內不可重複執行。</li>
        </ul>
        <form action="/api/vocabulary/catalog/import" method="post">
          <button className="primary-button" type="submit">開始匯入正式資料集</button>
        </form>
      </section>
    </main>
  );
}

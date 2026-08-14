import Link from "next/link";

export default function Home() {
  return (
    <main className="home">
      <section className="home-panel">
        <p className="eyebrow">PERSONAL DIGITAL VAULT</p>
        <h1>你的私密資料，從安全登入開始。</h1>
        <p>
          目前已啟用 Supabase Auth、受保護 session 與資料庫 RLS。請先建立帳號並驗證 Email，之後再逐步開啟書籤、筆記、檔案與保管庫模組。
        </p>
        <div className="home-actions">
          <Link className="button" href="/sign-up">建立帳號</Link>
          <Link className="button secondary" href="/login">登入</Link>
        </div>
      </section>
    </main>
  );
}

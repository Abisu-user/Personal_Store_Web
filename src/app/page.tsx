export default function Home() {
  return (
    <main style={{ maxWidth: 760, margin: "96px auto", padding: 24 }}>
      <p style={{ color: "#4870b8", fontWeight: 700 }}>PERSONAL DIGITAL VAULT</p>
      <h1 style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)", margin: "16px 0" }}>安全基礎已就緒</h1>
      <p style={{ fontSize: "1.1rem", lineHeight: 1.7 }}>
        Next.js、Supabase Auth、RLS、私有檔案儲存與用戶端 Vault 加密的基底已建立。下一步將從登入與帳號安全模組開始。
      </p>
    </main>
  );
}

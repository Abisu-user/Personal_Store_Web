import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <nav className="landing-nav" aria-label="主要導覽"><Link className="landing-logo" href="/"><span>V</span><strong>Personal Vault</strong></Link><div><Link className="nav-login" href="/login">登入</Link><Link className="nav-join" href="/sign-up">建立帳號</Link></div></nav>
      <section className="landing-hero"><div className="landing-copy"><p className="eyebrow">YOUR PRIVATE DIGITAL SPACE</p><h1>把重要的每一件事，<em>安全地留在你手中。</em></h1><p className="landing-lead">一個為個人而生的數位保管庫。收藏、筆記、檔案與高度私密的資料，都在清楚、可靠的保護中。</p><div className="home-actions"><Link className="button landing-primary" href="/sign-up">開始建立保管庫 <span>→</span></Link><Link className="button secondary landing-secondary" href="/login">安全登入</Link></div><div className="landing-trust"><span>◈ Email 驗證</span><span>⌁ 兩步驟驗證</span><span>◌ 私人儲存</span></div></div><div aria-hidden="true" className="vault-preview"><div className="preview-glow" /><div className="preview-window"><div className="preview-top"><span className="preview-mark">V</span><div><strong>Personal Vault</strong><small>PRIVATE WORKSPACE</small></div><i>●</i></div><div className="preview-body"><aside><span className="preview-active">⌂</span><span>◇</span><span>□</span><span>▣</span><span>◈</span></aside><div className="preview-content"><div className="preview-welcome"><small>GOOD MORNING</small><strong>一切都在該在的地方。</strong><span>你的私人空間已受保護</span></div><div className="preview-stats"><div><i>◇</i><small>收藏</small><b>12</b></div><div><i>□</i><small>筆記</small><b>08</b></div><div><i>◈</i><small>Vault</small><b>•••</b></div></div><div className="preview-lines"><span /><span /><span /></div></div></div></div></div></section>
      <section className="landing-features"><article><i>⌁</i><div><strong>安全優先</strong><p>受保護的登入流程、Session 與資料存取權限。</p></div></article><article><i>◇</i><div><strong>清楚整理</strong><p>以收藏、筆記、檔案與分類管理你的數位生活。</p></div></article><article><i>◈</i><div><strong>私密保管庫</strong><p>為密碼、金鑰與重要資訊保留額外保護層。</p></div></article></section>
    </main>
  );
}

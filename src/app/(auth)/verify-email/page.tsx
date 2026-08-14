import Link from "next/link";

export default function VerifyEmailPage() {
  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">EMAIL VERIFIED</p><h1>信箱驗證完成</h1><p className="lead">你的帳號已可登入。下一步會加入雙因素驗證，保護重要資料的存取。</p><Link className="button" href="/dashboard">進入保管庫</Link></section></main>;
}

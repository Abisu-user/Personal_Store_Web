import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className="dashboard"><section className="dashboard-card dashboard-hero"><div className="dashboard-header"><div><p className="eyebrow">PERSONAL DIGITAL VAULT</p><h1>你的資料，井然有序且受到保護。</h1><p>已使用 <strong>{user.email}</strong> 安全登入。</p></div><SignOutButton /></div><div className="hero-actions"><Link className="button" href="/bookmarks#new-bookmark">＋ 新增資料</Link><Link className="button secondary" href="/bookmarks">瀏覽收藏</Link></div></section><section className="dashboard-overview"><article><span>◇</span><div><strong>我的收藏</strong><p>整理網址、分類與標籤。</p><Link href="/bookmarks">前往收藏 →</Link></div></article><article><span>□</span><div><strong>筆記</strong><p>寫下內容並保留版本快照。</p><Link href="/notes">前往筆記 →</Link></div></article><article><span>◈</span><div><strong>安全防護</strong><p>管理雙因素驗證與已登入裝置。</p><Link href="/security">前往安全中心 →</Link></div></article><article><span>◌</span><div><strong>日曆</strong><p>提醒與重要日期即將加入。</p><Link href="/calendar">查看預告 →</Link></div></article></section></main>;
}

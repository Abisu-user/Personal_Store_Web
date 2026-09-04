import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className="dashboard"><section className="dashboard-card dashboard-hero"><div className="dashboard-header"><div><p className="eyebrow">PERSONAL DIGITAL VAULT</p><h1>你的資料，井然有序且受到保護。</h1><p>已使用 <strong>{user.email}</strong> 安全登入。</p></div><SignOutButton /></div><div className="hero-actions"><Link className="button" href="/create" prefetch={false}>＋ 新增資料</Link><Link className="button secondary" href="/bookmarks" prefetch={false}>瀏覽收藏</Link></div></section><section className="dashboard-overview"><article><span>◇</span><div><strong>我的收藏</strong><p>整理網址、分類與標籤。</p><Link href="/bookmarks" prefetch={false}>前往收藏 →</Link></div></article><article><span>□</span><div><strong>筆記</strong><p>寫下內容並保留版本快照。</p><Link href="/notes" prefetch={false}>前往筆記 →</Link></div></article><article><span>◉</span><div><strong>動漫收藏</strong><p>收藏作品、記錄觀看進度與評分。</p><Link href="/anime" prefetch={false}>前往動漫收藏 →</Link></div></article><article><span>文</span><div><strong>單字學習</strong><p>記錄單字、安排複習並追蹤熟練度。</p><Link href="/vocabulary" prefetch={false}>前往單字學習 →</Link></div></article><article><span>◈</span><div><strong>安全防護</strong><p>管理雙因素驗證與已登入裝置。</p><Link href="/security" prefetch={false}>前往安全中心 →</Link></div></article><article><span>◌</span><div><strong>日曆</strong><p>管理重要日期與私人提醒。</p><Link href="/calendar" prefetch={false}>開啟日曆 →</Link></div></article></section></main>;
}

import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireUser } from "@/lib/security/require-user";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled();
  return <main className="dashboard"><section className="dashboard-card"><div className="dashboard-header"><div><p className="eyebrow">VERIFIED SESSION</p><h1>保管庫已鎖定保護</h1></div><SignOutButton /></div><p>目前登入帳號：{user.email}</p><div className="dashboard-grid"><article className="dashboard-tile"><strong>資料權限</strong><span>每筆資料由 Row Level Security 限制為本人可見。</span></article><article className="dashboard-tile"><strong>登入狀態</strong><span>伺服端已驗證 Supabase session 與信箱。</span></article><article className="dashboard-tile"><strong>雙因素驗證</strong><Link className="text-link" href="/security/mfa">設定驗證器</Link></article><article className="dashboard-tile"><strong>裝置與活動</strong><Link className="text-link" href="/security">查看安全紀錄</Link></article></div></section></main>;
}

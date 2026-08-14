import { SignOutButton } from "@/components/auth/sign-out-button";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  return <main className="dashboard"><section className="dashboard-card"><div className="dashboard-header"><div><p className="eyebrow">VERIFIED SESSION</p><h1>保管庫已鎖定保護</h1></div><SignOutButton /></div><p>目前登入帳號：{user.email}</p><div className="dashboard-grid"><article className="dashboard-tile"><strong>資料權限</strong><span>每筆資料由 Row Level Security 限制為本人可見。</span></article><article className="dashboard-tile"><strong>登入狀態</strong><span>伺服端已驗證 Supabase session 與信箱。</span></article><article className="dashboard-tile"><strong>下一步</strong><span>加入雙因素驗證與裝置工作階段管理。</span></article></div></section></main>;
}

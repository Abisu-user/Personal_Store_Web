import Link from "next/link";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

const destinations = [
  ["/bookmarks", "收藏與整理", "管理收藏的資料夾與類別"],
  ["/notes", "筆記", "管理筆記的資料夾與類別"],
  ["/code", "程式碼", "管理程式碼的資料夾與類別"],
  ["/files", "檔案", "管理檔案的資料夾與類別"],
  ["/photos", "照片", "管理照片的資料夾與類別"],
] as const;

export default async function OrganizePage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className="dashboard"><section className="dashboard-card organize-guide"><p className="eyebrow">ORGANIZE YOUR CONTENT</p><h1>資料夾與類別</h1><p>資料夾與類別已改為在各資料頁就近管理：資料夾列與類別列都有「管理」和「＋ 新增」，不再另外維護一份容易不同步的清單。</p><div className="organize-guide-links">{destinations.map(([href, title, description]) => <Link href={href} key={href}><strong>{title}</strong><span>{description}</span><b>前往管理 →</b></Link>)}</div><p className="organize-guide-note">資料夾 PIN 請在 <Link href="/security">安全中心</Link> 設定。</p></section></main>;
}

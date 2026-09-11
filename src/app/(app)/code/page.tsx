import { CodeWorkspace } from "@/components/code/code-workspace";
import { CreateItemButton } from "@/components/layout/create-item-provider";
import { AppIcon } from "@/components/ui/app-icon";
import collectionStyles from "@/components/ui/mobile-collection.module.css";
import mobileStyles from "@/components/ui/mobile-library.module.css";
import { getCodeWorkspaceData } from "@/lib/code/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function CodePage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const initialData = await getCodeWorkspaceData(user.id);
  return <main className={`dashboard ${collectionStyles.collectionPage} ${mobileStyles.libraryPage}`}><section className="dashboard-card"><div className="page-heading"><div><p className="eyebrow">CODE SNIPPETS</p><h1>程式碼片段</h1><p>安全保存常用指令、範例與設定檔，依程式語言、分類與標籤快速找回。</p></div><CreateItemButton kind="code"><span className={mobileStyles.desktopAddLabel}>＋ 新增程式碼</span><span className={mobileStyles.mobileAddLabel}><AppIcon name="plus" />新增</span></CreateItemButton></div><CodeWorkspace initialData={initialData} /></section></main>;
}

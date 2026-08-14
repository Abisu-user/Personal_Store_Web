import { CodeWorkspace } from "@/components/code/code-workspace";
import { getCodeWorkspaceData } from "@/lib/code/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function CodePage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const initialData = await getCodeWorkspaceData(user.id);
  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">CODE SNIPPETS</p><h1>程式碼片段</h1><p>安全保存常用指令、範例與設定檔，依程式語言、分類與標籤快速找回。</p><CodeWorkspace initialData={initialData} /></section></main>;
}

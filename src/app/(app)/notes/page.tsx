import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { CreateItemButton } from "@/components/layout/create-item-provider";
import { AppIcon } from "@/components/ui/app-icon";
import { MobilePageHeader } from "@/components/ui/mobile-layout";
import collectionStyles from "@/components/ui/mobile-collection.module.css";
import mobileStyles from "@/components/ui/mobile-library.module.css";
import { getNotesWorkspaceData } from "@/lib/notes/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const initialData = await getNotesWorkspaceData(user.id);

  return <main className={`dashboard ${collectionStyles.collectionPage} ${mobileStyles.libraryPage}`}><section className="dashboard-card"><MobilePageHeader eyebrow="NOTES" title="筆記與想法" actions={<CreateItemButton className="mobile-header-create-button" kind="note"><AppIcon name="plus" /><span className="sr-only">新增筆記</span></CreateItemButton>} /><div className="page-heading"><div><p className="eyebrow">PRIVATE NOTES</p><h1>筆記與想法</h1><p>以 Markdown 寫下內容、整理標籤；每次內容變動都會在資料庫留下版本快照。</p></div><CreateItemButton kind="note"><span className={mobileStyles.desktopAddLabel}>＋ 新增筆記</span><span className={mobileStyles.mobileAddLabel}><AppIcon name="plus" />新增</span></CreateItemButton></div><NotesWorkspace initialData={initialData} /></section></main>;
}

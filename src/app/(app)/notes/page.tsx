import { NotesWorkspace } from "@/components/notes/notes-workspace";
import Link from "next/link";
import { getNotesWorkspaceData } from "@/lib/notes/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const initialData = await getNotesWorkspaceData(user.id);

  return <main className="dashboard"><section className="dashboard-card"><div className="page-heading"><div><p className="eyebrow">PRIVATE NOTES</p><h1>筆記與想法</h1><p>以 Markdown 寫下內容、整理標籤；每次內容變動都會在資料庫留下版本快照。</p></div><Link className="button page-create-button" href="/create/note">＋ 新增筆記</Link></div><NotesWorkspace initialData={initialData} /></section></main>;
}

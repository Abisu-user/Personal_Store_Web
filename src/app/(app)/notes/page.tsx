import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { getNotesWorkspaceData } from "@/lib/notes/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const initialData = await getNotesWorkspaceData(user.id);

  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">PRIVATE NOTES</p><h1>筆記與想法</h1><p>以 Markdown 寫下內容、整理標籤；每次內容變動都會在資料庫留下版本快照。</p><NotesWorkspace initialData={initialData} /></section></main>;
}

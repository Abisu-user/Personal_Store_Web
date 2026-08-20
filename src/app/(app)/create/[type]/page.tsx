import { notFound } from "next/navigation";
import Link from "next/link";
import { BookmarksWorkspace } from "@/components/bookmarks/bookmarks-workspace";
import { CodeWorkspace } from "@/components/code/code-workspace";
import { FilesWorkspace } from "@/components/files/files-workspace";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { getBookmarksWorkspaceData } from "@/lib/bookmarks/data";
import { getCodeWorkspaceData } from "@/lib/code/data";
import { getFilesWorkspaceData } from "@/lib/files/data";
import { getNotesWorkspaceData } from "@/lib/notes/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function CreateTypePage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const content = await (async () => {
    switch (type) {
      case "bookmark": return <BookmarksWorkspace createMode initialData={await getBookmarksWorkspaceData(user.id)} />;
      case "note": return <NotesWorkspace createMode initialData={await getNotesWorkspaceData(user.id)} />;
      case "code": return <CodeWorkspace createMode initialData={await getCodeWorkspaceData(user.id)} />;
      case "file": return <FilesWorkspace createMode initialData={await getFilesWorkspaceData(user.id)} />;
      default: return null;
    }
  })();
  if (!content) notFound();
  return <main className="dashboard"><section className="dashboard-card"><div className="create-page-heading"><div><p className="eyebrow">CREATE NEW ITEM</p><h1>新增資料</h1></div><Link className="secondary-button create-back-link" href="/create">← 返回選擇新增種類</Link></div>{content}</section></main>;
}

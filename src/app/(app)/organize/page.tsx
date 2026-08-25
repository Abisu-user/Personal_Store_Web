import { CategoryFolderManagement } from "@/components/content/category-folder-management";
import { getBookmarksWorkspaceData } from "@/lib/bookmarks/data";
import { getCodeWorkspaceData } from "@/lib/code/data";
import { getFilesWorkspaceData } from "@/lib/files/data";
import { getNotesWorkspaceData } from "@/lib/notes/data";
import { getPhotosWorkspaceData } from "@/lib/photos/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function OrganizePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const { type } = await searchParams;
  const initialTab = ["bookmark", "note", "code", "file", "photo"].includes(type ?? "") ? type as "bookmark" | "note" | "code" | "file" | "photo" : "bookmark";
  const [bookmarks, notes, code, files, photos] = await Promise.all([getBookmarksWorkspaceData(user.id), getNotesWorkspaceData(user.id), getCodeWorkspaceData(user.id), getFilesWorkspaceData(user.id), getPhotosWorkspaceData(user.id)]);
  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">MANAGE YOUR FOLDERS</p><h1>管理資料夾</h1><p>集中管理收藏、筆記、程式碼、檔案與照片的資料夾、鎖定與常駐清單；類別請直接在各資料頁新增與整理。</p><CategoryFolderManagement bookmarks={bookmarks} code={code} files={files} initialTab={initialTab} notes={notes} photos={photos} /></section></main>;
}

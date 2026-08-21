import { CategoryFolderManagement } from "@/components/content/category-folder-management";
import { getBookmarksWorkspaceData } from "@/lib/bookmarks/data";
import { getCodeWorkspaceData } from "@/lib/code/data";
import { getFilesWorkspaceData } from "@/lib/files/data";
import { getNotesWorkspaceData } from "@/lib/notes/data";
import { getPhotosWorkspaceData } from "@/lib/photos/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function OrganizePage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const [bookmarks, notes, code, files, photos] = await Promise.all([getBookmarksWorkspaceData(user.id), getNotesWorkspaceData(user.id), getCodeWorkspaceData(user.id), getFilesWorkspaceData(user.id), getPhotosWorkspaceData(user.id)]);
  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">ORGANIZE YOUR VAULT</p><h1>管理類別／資料夾</h1><p>集中管理收藏、筆記、程式碼、檔案與照片的整理方式；分頁切換後只會修改該類型的資料夾。</p><CategoryFolderManagement bookmarks={bookmarks} code={code} files={files} notes={notes} photos={photos} /></section></main>;
}

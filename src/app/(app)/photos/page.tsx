import { PhotosWorkspace } from "@/components/photos/photos-workspace";
import Link from "next/link";
import { getPhotosWorkspaceData } from "@/lib/photos/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className="dashboard"><section className="dashboard-card"><div className="page-heading"><div><p className="eyebrow">PRIVATE PHOTO STORAGE</p><h1>照片</h1><p>將照片保存在私有空間；可用類別、資料夾與常駐清單整理，刪除後會保留在垃圾桶 30 天。</p></div><Link className="button page-create-button" href="/create/photo">＋ 上傳照片</Link></div><PhotosWorkspace initialData={await getPhotosWorkspaceData(user.id)} /></section></main>;
}

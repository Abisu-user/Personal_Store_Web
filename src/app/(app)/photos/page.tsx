import { PhotosWorkspace } from "@/components/photos/photos-workspace";
import { CreateItemButton } from "@/components/layout/create-item-provider";
import { AppIcon } from "@/components/ui/app-icon";
import collectionStyles from "@/components/ui/mobile-collection.module.css";
import mobileStyles from "@/components/photos/photos-mobile.module.css";
import { getPhotosWorkspaceData } from "@/lib/photos/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function PhotosPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className={`dashboard ${collectionStyles.collectionPage} ${mobileStyles.photosPage}`}><section className="dashboard-card"><div className="page-heading"><div><p className="eyebrow">PRIVATE PHOTO STORAGE</p><h1>照片</h1><p>將照片保存在私有空間；可用類別、資料夾與常駐清單整理，刪除後會保留在垃圾桶 30 天。</p></div><CreateItemButton kind="photo"><span className={mobileStyles.desktopAddLabel}>＋ 上傳照片</span><span className={mobileStyles.mobileAddLabel}><AppIcon name="plus" />上傳</span></CreateItemButton></div><PhotosWorkspace initialData={await getPhotosWorkspaceData(user.id)} /></section></main>;
}

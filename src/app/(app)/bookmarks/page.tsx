import { BookmarksWorkspace } from "@/components/bookmarks/bookmarks-workspace";
import collectionStyles from "@/components/ui/mobile-collection.module.css";
import styles from "@/components/bookmarks/bookmarks-mobile.module.css";
import { AppIcon } from "@/components/ui/app-icon";
import { CreateItemButton } from "@/components/layout/create-item-provider";
import { MobilePageHeader } from "@/components/ui/mobile-layout";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className={`dashboard ${collectionStyles.collectionPage} ${styles.bookmarkPage}`}><section className="dashboard-card"><MobilePageHeader eyebrow="BOOKMARKS" title="網站收藏" actions={<CreateItemButton className="mobile-header-create-button" kind="bookmark"><AppIcon name="plus" /><span className="sr-only">新增網站收藏</span></CreateItemButton>} /><div className="page-heading"><div><p className="eyebrow">BOOKMARK COLLECTION</p><h1>網站收藏</h1><p>將常用網址放入個人保管庫，依分類與標籤快速找回。</p></div><CreateItemButton kind="bookmark"><span className={styles.desktopAddLabel}>＋ 新增網站收藏</span><span className={styles.mobileAddLabel}><AppIcon name="plus" />新增</span></CreateItemButton></div><BookmarksWorkspace /></section></main>;
}

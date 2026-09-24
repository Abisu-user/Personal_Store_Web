import Link from "next/link";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";
import { getAllDesktopFolders } from "@/lib/dashboard/desktop-data";
import { AppIcon } from "@/components/ui/app-icon";
import styles from "./folder-overview.module.css";

export const dynamic = "force-dynamic";

const destinations = [
  ["/bookmarks", "網站收藏", "管理收藏的資料夾與類別"],
  ["/notes", "筆記", "管理筆記的資料夾與類別"],
  ["/code", "程式碼", "管理程式碼的資料夾與類別"],
  ["/files", "檔案", "管理檔案的資料夾與類別"],
  ["/photos", "照片", "管理照片的資料夾與類別"],
] as const;

export default async function OrganizePage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const folders = await getAllDesktopFolders(user.id).catch((error) => {
    console.warn("[organize] folder overview unavailable", error);
    return null;
  });
  const labels = { bookmark: "網站收藏", note: "筆記", code: "程式碼", file: "檔案", photo: "照片", anime: "動漫收藏" };
  return <main className={`dashboard ${styles.page}`}><section className="dashboard-card organize-guide"><p className="eyebrow">ORGANIZE YOUR CONTENT</p><h1>所有資料夾</h1><p>集中查看各功能的資料夾；內容與權限仍由原本的功能頁管理。</p>
    {folders === null ? <p className="notice error">資料夾暫時無法載入，請重新整理後再試。</p> : folders.length ? <div className={styles.grid}>{folders.map((folder) => <Link className={styles.folder} href={folder.href} key={`${folder.kind}:${folder.id}`} prefetch={false}><span className={styles.icon}><AppIcon name={folder.locked ? "lock" : "folder"} /></span><strong>{folder.name}</strong><small>{labels[folder.kind]} · {folder.locked ? "已鎖定" : "資料夾"}</small><span className={styles.arrow}>›</span></Link>)}</div> : <p className={styles.empty}>尚未建立資料夾。</p>}
    <div className={styles.management}><strong>資料夾與類別管理</strong><p>新增、重新命名與排序仍在各功能頁操作。</p><div className="organize-guide-links">{destinations.map(([href, title, description]) => <Link href={href} key={href}><strong>{title}</strong><span>{description}</span><b>前往管理 →</b></Link>)}</div><p className="organize-guide-note">資料夾 PIN 請在 <Link href="/security">安全中心</Link> 設定。</p></div>
  </section></main>;
}

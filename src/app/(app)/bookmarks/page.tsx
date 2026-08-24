import { BookmarksWorkspace } from "@/components/bookmarks/bookmarks-workspace";
import Link from "next/link";
import { getBookmarksWorkspaceData } from "@/lib/bookmarks/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const initialData = await getBookmarksWorkspaceData(user.id);

  return <main className="dashboard"><section className="dashboard-card"><div className="page-heading"><div><p className="eyebrow">BOOKMARK COLLECTION</p><h1>收藏與整理</h1><p>將常用網址放入個人保管庫，依分類與標籤快速找回。</p></div><Link className="button page-create-button" href="/create/bookmark">＋ 新增收藏</Link></div><BookmarksWorkspace initialData={initialData} /></section></main>;
}

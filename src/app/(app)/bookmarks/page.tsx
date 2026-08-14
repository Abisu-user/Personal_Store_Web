import { BookmarksWorkspace } from "@/components/bookmarks/bookmarks-workspace";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  await requireUser(); await requireMfaIfEnrolled();
  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">BOOKMARK COLLECTION</p><h1>收藏與整理</h1><p>將常用網址放入個人保管庫，依分類與標籤快速找回。</p><BookmarksWorkspace /></section></main>;
}

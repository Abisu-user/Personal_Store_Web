import { AnimeWorkspace } from "@/components/anime/anime-workspace";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";
export default async function AnimePage() {
  const user = await requireUser(); await requireMfaIfEnrolled(user);
  return <main className="dashboard"><section className="dashboard-card"><div className="page-heading anime-page-heading"><div><p className="eyebrow">ANIME LIBRARY</p><h1>動漫收藏</h1><p>搜尋 Anime Database，一鍵加入並記錄每一部作品的觀看進度。</p></div></div><AnimeWorkspace /></section></main>;
}

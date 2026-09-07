import { redirect } from "next/navigation";
import { AnimeWorkspace } from "@/components/anime/anime-workspace";
import { getAdultContentPermissions } from "@/lib/security/adult-content";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function AdultAnimePage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const permissions = await getAdultContentPermissions(user.id);
  if (!permissions.adultContentAccess) redirect("/anime");

  return <main className="dashboard anime-dashboard"><section className="dashboard-card"><div className="page-heading anime-page-heading"><div><p className="eyebrow">ANIME LIBRARY</p><h1>動漫收藏</h1><p>搜尋 Anime Database，一鍵加入並記錄每一部作品的觀看進度。</p></div></div><AnimeWorkspace initialAdultOpen /></section></main>;
}

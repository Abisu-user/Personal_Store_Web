import { redirect } from "next/navigation";
import { AnimeWorkspace } from "@/components/anime/anime-workspace";
import collectionStyles from "@/components/ui/mobile-collection.module.css";
import styles from "@/components/anime/anime-mobile.module.css";
import { getAdultContentPermissions } from "@/lib/security/adult-content";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function AdultAnimePage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const permissions = await getAdultContentPermissions(user.id);
  if (!permissions.adultContentAccess) redirect("/anime");

  return <main className={`dashboard anime-dashboard ${collectionStyles.collectionPage} ${styles.animePage}`}><section className="dashboard-card"><AnimeWorkspace initialAdultOpen /></section></main>;
}

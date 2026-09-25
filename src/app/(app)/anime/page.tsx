import { AnimeWorkspace } from "@/components/anime/anime-workspace";
import collectionStyles from "@/components/ui/mobile-collection.module.css";
import styles from "@/components/anime/anime-mobile.module.css";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";
export default async function AnimePage() {
  const user = await requireUser(); await requireMfaIfEnrolled(user);
  return <main className={`dashboard anime-dashboard ${collectionStyles.collectionPage} ${styles.animePage}`}><section className="dashboard-card"><AnimeWorkspace /></section></main>;
}

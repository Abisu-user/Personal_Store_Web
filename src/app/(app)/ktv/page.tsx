import { KtvWorkspace } from "@/components/ktv/ktv-workspace";
import styles from "@/components/ktv/ktv.module.css";
import { getKtvWorkspaceData } from "@/lib/ktv/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function KtvPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const data = await getKtvWorkspaceData(user.id);

  return <main className={`dashboard ${styles.page}`}>
    <section className={`dashboard-card ${styles.pageCard}`}>
      <header className={styles.pageHeader}>
        <div>
          <p className="eyebrow">KTV SONG COLLECTION</p>
          <h1>KTV 點歌收藏</h1>
          <p>把常唱的點歌號碼整理起來，需要時快速找到。</p>
        </div>
      </header>
      <KtvWorkspace initialData={data} />
    </section>
  </main>;
}

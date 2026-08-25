import { VocabularyWorkspace } from "@/components/vocabulary/vocabulary-workspace";
import { getSecurityContext } from "@/lib/security/activity";
import { getVocabularyWorkspaceData } from "@/lib/vocabulary/data";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function VocabularyPage() {
  const context = await getSecurityContext();
  if (!context) redirect("/login");

  const data = await getVocabularyWorkspaceData(context.userId);

  return (
    <main className="dashboard">
      <section className="dashboard-card">
        <VocabularyWorkspace initialData={data} />
      </section>
    </main>
  );
}

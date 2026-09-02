import { VocabularyWorkspace } from "@/components/vocabulary/vocabulary-workspace";
import { getSecurityContext } from "@/lib/security/activity";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function VocabularyPage() {
  const context = await getSecurityContext();
  if (!context) redirect("/login");

  return <main className="dashboard vocabulary-page"><section className="dashboard-card vocabulary-dashboard-card"><VocabularyWorkspace /></section></main>;
}

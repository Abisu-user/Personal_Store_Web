import { VocabularyWorkspace } from "@/components/vocabulary/vocabulary-workspace";
import { getSecurityContext } from "@/lib/security/activity";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function VocabularyPage() {
  const context = await getSecurityContext();
  if (!context) redirect("/login");

  return <main className="vocabulary-page"><VocabularyWorkspace /></main>;
}

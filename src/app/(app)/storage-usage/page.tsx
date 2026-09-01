import { StorageUsageWorkspace } from "@/components/system/storage-usage-workspace";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";

export default async function StorageUsagePage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className="dashboard storage-usage-page"><section className="dashboard-card"><StorageUsageWorkspace /></section></main>;
}

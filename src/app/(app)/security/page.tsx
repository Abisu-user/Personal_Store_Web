import Link from "next/link";
import { SecurityActivity } from "@/components/security/security-activity";
import { PasskeySettings } from "@/components/security/passkey-settings";
import { AdultContentSettings } from "@/components/security/adult-content-settings";
import { AdultPermissionManager } from "@/components/security/adult-permission-manager";
import { FolderLockSecuritySettings } from "@/components/security/folder-lock-settings";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";
import { getAdultContentPermissions } from "@/lib/security/adult-content";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const permissions = await getAdultContentPermissions(user.id);
  return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">ACCOUNT SECURITY</p><h1>裝置與安全活動</h1><p>管理已登入的裝置，並查看服務端記錄的安全事件。</p><p><Link className="text-link" href="/security/mfa">管理雙因素驗證</Link></p><PasskeySettings /><AdultContentSettings canAccess={permissions.adultContentAccess} />{permissions.adultContentAdmin && <AdultPermissionManager />}<FolderLockSecuritySettings /><SecurityActivity /></section></main>;
}

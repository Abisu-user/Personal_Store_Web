import Link from "next/link";
import { SecurityActivity } from "@/components/security/security-activity";
import { PasskeySettings } from "@/components/security/passkey-settings";
import { AdultContentSettings } from "@/components/security/adult-content-settings";
import { AdultPermissionManager } from "@/components/security/adult-permission-manager";
import { FolderLockSecuritySettings } from "@/components/security/folder-lock-settings";
import { AccountDeletionSettings } from "@/components/security/account-deletion-settings";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";
import { getAdultContentPermissions } from "@/lib/security/adult-content";
import { AppIcon } from "@/components/ui/app-icon";
import mobileStyles from "@/components/security/security-mobile.module.css";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  const permissions = await getAdultContentPermissions(user.id);
  return <main className={`dashboard ${mobileStyles.securityPage}`}><section className="dashboard-card"><p className="eyebrow">ACCOUNT SECURITY</p><h1><span className={mobileStyles.desktopTitle}>裝置與安全活動</span><span className={mobileStyles.mobileTitle}>安全中心</span></h1><p>管理已登入的裝置，並查看服務端記錄的安全事件。</p><p className={mobileStyles.desktopMfaLink}><Link className="text-link" href="/security/mfa">管理雙因素驗證</Link></p><section className={mobileStyles.mobileSecuritySummary}><span aria-hidden="true"><AppIcon name="security" /></span><div><strong>帳戶安全設定</strong><p>集中管理鎖定、登入驗證、裝置與敏感內容權限。</p></div><nav aria-label="安全快速操作"><Link href="/profile">修改密碼</Link><Link href="/security/mfa">雙因素驗證</Link></nav></section><PasskeySettings />{permissions.adultContentAccess && <AdultContentSettings canAccess />}{permissions.adultContentAdmin && <AdultPermissionManager />}<FolderLockSecuritySettings /><SecurityActivity /><AccountDeletionSettings /></section></main>;
}

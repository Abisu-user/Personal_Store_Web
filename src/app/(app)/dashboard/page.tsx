import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

import { MobileDashboard } from "./mobile-dashboard";
import { DesktopDashboard } from "./desktop-dashboard";
import styles from "./dashboard-mobile.module.css";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className={`dashboard ${styles.dashboardPage}`}><DesktopDashboard email={user.email ?? "Personal Store"} /><MobileDashboard email={user.email ?? "Personal Store"} /></main>;
}

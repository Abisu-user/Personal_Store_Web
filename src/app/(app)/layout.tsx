import { AppSidebar } from "@/components/layout/app-sidebar";
import { ContextCreateButton } from "@/components/layout/context-create-button";
import { MobileAppNavigation } from "@/components/layout/mobile-app-navigation";
import { AppLockProvider } from "@/components/security/app-lock-provider";
import { getUserProfile } from "@/lib/profile/data";
import { getAppLockPinStatus } from "@/lib/app-lock/data";
import { requireUser } from "@/lib/security/require-user";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [profile, appLockPinStatus] = await Promise.all([getUserProfile(user), getAppLockPinStatus(user.id)]);
  return <AppLockProvider email={user.email ?? ""} initialPinStatus={appLockPinStatus}><div className="app-shell"><AppSidebar avatar={profile.avatar} displayName={profile.displayName} email={user.email ?? "vault-user"} /><div className="app-main">{children}<ContextCreateButton /></div><MobileAppNavigation /></div></AppLockProvider>;
}

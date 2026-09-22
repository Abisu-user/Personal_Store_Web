import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppProfileProvider } from "@/components/layout/app-profile-provider";
import { CreateItemProvider } from "@/components/layout/create-item-provider";
import { ContextCreateButton } from "@/components/layout/context-create-button";
import { MobileAppNavigation } from "@/components/layout/mobile-app-navigation";
import { AppPageTransition } from "@/components/layout/app-page-transition";
import { AppLockProvider } from "@/components/security/app-lock-provider";
import { getUserProfile } from "@/lib/profile/data";
import { getAppLockPinStatus } from "@/lib/app-lock/data";
import { requireUser } from "@/lib/security/require-user";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [profile, appLockPinStatus] = await Promise.all([getUserProfile(user), getAppLockPinStatus(user.id)]);
  return <AppLockProvider email={user.email ?? ""} initialPinStatus={appLockPinStatus}><AppProfileProvider profile={profile}><CreateItemProvider><div className="app-shell"><AppSidebar avatar={profile.avatar} displayName={profile.displayName} email={user.email ?? "vault-user"} /><div className="app-main"><AppPageTransition>{children}</AppPageTransition><ContextCreateButton /></div><MobileAppNavigation /></div></CreateItemProvider></AppProfileProvider></AppLockProvider>;
}

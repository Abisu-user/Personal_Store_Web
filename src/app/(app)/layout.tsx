import { AppProfileProvider } from "@/components/layout/app-profile-provider";
import { CreateItemProvider } from "@/components/layout/create-item-provider";
import { DesktopAppShell } from "@/components/layout/desktop-app-shell";
import { AppLockProvider } from "@/components/security/app-lock-provider";
import { BackgroundSaveProvider } from "@/components/background-save/background-save-provider";
import { getUserProfile } from "@/lib/profile/data";
import { getAppLockPinStatus } from "@/lib/app-lock/data";
import { requireUser } from "@/lib/security/require-user";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [profile, appLockPinStatus] = await Promise.all([getUserProfile(user), getAppLockPinStatus(user.id)]);
  return <AppLockProvider email={user.email ?? ""} initialPinStatus={appLockPinStatus}><AppProfileProvider profile={profile}><BackgroundSaveProvider userId={user.id}><CreateItemProvider><DesktopAppShell avatar={profile.avatar} displayName={profile.displayName} email={user.email ?? "vault-user"}>{children}</DesktopAppShell></CreateItemProvider></BackgroundSaveProvider></AppProfileProvider></AppLockProvider>;
}

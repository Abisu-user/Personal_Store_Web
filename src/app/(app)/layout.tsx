import { AppSidebar } from "@/components/layout/app-sidebar";
import { ContextCreateButton } from "@/components/layout/context-create-button";
import { getUserProfile } from "@/lib/profile/data";
import { requireUser } from "@/lib/security/require-user";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const profile = await getUserProfile(user);
  return <div className="app-shell"><AppSidebar avatar={profile.avatar} displayName={profile.displayName} email={user.email ?? "vault-user"} /><div className="app-main">{children}<ContextCreateButton /></div></div>;
}

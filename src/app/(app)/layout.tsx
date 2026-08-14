import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireUser } from "@/lib/security/require-user";
import type { ReactNode } from "react";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <div className="app-shell"><AppSidebar email={user.email ?? "vault-user"} /><div className="app-main">{children}</div></div>;
}

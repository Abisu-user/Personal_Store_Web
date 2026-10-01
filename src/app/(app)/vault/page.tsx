import { VaultWorkspace } from "@/components/vault/vault-workspace";
import mobileStyles from "@/components/vault/vault-mobile.module.css";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";
export default async function VaultPage() {
  const user = await requireUser();
  await requireMfaIfEnrolled(user);
  return <main className={`dashboard ${mobileStyles.vaultPage}`}>
    <section className={`vault-page-content ${mobileStyles.pageContent}`}>
      <header className="page-heading"><div><h1>私密保管庫</h1></div></header>
      <VaultWorkspace />
    </section>
  </main>;
}

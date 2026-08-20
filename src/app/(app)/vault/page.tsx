import { VaultWorkspace } from "@/components/vault/vault-workspace";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";
export default async function VaultPage() { const user = await requireUser(); await requireMfaIfEnrolled(user); return <main className="dashboard"><section className="dashboard-card"><p className="eyebrow">HIGH SECURITY</p><h1>私密保管庫</h1><p>密碼、Recovery Code 與 API Key 在瀏覽器端以 AES-256-GCM 加密；伺服器不持有你的 Vault 密碼或明文。</p><VaultWorkspace /></section></main>; }

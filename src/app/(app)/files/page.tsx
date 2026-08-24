import { FilesWorkspace } from "@/components/files/files-workspace";
import Link from "next/link";
import { getFilesWorkspaceData } from "@/lib/files/data";
import { requireMfaIfEnrolled } from "@/lib/security/require-mfa";
import { requireUser } from "@/lib/security/require-user";

export const dynamic = "force-dynamic";
export default async function FilesPage() { const user = await requireUser(); await requireMfaIfEnrolled(user); const initialData = await getFilesWorkspaceData(user.id); return <main className="dashboard"><section className="dashboard-card"><div className="page-heading"><div><p className="eyebrow">SECURE FILES</p><h1>檔案保管</h1><p>檔案只存於私有 bucket；下載時才依目前登入狀態產生短效連結。</p></div><Link className="button page-create-button" href="/create/file">＋ 上傳檔案</Link></div><FilesWorkspace initialData={initialData} /></section></main>; }

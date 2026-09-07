"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { formatBytes } from "@/lib/format-bytes";

type Status = "healthy" | "growing" | "high" | "critical" | "exceeded";
type Quota = { usedBytes: number; limitBytes: number; remainingBytes: number; overageBytes: number; usagePercent: number; status: Status };
type StorageGroup = { category: string; usedBytes: number };
type TableUsage = { name: string; group: "system" | "personal"; dataBytes: number; indexBytes: number; otherBytes: number; totalBytes: number };
type Usage = { scope: "self"; isAdmin: boolean; database: Quota | null; storage: Quota | null; storageGroups: StorageGroup[]; errors: { database?: string; storage?: string }; updatedAt: string };
type AccountUsage = { userId: string; email: string; displayName: string | null; capacity: { databaseUsedBytes: number; databaseQuotaBytes: number; storageUsedBytes: number; storageQuotaBytes: number } };
type AdminUsage = { project: { database: Quota | null; storage: Quota | null; tables: TableUsage[]; storageGroups: StorageGroup[]; errors: Record<string, string>; updatedAt: string }; accounts: { total: number; users: AccountUsage[] }; page: number };

const storageLabels: Record<string, string> = { photos: "照片", files: "一般檔案", "content-covers": "內容封面", "workspace-backgrounds": "工作區背景", avatars: "個人頭像" };
const statusCopy: Record<Status, string> = { healthy: "容量充足", growing: "使用量增加", high: "儲存空間即將用完", critical: "儲存空間即將用完", exceeded: "已超出限額" };

function Progress({ quota }: { quota: Quota }) {
  return <div aria-label={`已使用 ${quota.usagePercent.toFixed(1)}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.min(quota.usagePercent, 100)} className={`storage-progress ${quota.status}`} role="progressbar"><span style={{ width: `${Math.min(100, Math.max(0, quota.usagePercent))}%` }} /></div>;
}

function CapacityCard({ title, quota, error, updatedAt }: { title: "Database" | "Storage"; quota: Quota | null; error?: string; updatedAt?: string }) {
  if (!quota) return <article className="storage-capacity-card storage-capacity-error"><p className="eyebrow">{title.toUpperCase()}</p><h2>{title}</h2><p>{error || "目前無法取得容量。"}</p></article>;
  const warning = quota.usagePercent >= 80;
  return <article className="storage-capacity-card">
    <div className="storage-card-heading"><p className="eyebrow">{title.toUpperCase()}</p><span className={`storage-status ${quota.status}`}>{warning ? "!" : "✓"} {statusCopy[quota.status]}</span></div>
    <h2>{title}</h2>
    <strong className="storage-capacity-value">{formatBytes(quota.usedBytes)} <small>/ {formatBytes(quota.limitBytes)}</small></strong>
    <Progress quota={quota} />
    <div className="storage-capacity-metrics"><span><strong>{quota.usagePercent.toFixed(1)}%</strong> 已使用</span><span><strong>{formatBytes(quota.remainingBytes)}</strong> 剩餘</span></div>
    {warning && <p className="storage-quota-warning">{title === "Database" ? "資料庫容量" : "檔案儲存空間"}即將用完，請整理不需要的資料。</p>}
    <small className="storage-updated">統計時間：{updatedAt ? new Date(updatedAt).toLocaleString("zh-TW") : "—"}</small>
  </article>;
}

function AdminPanel({ initialPage = 1 }: { initialPage?: number }) {
  const [data, setData] = useState<AdminUsage | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (nextPage: number, q: string) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/system/storage-usage/admin?page=${nextPage}&q=${encodeURIComponent(q)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "目前無法取得管理員統計。");
      setData(result); setPage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "目前無法取得管理員統計。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(initialPage, ""), 0);
    return () => window.clearTimeout(timer);
  }, [initialPage, load]);
  function submit(event: FormEvent) { event.preventDefault(); void load(1, query.trim()); }
  const pages = Math.max(1, Math.ceil((data?.accounts.total ?? 0) / 20));
  return <section className="storage-admin-panel">
    <header><div><p className="eyebrow">ADMIN ONLY</p><h2>系統儲存空間</h2><p>完整專案容量、資料表明細及所有帳號的個人配額。</p></div></header>
    {error && <p className="notice error" role="alert">{error}</p>}
    {data?.project && <><div className="storage-capacity-grid"><CapacityCard quota={data.project.database} title="Database" updatedAt={data.project.updatedAt} /><CapacityCard quota={data.project.storage} title="Storage" updatedAt={data.project.updatedAt} /></div><details className="storage-admin-details"><summary>Database 資料表詳細資訊</summary><div className="storage-table-list">{data.project.tables.map((table) => <div className="storage-table-row" key={table.name}><span>{table.name}</span><strong>{formatBytes(table.totalBytes)}</strong></div>)}</div></details></>}
    <div className="storage-account-heading"><div><h3>使用者配額</h3><small>每頁最多 20 個帳號</small></div><form onSubmit={submit}><input aria-label="搜尋帳號或 Email" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋帳號或 Email" value={query} /><button className="secondary-button compact" type="submit">搜尋</button></form></div>
    {loading && !data ? <p>正在讀取管理員資料…</p> : <div className="storage-account-list">{data?.accounts.users.map((account) => <article key={account.userId}><div><strong>{account.displayName || account.email.split("@")[0]}</strong><small>{account.email}</small></div><span>Database <b>{formatBytes(account.capacity.databaseUsedBytes)} / {formatBytes(account.capacity.databaseQuotaBytes)}</b></span><span>Storage <b>{formatBytes(account.capacity.storageUsedBytes)} / {formatBytes(account.capacity.storageQuotaBytes)}</b></span></article>)}</div>}
    <div className="storage-pagination"><button className="secondary-button compact" disabled={loading || page <= 1} onClick={() => void load(page - 1, query.trim())} type="button">上一頁</button><span>{page} / {pages}</span><button className="secondary-button compact" disabled={loading || page >= pages} onClick={() => void load(page + 1, query.trim())} type="button">下一頁</button></div>
  </section>;
}

export function StorageUsageWorkspace() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = useCallback(async (manual = false) => {
    setUpdating(true);
    try {
      const response = await fetch("/api/system/storage-usage", { cache: "no-store" });
      const next = await response.json() as Usage & { error?: string };
      if (!response.ok && !next.database && !next.storage) throw new Error(next.error ?? "目前無法取得儲存空間資訊。");
      setUsage(next);
      if (manual) setNotice("✓ 儲存空間資訊已更新");
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : "目前無法取得儲存空間資訊。"); }
    finally { setLoading(false); setUpdating(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(null), 3000); return () => window.clearTimeout(timer); }, [notice]);

  return <div className="storage-usage-workspace">
    <header className="page-heading storage-page-heading"><div><p className="eyebrow">MY STORAGE</p><h1>儲存空間</h1><p>只顯示這個帳號所擁有的資料與檔案容量。</p></div><button className="secondary-button storage-refresh" disabled={updating} onClick={() => void refresh(true)} type="button">{updating ? "↻ 更新中" : "↻ 更新"}</button></header>
    {notice && <p className={notice.startsWith("✓") ? "notice success" : "notice error"} role="status">{notice}</p>}
    {loading && !usage ? <div className="storage-skeletons"><div /><div /></div> : <>
      <section className="storage-capacity-grid"><CapacityCard error={usage?.errors.database} quota={usage?.database ?? null} title="Database" updatedAt={usage?.updatedAt} /><CapacityCard error={usage?.errors.storage} quota={usage?.storage ?? null} title="Storage" updatedAt={usage?.updatedAt} /></section>
      {usage?.storageGroups?.length ? <section className="storage-breakdown"><header><div><p className="eyebrow">MY FILES</p><h2>Storage 使用組成</h2></div></header><ul>{usage.storageGroups.map((group) => <li key={group.category}><i /><span>{storageLabels[group.category] ?? group.category}</span><strong>{formatBytes(group.usedBytes)}</strong><small>{usage.storage?.usedBytes ? `${((group.usedBytes / usage.storage.usedBytes) * 100).toFixed(1)}%` : "0%"}</small></li>)}</ul></section> : null}
      <p className="storage-disclaimer">Database 使用量以 PostgreSQL 中此帳號擁有的資料列實際大小計算；Storage 使用量依此帳號路徑下的檔案 metadata 計算。</p>
      {usage?.isAdmin && <AdminPanel />}
    </>}
  </div>;
}

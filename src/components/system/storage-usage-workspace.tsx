"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { formatBytes } from "@/lib/format-bytes";

type Status = "healthy" | "growing" | "high" | "critical" | "exceeded";
type Quota = { usedBytes: number; limitBytes: number; remainingBytes: number; overageBytes: number; usagePercent: number; status: Status };
type StorageGroup = { category: string; usedBytes: number };
type TableUsage = { name: string; group: "system" | "personal"; dataBytes: number; indexBytes: number; otherBytes: number; totalBytes: number };
type Usage = { scope: "self"; isAdmin: boolean; database: Quota | null; databaseGroups: StorageGroup[]; storage: Quota | null; storageGroups: StorageGroup[]; errors: { database?: string; storage?: string }; updatedAt: string };
type AccountUsage = { userId: string; email: string; displayName: string | null; capacity: { databaseUsedBytes: number; databaseQuotaBytes: number; storageUsedBytes: number; storageQuotaBytes: number } };
type AdminUsage = { project: { database: Quota | null; storage: Quota | null; tables: TableUsage[]; databaseGroups: StorageGroup[]; storageGroups: StorageGroup[]; errors: Record<string, string>; updatedAt: string }; accounts: { total: number; users: AccountUsage[] }; page: number };

const storageLabels: Record<string, string> = { photos: "照片", files: "一般檔案", "content-covers": "內容封面", "workspace-backgrounds": "工作區背景", avatars: "個人頭像" };
const databaseLabels: Record<string, string> = { bookmarks: "網站收藏", notes: "筆記與想法", code: "程式碼", files: "檔案資料", photos: "照片資料", anime: "動漫收藏", vocabulary: "單字學習", vault: "私密保管庫", calendar: "日曆", organization: "資料夾與類別", account: "帳號與安全", other: "其他資料" };
const systemDatabaseLabels: Record<string, string> = { "system-data": "系統資料", "user-data": "用戶資料", indexes: "Index 與資料庫開銷", "auth-metadata-other": "Auth、Metadata 與其他" };
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

function UsageBreakdown({ groups, labels, quotaBytes, title }: { groups: StorageGroup[]; labels: Record<string, string>; quotaBytes: number; title: string }) {
  return <div className="storage-resource-breakdown"><h3>{title}</h3>{groups.length ? <ul>{groups.map((group) => <li key={group.category}><i /><span>{labels[group.category] ?? group.category}</span><strong>{formatBytes(group.usedBytes)}</strong><small>{quotaBytes ? `${((group.usedBytes / quotaBytes) * 100).toFixed(1)}% 配額` : "0% 配額"}</small></li>)}</ul> : <p>目前沒有可分類的使用量。</p>}</div>;
}

function ResourcePanel({ title, quota, groups, labels, error, updatedAt }: { title: "Database" | "Storage"; quota: Quota | null; groups: StorageGroup[]; labels: Record<string, string>; error?: string; updatedAt?: string }) {
  return <section className="storage-resource-panel"><CapacityCard error={error} quota={quota} title={title} updatedAt={updatedAt} />{quota && <UsageBreakdown groups={groups} labels={labels} quotaBytes={quota.limitBytes} title="使用明細" />}</section>;
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
    <header><div><p className="eyebrow">SYSTEM OVERVIEW</p><h2>系統儲存空間</h2><p>先顯示整理後的系統分類；技術明細與個別帳號配額可視需要展開。</p></div></header>
    {error && <p className="notice error" role="alert">{error}</p>}
    {data?.project && <><div className="storage-system-grid"><ResourcePanel groups={data.project.databaseGroups} labels={systemDatabaseLabels} quota={data.project.database} title="Database" updatedAt={data.project.updatedAt} /><ResourcePanel groups={data.project.storageGroups} labels={storageLabels} quota={data.project.storage} title="Storage" updatedAt={data.project.updatedAt} /></div><details className="storage-admin-details"><summary>查看 Database 資料表技術明細</summary><div className="storage-table-list">{data.project.tables.map((table) => <div className="storage-table-row" key={table.name}><span>{table.name}</span><strong>{formatBytes(table.totalBytes)}</strong></div>)}</div></details></>}
    <details className="storage-admin-details"><summary>查看個別帳號配額</summary><div className="storage-account-heading"><div><h3>使用者配額</h3><small>每頁最多 20 個帳號</small></div><form onSubmit={submit}><input aria-label="搜尋帳號或 Email" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋帳號或 Email" value={query} /><button className="secondary-button compact" type="submit">搜尋</button></form></div>{loading && !data ? <p>正在讀取管理員資料…</p> : <div className="storage-account-list">{data?.accounts.users.map((account) => <article key={account.userId}><div><strong>{account.displayName || account.email.split("@")[0]}</strong><small>{account.email}</small></div><span>Database <b>{formatBytes(account.capacity.databaseUsedBytes)} / {formatBytes(account.capacity.databaseQuotaBytes)}</b></span><span>Storage <b>{formatBytes(account.capacity.storageUsedBytes)} / {formatBytes(account.capacity.storageQuotaBytes)}</b></span></article>)}</div>}<div className="storage-pagination"><button className="secondary-button compact" disabled={loading || page <= 1} onClick={() => void load(page - 1, query.trim())} type="button">上一頁</button><span>{page} / {pages}</span><button className="secondary-button compact" disabled={loading || page >= pages} onClick={() => void load(page + 1, query.trim())} type="button">下一頁</button></div></details>
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
    <header className="page-heading storage-page-heading"><div><p className="eyebrow">MY STORAGE</p><h1>儲存空間</h1><p>先查看我的使用量；管理員可在下方另外查看整個系統。</p></div><button className="secondary-button storage-refresh" disabled={updating} onClick={() => void refresh(true)} type="button">{updating ? "↻ 更新中" : "↻ 更新"}</button></header>
    {notice && <p className={notice.startsWith("✓") ? "notice success" : "notice error"} role="status">{notice}</p>}
    {loading && !usage ? <div className="storage-skeletons"><div /><div /></div> : <>
      <section className="storage-section-heading"><p className="eyebrow">MY USAGE</p><h2>我的使用量</h2></section>
      <section className="storage-capacity-grid storage-personal-grid"><ResourcePanel error={usage?.errors.database} groups={usage?.databaseGroups ?? []} labels={databaseLabels} quota={usage?.database ?? null} title="Database" updatedAt={usage?.updatedAt} /><ResourcePanel error={usage?.errors.storage} groups={usage?.storageGroups ?? []} labels={storageLabels} quota={usage?.storage ?? null} title="Storage" updatedAt={usage?.updatedAt} /></section>
      <p className="storage-disclaimer">Database 使用量以 PostgreSQL 中此帳號擁有的資料列實際大小計算；Storage 使用量依此帳號路徑下的檔案 metadata 計算。</p>
      {usage?.isAdmin && <AdminPanel />}
    </>}
  </div>;
}

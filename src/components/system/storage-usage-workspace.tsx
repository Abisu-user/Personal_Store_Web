"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useState } from "react";

import { formatBytes, usagePercentage } from "@/lib/format-bytes";
import { QuotaAccount, QuotaEditorDialog } from "@/components/system/quota-editor-dialog";

type Status = "healthy" | "growing" | "high" | "critical" | "exceeded";
type Quota = { usedBytes: number; limitBytes: number; remainingBytes: number; overageBytes: number; usagePercent: number; status: Status };
type StorageGroup = { category: string; usedBytes: number };
type TableUsage = { name: string; group: "system" | "personal"; dataBytes: number; indexBytes: number; otherBytes: number; totalBytes: number };
type Usage = { scope: "self"; isAdmin: boolean; database: Quota | null; databaseGroups: StorageGroup[]; storage: Quota | null; storageGroups: StorageGroup[]; errors: { database?: string; storage?: string }; updatedAt: string };
type AccountUsage = QuotaAccount & { username?: string | null };
type AdminUsage = { project: { database: Quota | null; storage: Quota | null; tables: TableUsage[]; databaseGroups: StorageGroup[]; storageGroups: StorageGroup[]; errors: Record<string, string>; updatedAt: string }; accounts: { total: number; users: AccountUsage[] }; page: number };

const storageLabels: Record<string, string> = { photos: "照片", files: "一般檔案", "content-covers": "內容封面", "workspace-backgrounds": "工作區背景", avatars: "個人頭像" };
const databaseLabels: Record<string, string> = { bookmarks: "網站收藏", notes: "筆記與想法", code: "程式碼", files: "檔案資料", photos: "照片資料", anime: "動漫收藏", vocabulary: "單字學習", vault: "私密保管庫", calendar: "日曆", organization: "資料夾與類別", account: "帳號與安全", other: "其他資料" };
const systemDatabaseLabels: Record<string, string> = { "system-data": "系統資料", "user-data": "用戶資料", indexes: "Index 與資料庫開銷", "auth-metadata-other": "Auth、Metadata 與其他" };
const statusCopy: Record<Status, string> = { healthy: "容量充足", growing: "使用量增加", high: "儲存空間即將用完", critical: "儲存空間即將用完", exceeded: "已超出限額" };
const databaseColors: Record<string, string> = { bookmarks: "#2f67c7", notes: "#7958c7", code: "#1688a8", files: "#2d966f", photos: "#cf5d91", anime: "#e36a32", vocabulary: "#d79b19", vault: "#c44855", calendar: "#248f91", organization: "#60718f", account: "#5568b8", other: "#8b96a8", "system-data": "#2f67c7", "user-data": "#7958c7", indexes: "#d69132", "auth-metadata-other": "#7d899c" };
const storageColors: Record<string, string> = { photos: "#d35491", files: "#3274cf", "content-covers": "#e07a32", "workspace-backgrounds": "#21938e", avatars: "#7958c7", other: "#8390a5" };

function groupColor(resource: "Database" | "Storage", category: string, index: number) {
  const colors = resource === "Database" ? databaseColors : storageColors;
  const fallback = resource === "Database" ? ["#2f67c7", "#7958c7", "#1688a8", "#d69132"] : ["#3274cf", "#d35491", "#e07a32", "#21938e"];
  return colors[category] ?? fallback[index % fallback.length];
}

function Progress({ quota, groups, resource }: { quota: Quota; groups: StorageGroup[]; resource: "Database" | "Storage" }) {
  const total = groups.reduce((sum, group) => sum + group.usedBytes, 0);
  return <div aria-label={`已使用 ${quota.usagePercent.toFixed(1)}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.min(quota.usagePercent, 100)} className={`storage-progress ${quota.status}`} role="progressbar">{total > 0 ? <div className="storage-progress-segments" style={{ width: `${Math.min(100, Math.max(0, quota.usagePercent))}%` }}>{groups.filter((group) => group.usedBytes > 0).map((group, index) => <i key={group.category} style={{ backgroundColor: groupColor(resource, group.category, index), flexGrow: group.usedBytes } as CSSProperties} />)}</div> : <span style={{ width: `${Math.min(100, Math.max(0, quota.usagePercent))}%` }} />}</div>;
}

function CapacityCard({ title, quota, groups, error, updatedAt }: { title: "Database" | "Storage"; quota: Quota | null; groups: StorageGroup[]; error?: string; updatedAt?: string }) {
  if (!quota) return <article className="storage-capacity-card storage-capacity-error"><p className="eyebrow">{title.toUpperCase()}</p><h2>{title}</h2><p>{error || "目前無法取得容量。"}</p></article>;
  const warning = quota.usagePercent >= 80;
  return <article className="storage-capacity-card">
    <div className="storage-card-heading"><p className="eyebrow">{title.toUpperCase()}</p><span className={`storage-status ${quota.status}`}>{warning ? "!" : "✓"} {statusCopy[quota.status]}</span></div>
    <h2>{title}</h2>
    <strong className="storage-capacity-value">{formatBytes(quota.usedBytes)} <small>/ {formatBytes(quota.limitBytes)}</small></strong>
    <Progress groups={groups} quota={quota} resource={title} />
    <div className="storage-capacity-metrics"><span><strong>{quota.usagePercent.toFixed(1)}%</strong> 已使用</span><span><strong>{formatBytes(quota.remainingBytes)}</strong> 剩餘</span></div>
    {warning && <p className="storage-quota-warning">{title === "Database" ? "資料庫容量" : "檔案儲存空間"}即將用完，請整理不需要的資料。</p>}
    <small className="storage-updated">統計時間：{updatedAt ? new Date(updatedAt).toLocaleString("zh-TW") : "—"}</small>
  </article>;
}

function UsageBreakdown({ groups, labels, quotaBytes, resource, title }: { groups: StorageGroup[]; labels: Record<string, string>; quotaBytes: number; resource: "Database" | "Storage"; title: string }) {
  return <div className="storage-resource-breakdown"><h3>{title}</h3>{groups.length ? <ul>{groups.map((group, index) => <li key={group.category}><i style={{ backgroundColor: groupColor(resource, group.category, index) }} /><span>{labels[group.category] ?? group.category}</span><strong>{formatBytes(group.usedBytes)}</strong><small>{quotaBytes ? `${((group.usedBytes / quotaBytes) * 100).toFixed(1)}% 配額` : "0% 配額"}</small></li>)}</ul> : <p>目前沒有可分類的使用量。</p>}</div>;
}

function ResourcePanel({ title, quota, groups, labels, error, updatedAt }: { title: "Database" | "Storage"; quota: Quota | null; groups: StorageGroup[]; labels: Record<string, string>; error?: string; updatedAt?: string }) {
  return <section className="storage-resource-panel"><CapacityCard error={error} groups={groups} quota={quota} title={title} updatedAt={updatedAt} />{quota && <UsageBreakdown groups={groups} labels={labels} quotaBytes={quota.limitBytes} resource={title} title="使用明細" />}</section>;
}

function AccountQuotaMetric({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percentage = usagePercentage(used, limit);
  const state = percentage >= 100 ? "容量已滿" : percentage >= 95 ? "嚴重警告" : percentage >= 90 ? "警告" : percentage >= 80 ? "提醒" : "正常";
  return <div className="storage-account-metric"><span><strong>{label}</strong><b>{formatBytes(used)} / {formatBytes(limit)}</b></span><div className={`quota-mini-progress ${percentage >= 95 ? "critical" : percentage >= 90 ? "warning" : percentage >= 80 ? "notice" : "normal"}`}><i style={{ width: `${Math.min(100, percentage)}%` }} /></div><small>{percentage.toFixed(1)}% · {state}</small></div>;
}

function AdminPanel({ initialPage = 1 }: { initialPage?: number }) {
  const [data, setData] = useState<AdminUsage | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(initialPage);
  const [filter, setFilter] = useState("all");
  const [selectedAccount, setSelectedAccount] = useState<AccountUsage | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (nextPage: number, q: string, nextFilter: string) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/system/storage-usage/admin?page=${nextPage}&q=${encodeURIComponent(q)}&filter=${encodeURIComponent(nextFilter)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "目前無法取得管理員統計。");
      setData(result); setPage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "目前無法取得管理員統計。"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(initialPage, "", "all"), 0);
    return () => window.clearTimeout(timer);
  }, [initialPage, load]);
  function submit(event: FormEvent) { event.preventDefault(); void load(1, query.trim(), filter); }
  function saved(account: QuotaAccount) {
    setData((current) => current ? { ...current, accounts: { ...current.accounts, users: current.accounts.users.map((item) => item.userId === account.userId ? { ...item, ...account } : item) } } : current);
    setNotice("✓ 配額設定已更新");
    window.setTimeout(() => setNotice(null), 3000);
  }
  const pages = Math.max(1, Math.ceil((data?.accounts.total ?? 0) / 20));
  return <section className="storage-admin-panel">
    <header><div><p className="eyebrow">SYSTEM OVERVIEW</p><h2>系統儲存空間</h2><p>先顯示整理後的系統分類；技術明細與個別帳號配額可視需要展開。</p></div></header>
    {error && <p className="notice error" role="alert">{error}</p>}
    {notice && <p className="notice success" role="status">{notice}</p>}
    {data?.project && <><div className="storage-system-grid"><ResourcePanel error={data.project.errors.database} groups={data.project.databaseGroups} labels={systemDatabaseLabels} quota={data.project.database} title="Database" updatedAt={data.project.updatedAt} /><ResourcePanel error={data.project.errors.storage} groups={data.project.storageGroups} labels={storageLabels} quota={data.project.storage} title="Storage" updatedAt={data.project.updatedAt} /></div><details className="storage-admin-details"><summary>查看 Database 資料表技術明細</summary><div className="storage-table-list">{data.project.tables.map((table) => <div className="storage-table-row" key={table.name}><span>{table.name}</span><strong>{formatBytes(table.totalBytes)}</strong></div>)}</div></details></>}
    <details className="storage-admin-details"><summary>查看個別帳號配額</summary><div className="storage-account-heading"><div><h3>使用者配額</h3><small>每頁最多 20 個帳號，管理員自己的配額也可調整。</small></div><form onSubmit={submit}><input aria-label="搜尋帳號或 Email" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋 Email 或使用者名稱" value={query} /><select aria-label="篩選帳號" onChange={(event) => { const value = event.target.value; setFilter(value); void load(1, query.trim(), value); }} value={filter}><option value="all">全部</option><option value="user">一般使用者</option><option value="admin">管理員</option><option value="database-near">Database 接近滿額</option><option value="storage-near">Storage 接近滿額</option><option value="full">容量已滿</option></select><button className="secondary-button compact" type="submit">搜尋</button></form></div>{loading && !data ? <p>正在讀取管理員資料…</p> : <div className="storage-account-list">{data?.accounts.users.map((account) => <article key={account.userId}><div className="storage-account-identity"><strong>{account.displayName || account.username || account.email.split("@")[0]}</strong><small>{account.email}</small><em>{account.role === "admin" ? "管理員" : "一般使用者"}</em></div><AccountQuotaMetric label="Database" limit={account.capacity.databaseQuotaBytes} used={account.capacity.databaseUsedBytes} /><AccountQuotaMetric label="Storage" limit={account.capacity.storageQuotaBytes} used={account.capacity.storageUsedBytes} /><button className="secondary-button compact" onClick={() => setSelectedAccount(account)} type="button">調整</button></article>)}</div>}<div className="storage-pagination"><button className="secondary-button compact" disabled={loading || page <= 1} onClick={() => void load(page - 1, query.trim(), filter)} type="button">上一頁</button><span>{page} / {pages}</span><button className="secondary-button compact" disabled={loading || page >= pages} onClick={() => void load(page + 1, query.trim(), filter)} type="button">下一頁</button></div></details>
    <QuotaEditorDialog account={selectedAccount} onClose={() => setSelectedAccount(null)} onSaved={saved} />
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

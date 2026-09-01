"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "healthy" | "growing" | "high" | "critical" | "exceeded";
type Quota = { usedBytes: number; limitBytes: number; remainingBytes: number; overageBytes: number; usagePercent: number; status: Status };
type TableUsage = { name: string; group: "system" | "personal"; dataBytes: number; indexBytes: number; otherBytes: number; totalBytes: number };
type StorageGroup = { category: string; usedBytes: number };
type Usage = {
  database: (Quota & { composition: { systemBytes: number; personalBytes: number; indexAndOtherBytes: number } }) | null;
  storage: Quota | null;
  tables: TableUsage[];
  storageGroups: StorageGroup[];
  errors: { database?: string; storage?: string };
  updatedAt: string;
};

const CACHE_KEY = "personal-vault:storage-usage:v1";
const storageLabels: Record<string, string> = { photos: "照片", files: "一般檔案", "content-covers": "內容封面", "workspace-backgrounds": "工作區背景", avatars: "個人頭像" };
const statusCopy: Record<Status, { label: string; detail: string }> = {
  healthy: { label: "容量充足", detail: "目前使用量在安全範圍內。" },
  growing: { label: "使用量增加", detail: "建議持續留意容量變化。" },
  high: { label: "容量偏高", detail: "建議檢查大型資料表或檔案。" },
  critical: { label: "即將不足", detail: "繼續新增資料可能影響正常寫入。" },
  exceeded: { label: "已超出限額", detail: "請釋放空間或調整方案限額。" },
};

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const number = value / 1024 ** index;
  return `${number >= 100 || index === 0 ? Math.round(number) : number.toFixed(number >= 10 ? 1 : 2)} ${units[index]}`;
}

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 15) return "剛剛";
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} 小時前` : new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function Progress({ value, status }: { value: number; status: Status }) {
  return <div aria-label={`已使用 ${value.toFixed(1)}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={Math.min(value, 100)} className={`storage-progress ${status}`} role="progressbar"><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function CapacityCard({ title, quota, error, updating, updatedAt, children }: { title: "Database" | "Storage"; quota: Quota | null; error?: string; updating: boolean; updatedAt?: string; children?: React.ReactNode }) {
  if (!quota) return <article className="storage-capacity-card storage-capacity-error"><p className="eyebrow">{title.toUpperCase()}</p><h2>{title}</h2><p>{error || `目前無法取得${title === "Database" ? "資料庫" : "檔案"}容量。`}</p><small>{updating ? "正在重新嘗試…" : "可按右上角更新後再試一次。"}</small></article>;
  const state = statusCopy[quota.status];
  return <article className="storage-capacity-card">
    <div className="storage-card-heading"><p className="eyebrow">{title.toUpperCase()}</p><span className={`storage-status ${quota.status}`}>{quota.status === "healthy" ? "✓" : "!"} {state.label}</span></div>
    <h2>{title}</h2>
    <strong className="storage-capacity-value">{formatBytes(quota.usedBytes)} <small>/ {formatBytes(quota.limitBytes)}</small></strong>
    <Progress status={quota.status} value={quota.usagePercent} />
    <div className="storage-capacity-metrics"><span><strong>{quota.usagePercent.toFixed(1)}%</strong> 已使用</span><span><strong>{quota.overageBytes ? `超出 ${formatBytes(quota.overageBytes)}` : formatBytes(quota.remainingBytes)}</strong>{quota.overageBytes ? "" : " 剩餘"}</span></div>
    <p className="storage-status-detail">{state.detail}</p>
    {children}
    <small className="storage-updated">{updating ? "↻ 更新中…" : `最後更新：${updatedAt ? relativeTime(updatedAt) : "—"}`}</small>
  </article>;
}

function Breakdown({ title, items, totalBytes, estimated = false }: { title: string; items: Array<{ label: string; usedBytes: number; color: string }>; totalBytes: number; estimated?: boolean }) {
  const rows = items.filter((item) => item.usedBytes > 0);
  return <section className="storage-breakdown"><header><div><p className="eyebrow">BREAKDOWN</p><h2>{title}</h2></div>{estimated && <span className="storage-estimate">估算使用量</span>}</header>
    {rows.length ? <><div aria-hidden="true" className="storage-segments">{rows.map((item) => <span key={item.label} style={{ backgroundColor: item.color, width: `${totalBytes ? Math.max((item.usedBytes / totalBytes) * 100, 1) : 0}%` }} />)}</div><ul>{rows.map((item) => <li key={item.label}><i style={{ backgroundColor: item.color }} /><span>{item.label}</span><strong>{formatBytes(item.usedBytes)}</strong><small>{totalBytes ? ((item.usedBytes / totalBytes) * 100).toFixed(1) : "0.0"}%</small></li>)}</ul></> : <p className="storage-empty">尚未有可分類的使用量。</p>}
  </section>;
}

export function StorageUsageWorkspace() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showTables, setShowTables] = useState(false);

  const refresh = useCallback(async (manual = false) => {
    setUpdating(true);
    try {
      const response = await fetch("/api/system/storage-usage", { cache: "no-store" });
      const next = await response.json() as Usage;
      if (!response.ok && !next.database && !next.storage) throw new Error("目前無法取得儲存空間資訊。");
      setUsage(next);
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(next));
      if (manual) { setNotice("✓ 儲存空間資訊已更新"); window.setTimeout(() => setNotice(null), 3000); }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "目前無法取得儲存空間資訊。");
    } finally { setLoading(false); setUpdating(false); }
  }, []);

  useEffect(() => {
    try { const cached = sessionStorage.getItem(CACHE_KEY); if (cached) setUsage(JSON.parse(cached) as Usage); } catch { /* Ignore invalid device cache. */ }
    void refresh(false);
  }, [refresh]);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(false); };
    const onStale = () => void refresh(false);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("personal-vault:storage-usage-stale", onStale);
    return () => { document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("personal-vault:storage-usage-stale", onStale); };
  }, [refresh]);

  const databaseBreakdown = useMemo(() => usage?.database ? [
    { label: "系統共用資料", usedBytes: usage.database.composition.systemBytes, color: "#526ccf" },
    { label: "我的個人資料", usedBytes: usage.database.composition.personalBytes, color: "#31a37e" },
    { label: "Index / PostgreSQL 系統開銷", usedBytes: usage.database.composition.indexAndOtherBytes, color: "#a17be1" },
  ] : [], [usage]);
  const storageBreakdown = useMemo(() => (usage?.storageGroups ?? []).map((item, index) => ({ label: storageLabels[item.category] ?? `其他 · ${item.category}`, usedBytes: item.usedBytes, color: ["#2d67c8", "#31a37e", "#a17be1", "#ed9a52", "#d75a81"][index % 5] })), [usage]);

  return <div className="storage-usage-workspace">
    <header className="page-heading storage-page-heading"><div><p className="eyebrow">STORAGE &amp; DATABASE</p><h1>儲存空間</h1><p>查看 Personal Vault 目前資料庫、檔案與系統資料的空間使用情況。</p></div><button className="secondary-button storage-refresh" disabled={updating} onClick={() => void refresh(true)} type="button">{updating ? "↻ 更新中" : "↻ 更新"}</button></header>
    {notice && <p className={notice.startsWith("✓") ? "notice success" : "notice error"} role="status">{notice}</p>}
    {loading && !usage ? <div className="storage-skeletons" aria-label="正在讀取容量資訊"><div /><div /><div /><div /></div> : <>
      <section className="storage-capacity-grid"><CapacityCard error={usage?.errors.database} quota={usage?.database ?? null} title="Database" updatedAt={usage?.updatedAt} updating={updating} /><CapacityCard error={usage?.errors.storage} quota={usage?.storage ?? null} title="Storage" updatedAt={usage?.updatedAt} updating={updating} /></section>
      {usage?.database && <Breakdown estimated items={databaseBreakdown} title="Database 使用組成" totalBytes={usage.database.usedBytes} />}
      {usage?.storage && <Breakdown items={storageBreakdown} title="Storage 使用組成" totalBytes={usage.storage.usedBytes} />}
      <section className="storage-details"><div><p className="eyebrow">DATABASE DETAILS</p><h2>最大的資料表</h2><p>依實際 PostgreSQL relation size 排序；不會顯示任何資料內容。</p></div><button aria-expanded={showTables} className="secondary-button compact" onClick={() => setShowTables((value) => !value)} type="button">{showTables ? "收合詳細資料" : "查看詳細資料"}</button>{showTables && <div className="storage-table-list"><div className="storage-table-header"><span>資料表</span><span>資料</span><span>Index</span><span>其他</span><span>總共</span></div>{usage?.tables.map((table, index) => <div className="storage-table-row" key={table.name}><span><b>{index + 1}</b>{table.name}<small>{table.group === "system" ? "系統共用" : "個人資料估算"}</small></span><span>{formatBytes(table.dataBytes)}</span><span>{formatBytes(table.indexBytes)}</span><span>{formatBytes(table.otherBytes)}</span><strong>{formatBytes(table.totalBytes)}</strong></div>)}{!usage?.tables.length && <p className="storage-empty">目前無法讀取資料表明細。</p>}</div>}</section>
      <p className="storage-disclaimer">資料庫總容量與 Storage object size 均由 Supabase 即時查詢。個人資料使用量以資料表架構分組估算；共享資料表無法精確拆分到單一使用者。</p>
    </>}
  </div>;
}

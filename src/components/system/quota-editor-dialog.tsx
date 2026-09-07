"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { ModalDialog } from "@/components/ui/modal-dialog";
import { formatBytes, usagePercentage } from "@/lib/format-bytes";
import { parseQuotaInput, quotaInitialValue, QuotaUnit } from "@/lib/system/quota-values";

type Capacity = { databaseUsedBytes: number; databaseQuotaBytes: number; storageUsedBytes: number; storageQuotaBytes: number; quotaUpdatedAt: string | null };
export type QuotaAccount = { userId: string; email: string; username?: string | null; displayName: string | null; role: "user" | "admin"; capacity: Capacity };
type PoolAllocation = { userId: string; email: string; label: string; role: "user" | "admin"; limitBytes: number };
type PoolResource = { totalBytes: number; allocatedBytes: number; remainingBytes: number; availableForTargetBytes: number; maximumForTargetBytes: number; allocations: PoolAllocation[] };
type Detail = QuotaAccount & { maximums: { databaseBytes: number; storageBytes: number }; quotaPool: { database: PoolResource; storage: PoolResource }; systemLimits: { databaseBytes: number; storageBytes: number } };

const allocationColors = ["#2f67c7", "#7958c7", "#1688a8", "#d69132", "#cf5d91", "#2d966f", "#e36a32", "#5568b8", "#c44855", "#248f91"];

function UsageLine({ label, used, limit }: { label: string; used: number; limit: number }) {
  const percentage = usagePercentage(used, limit);
  const status = percentage >= 100 ? "容量已滿" : percentage >= 95 ? "嚴重警告" : percentage >= 90 ? "警告" : percentage >= 80 ? "提醒" : "正常";
  return <div className="quota-current-usage"><div><strong>{label}</strong><span>{formatBytes(used)} / {formatBytes(limit)}</span></div><div className={`quota-mini-progress ${percentage >= 95 ? "critical" : percentage >= 90 ? "warning" : percentage >= 80 ? "notice" : "normal"}`}><i style={{ width: `${Math.min(100, percentage)}%` }} /></div><small>{percentage.toFixed(1)}% · {status}</small></div>;
}

function QuotaPoolPanel({ label, pool, targetUserId }: { label: "Database" | "Storage"; pool: PoolResource; targetUserId: string }) {
  const overAllocated = pool.allocatedBytes > pool.totalBytes;
  return <article className={`quota-pool-card${overAllocated ? " is-over" : ""}`}>
    <header><strong>{label}</strong><span>系統總容量 {formatBytes(pool.totalBytes)}</span></header>
    <div aria-label={`${label} 已分配 ${formatBytes(pool.allocatedBytes)}，系統總容量 ${formatBytes(pool.totalBytes)}`} className="quota-pool-bar" role="img">
      {pool.allocations.filter((allocation) => allocation.limitBytes > 0).map((allocation, index) => <i key={allocation.userId} style={{ backgroundColor: allocationColors[index % allocationColors.length], flexBasis: `${pool.totalBytes > 0 ? (allocation.limitBytes / pool.totalBytes) * 100 : 0}%` }} />)}
    </div>
    <div className="quota-pool-totals"><span>已分配 <b>{formatBytes(pool.allocatedBytes)}</b></span><span>{overAllocated ? "超額分配" : "尚未分配"} <b>{formatBytes(overAllocated ? pool.allocatedBytes - pool.totalBytes : pool.remainingBytes)}</b></span></div>
    <ul className="quota-pool-legend">{pool.allocations.map((allocation, index) => <li className={allocation.userId === targetUserId ? "is-target" : undefined} key={allocation.userId}><i style={{ backgroundColor: allocationColors[index % allocationColors.length] }} /><span>{allocation.label}{allocation.userId === targetUserId ? "（目前帳號）" : ""}</span><strong>{formatBytes(allocation.limitBytes)}</strong></li>)}</ul>
    <p>此帳號目前最多可配額 <strong>{formatBytes(pool.maximumForTargetBytes)}</strong></p>
  </article>;
}

export function QuotaEditorDialog({ account, onClose, onSaved }: { account: QuotaAccount | null; onClose: () => void; onSaved: (account: QuotaAccount) => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [databaseValue, setDatabaseValue] = useState("");
  const [databaseUnit, setDatabaseUnit] = useState<QuotaUnit>("MB");
  const [storageValue, setStorageValue] = useState("");
  const [storageUnit, setStorageUnit] = useState<QuotaUnit>("MB");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmingReduction, setConfirmingReduction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (resetInputs = true) => {
    if (!account) return;
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/system/storage-usage/admin/${account.userId}/quota`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "無法取得最新配額資訊。");
      const next = result as Detail;
      setDetail(next);
      if (resetInputs) {
        const database = quotaInitialValue(next.capacity.databaseQuotaBytes); const storage = quotaInitialValue(next.capacity.storageQuotaBytes);
        setDatabaseValue(database.value); setDatabaseUnit(database.unit); setStorageValue(storage.value); setStorageUnit(storage.unit);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法取得最新配額資訊。"); }
    finally { setLoading(false); }
  }, [account]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDetail(null);
      if (account) void load(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [account, load]);

  const values = useMemo(() => ({ database: parseQuotaInput(databaseValue, databaseUnit), storage: parseQuotaInput(storageValue, storageUnit) }), [databaseUnit, databaseValue, storageUnit, storageValue]);
  const validation = useMemo(() => {
    if (!databaseValue) return "請輸入 Database 容量上限。";
    if (!storageValue) return "請輸入 Storage 容量上限。";
    if (!values.database || !values.storage) return "容量上限必須是大於 0 的有效數字。";
    if (detail && values.database > detail.maximums.databaseBytes) return `Database 已超過最大值 ${formatBytes(detail.maximums.databaseBytes)}。`;
    if (detail && values.storage > detail.maximums.storageBytes) return `Storage 已超過最大值 ${formatBytes(detail.maximums.storageBytes)}。`;
    if (detail && values.database < detail.capacity.databaseUsedBytes) return `Database 上限不可低於目前已使用容量 ${formatBytes(detail.capacity.databaseUsedBytes)}。`;
    if (detail && values.storage < detail.capacity.storageUsedBytes) return `Storage 上限不可低於目前已使用容量 ${formatBytes(detail.capacity.storageUsedBytes)}。`;
    return null;
  }, [databaseValue, detail, storageValue, values]);

  const warnings = useMemo(() => {
    if (!detail || !values.database || !values.storage) return [];
    const result: string[] = [];
    for (const [label, used, limit] of [["Database", detail.capacity.databaseUsedBytes, values.database], ["Storage", detail.capacity.storageUsedBytes, values.storage]] as const) {
      const percent = usagePercentage(used, limit);
      if (percent >= 90) result.push(`設定後此帳號 ${label} 使用率將達 ${percent.toFixed(1)}%，剩餘空間較少。`);
    }
    if (values.storage > detail.systemLimits.storageBytes) result.push("此 Storage 配額高於目前系統容量；帳號配額不代表系統具有相同實體空間。");
    if (values.database > detail.systemLimits.databaseBytes) result.push("此 Database 配額高於目前系統容量；帳號配額不代表系統具有相同實體空間。");
    return result;
  }, [detail, values]);

  async function save() {
    if (!account || !detail || validation || !values.database || !values.storage || pending) return;
    setPending(true); setError(null);
    try {
      const response = await fetch(`/api/system/storage-usage/admin/${account.userId}/quota`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ databaseLimitBytes: values.database, storageLimitBytes: values.storage, expectedUpdatedAt: detail.capacity.quotaUpdatedAt }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (["QUOTA_CONFLICT", "QUOTA_BELOW_USAGE", "SYSTEM_QUOTA_POOL_EXCEEDED"].includes(result.code)) await load(false);
        throw new Error(result.error ?? "配額更新失敗，請稍後再試。");
      }
      onSaved(result as QuotaAccount); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "配額更新失敗，請稍後再試。"); }
    finally { setPending(false); setConfirmingReduction(false); }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!detail || validation || !values.database || !values.storage) return;
    if (values.database < detail.capacity.databaseQuotaBytes || values.storage < detail.capacity.storageQuotaBytes) { setConfirmingReduction(true); return; }
    void save();
  }

  return <ModalDialog className="quota-editor-dialog" eyebrow="ADMIN QUOTA" onClose={() => !pending && onClose()} open={Boolean(account)} pending={pending} title="調整帳號配額">
    {loading && !detail ? <div className="quota-editor-loading"><p>正在取得最新使用量與配額…</p></div> : !detail ? <div className="quota-editor-loading"><p className="notice error">{error ?? "無法取得最新配額資訊。"}</p><button className="secondary-button compact" onClick={() => void load(true)} type="button">重新載入</button></div> : <form className="quota-editor-form" onSubmit={submit}>
      <div className="quota-account-summary"><strong>{detail.displayName || detail.username || detail.email}</strong><span>{detail.email}</span><small>{detail.role === "admin" ? "管理員" : "一般使用者"}</small></div>
      <section className="quota-pool-overview"><div><h3>系統配額分配</h3><p>系統總容量由所有帳號共同分配；不同顏色代表不同帳號的配額。</p></div><div className="quota-pool-grid"><QuotaPoolPanel label="Database" pool={detail.quotaPool.database} targetUserId={detail.userId} /><QuotaPoolPanel label="Storage" pool={detail.quotaPool.storage} targetUserId={detail.userId} /></div></section>
      <section><h3>此帳號實際使用量</h3><UsageLine label="Database" limit={detail.capacity.databaseQuotaBytes} used={detail.capacity.databaseUsedBytes} /><UsageLine label="Storage" limit={detail.capacity.storageQuotaBytes} used={detail.capacity.storageUsedBytes} /></section>
      <div className="quota-limit-fields"><label>Database 上限<div><input disabled={pending} inputMode="decimal" onChange={(event) => { setDatabaseValue(event.target.value); setConfirmingReduction(false); }} value={databaseValue} /><select disabled={pending} onChange={(event) => setDatabaseUnit(event.target.value as QuotaUnit)} value={databaseUnit}><option>MB</option><option>GB</option></select></div><small>目前可配額上限 {formatBytes(detail.maximums.databaseBytes)}</small></label><label>Storage 上限<div><input disabled={pending} inputMode="decimal" onChange={(event) => { setStorageValue(event.target.value); setConfirmingReduction(false); }} value={storageValue} /><select disabled={pending} onChange={(event) => setStorageUnit(event.target.value as QuotaUnit)} value={storageUnit}><option>MB</option><option>GB</option></select></div><small>目前可配額上限 {formatBytes(detail.maximums.storageBytes)}</small></label></div>
      {validation && <p className="notice error" role="alert">{validation}</p>}
      {warnings.map((warning) => <p className="notice quota-warning" key={warning}>⚠ {warning}</p>)}
      {error && <p className="notice error" role="alert">{error}</p>}
      {confirmingReduction && <div className="quota-reduction-confirm"><strong>你正在降低此使用者的配額</strong><p>Database：{formatBytes(detail.capacity.databaseQuotaBytes)} → {formatBytes(values.database ?? 0)}<br />Storage：{formatBytes(detail.capacity.storageQuotaBytes)} → {formatBytes(values.storage ?? 0)}</p><div className="dialog-actions"><button className="secondary-button compact" onClick={() => setConfirmingReduction(false)} type="button">返回修改</button><button className="delete-button compact" disabled={pending} onClick={() => void save()} type="button">{pending ? "儲存中…" : "確定降低配額"}</button></div></div>}
      {!confirmingReduction && <div className="dialog-actions"><button className="secondary-button compact" disabled={pending} onClick={onClose} type="button">取消</button><button className="button compact" disabled={pending || Boolean(validation)} type="submit">{pending ? "儲存中…" : "儲存變更"}</button></div>}
    </form>}
  </ModalDialog>;
}

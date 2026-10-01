"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useBackgroundSave } from "@/components/background-save/background-save-provider";
import { AppIcon } from "@/components/ui/app-icon";
import { useGlobalSearch } from "./global-search-provider";
import styles from "./global-header-actions.module.css";

/** The dashboard's actions, shared by every authenticated feature header. */
export function GlobalHeaderActions() {
  const search = useGlobalSearch();
  const queue = useBackgroundSave();
  const statusId = useId();
  const [completedAt, setCompletedAt] = useState(0);
  const latestSaved = queue.jobs.reduce((latest, job) => job.status === "saved" ? Math.max(latest, job.updatedAt) : latest, 0);
  useEffect(() => {
    const remaining = latestSaved + 2500 - Date.now();
    if (remaining <= 0) return;
    const start = window.setTimeout(() => setCompletedAt(latestSaved), 0);
    const end = window.setTimeout(() => setCompletedAt(0), remaining);
    return () => { window.clearTimeout(start); window.clearTimeout(end); };
  }, [latestSaved]);
  const failed = queue.jobs.filter((job) => job.status === "failed").length;
  const offline = queue.jobs.filter((job) => job.status === "offline").length;
  const pending = queue.jobs.filter((job) => ["queued", "saving", "retrying"].includes(job.status)).length;
  const saving = queue.jobs.some((job) => job.status === "saving" || job.status === "retrying");
  const count = failed + offline + pending;
  const tone = failed ? "failed" : offline ? "offline" : saving ? "saving" : pending ? "pending" : completedAt === latestSaved && latestSaved > 0 ? "success" : "idle";
  const status = failed ? `${failed} 筆失敗` : offline ? `${offline} 筆等待連線` : pending ? `${pending} 筆背景處理中` : tone === "success" ? "儲存完成" : "所有變更已同步";
  return <div className={styles.actions} data-global-header-actions>
    <button aria-label="搜尋全部" aria-haspopup="dialog" aria-expanded={search.isOpen} className={styles.button} onClick={search.open} title="搜尋全部" type="button"><AppIcon name="search" /></button>
    <button aria-label="儲存佇列" aria-describedby={statusId} aria-haspopup="dialog" aria-expanded={queue.isOpen} className={styles.button} data-tone={tone} onClick={queue.open} title={`儲存佇列：${status}`} type="button"><AppIcon name="storage" />{saving && <span aria-hidden="true" className={styles.spinner} />}{count > 0 ? <span aria-hidden="true" className={styles.badge}>{count > 99 ? "99+" : count}</span> : tone === "success" ? <i aria-hidden="true" className={styles.success} /> : null}</button>
    <span className="sr-only" id={statusId}>{status}</span>
  </div>;
}

export function PageHeaderActions({ children }: { children?: ReactNode }) {
  return <div className="page-header-actions">{children}<GlobalHeaderActions /></div>;
}

"use client";

import { ReactNode, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatRelativeTime } from "@/lib/feature-home/time";
import styles from "./feature-home.module.css";

export type FeatureHomeSection = "home" | "library";

export function useFeatureHomeSection() {
  const searchParams = useSearchParams();
  const requested = searchParams.get("section");
  const linked = searchParams.has("item") || searchParams.has("folder") || searchParams.has("view");
  const [section, setSection] = useState<FeatureHomeSection>(requested === "library" || linked ? "library" : "home");
  const [routeFolder, setRouteFolder] = useState<string | null>(searchParams.get("folder"));
  useEffect(() => {
    const sync = () => {
      const params = new URLSearchParams(window.location.search);
      setSection(params.get("section") === "library" || params.has("item") || params.has("folder") || params.has("view") ? "library" : "home");
      setRouteFolder(params.get("folder"));
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const changeSection = (next: FeatureHomeSection, options?: { folder?: string | null }) => {
    if (next === section && options?.folder === undefined) return;
    const url = new URL(window.location.href);
    if (next === "home") {
      for (const key of ["section", "folder", "item", "view"]) url.searchParams.delete(key);
    } else {
      url.searchParams.set("section", "library");
      if (options?.folder !== undefined) url.searchParams.set("folder", options.folder ?? "unorganized");
      else url.searchParams.delete("folder");
    }
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setSection(next);
    setRouteFolder(url.searchParams.get("folder"));
  };
  return { section, routeFolder, changeSection };
}

export function FeatureHomeTabs({ section, onChange, libraryLabel }: { section: FeatureHomeSection; onChange: (section: FeatureHomeSection) => void; libraryLabel: string }) {
  return <nav aria-label="功能頁面" className={styles.tabs}>
    <button aria-current={section === "home" ? "page" : undefined} className={section === "home" ? styles.active : ""} onClick={() => onChange("home")} type="button">首頁</button>
    <button aria-current={section === "library" ? "page" : undefined} className={section === "library" ? styles.active : ""} onClick={() => onChange("library")} type="button">{libraryLabel}</button>
  </nav>;
}

export type HomeMetric = { label: string; value: string | number; description: string; onClick?: () => void };
export type HomeActivity = { id: string; label: string; detail?: string; at: string; onClick?: () => void };
export type HomeFolder = { id: string; name: string; count?: number; at?: string | null; onClick: () => void };

export function FeatureHome({ metrics, title, subtitle, children, activities, folders, onShowAll, createAction, emptyLabel, loading = false, activitiesUnavailable = false }: {
  metrics: HomeMetric[]; title: string; subtitle?: string; children: ReactNode;
  activities: HomeActivity[]; folders?: HomeFolder[]; onShowAll: () => void;
  createAction: ReactNode; emptyLabel: string; loading?: boolean; activitiesUnavailable?: boolean;
}) {
  const [now] = useState(() => Date.now());
  return <div className={styles.home}>
    <div aria-label="資料摘要" className={styles.summary}>
      {loading ? Array.from({ length: 4 }, (_, index) => <div className={styles.skeleton} key={index} />) : metrics.map((metric) => {
        const content = <><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.description}</small></>;
        return metric.onClick ? <button className={styles.metric} key={metric.label} onClick={metric.onClick} type="button">{content}</button> : <div className={styles.metric} key={metric.label}>{content}</div>;
      })}
    </div>
    <section className={styles.section}>
      <header className={styles.heading}><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button onClick={onShowAll} type="button">查看全部 <span aria-hidden="true">›</span></button></header>
      {loading ? <div className={styles.skeletonCards}>{Array.from({ length: 4 }, (_, index) => <div className={styles.skeleton} key={index} />)}</div> : children}
    </section>
    <div className={styles.bottom}>
      <section className={styles.panel}><header className={styles.heading}><div><h2>最近動態</h2><p>從現有新增、更新與開啟時間整理</p></div></header>
        {loading ? <div className={styles.skeleton} /> : activitiesUnavailable ? <p className={styles.empty}>最近動態暫時無法載入。</p> : activities.length ? <div className={styles.activities}>{activities.slice(0, 6).map((activity) => {
          const content = <><span className={styles.dot} /><span className={styles.activityCopy}><strong>{activity.label}</strong>{activity.detail && <small>{activity.detail}</small>}</span><time dateTime={activity.at}>{formatRelativeTime(activity.at, now)}</time></>;
          return activity.onClick ? <button className={styles.activity} key={activity.id} onClick={activity.onClick} type="button">{content}</button> : <div className={styles.activity} key={activity.id}>{content}</div>;
        })}</div> : <p className={styles.empty}>目前沒有近期動態。</p>}
      </section>
      {folders && <section className={styles.panel}><header className={styles.heading}><div><h2>資料夾</h2><p>快速進入整理區</p></div><button onClick={onShowAll} type="button">查看全部 <span aria-hidden="true">›</span></button></header>
        {loading ? <div className={styles.skeleton} /> : <div className={styles.folders}>{folders.slice(0, 6).map((folder) => <button className={styles.folder} key={folder.id} onClick={folder.onClick} type="button"><strong>{folder.name}</strong><small>{folder.count === undefined ? "查看資料" : `${folder.count} 筆資料`}{folder.at ? ` · ${formatRelativeTime(folder.at, now)}` : ""}</small></button>)}</div>}
      </section>}
    </div>
    {!loading && metrics[0]?.value === 0 && <div className={styles.emptyState}><strong>{emptyLabel}</strong>{createAction}</div>}
  </div>;
}

export { styles as featureHomeStyles };

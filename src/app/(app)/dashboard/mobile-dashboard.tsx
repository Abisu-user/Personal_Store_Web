"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAppProfile } from "@/components/layout/app-profile-provider";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { MobileSection } from "@/components/ui/mobile-layout";
import type { DashboardData, DashboardKind } from "@/lib/dashboard/types";
import { getDashboardGreeting, millisecondsUntilNextGreetingBoundary } from "@/lib/dashboard/greeting";
import { formatBytes, usagePercentage } from "@/lib/format-bytes";
import { readClientResource, writeClientResource } from "@/lib/pwa/client-resource-cache";
import styles from "./dashboard-mobile.module.css";

const query = "(max-width: 700px)";
const subscribe = (callback: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;
const dashboardCacheKey = "dashboard:summary:v1";
let dashboardRequest: Promise<DashboardData> | null = null;
let dashboardHasEntered = false;

async function requestDashboardSummary() {
  if (dashboardRequest) return dashboardRequest;
  dashboardRequest = (async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("摘要暫時無法載入");
    const summary = await response.json() as DashboardData;
    writeClientResource(dashboardCacheKey, summary, 2 * 60_000);
    return summary;
  })().finally(() => { dashboardRequest = null; });
  return dashboardRequest;
}

/** Desktop never mounts the summary loader or makes its data request. */
export function MobileDashboard({ email }: { email: string }) {
  const mobile = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return mobile ? <DashboardContent email={email} /> : null;
}

const overview: Array<{ kind: DashboardKind; label: string; href: string; icon: AppIconName }> = [
  { kind: "bookmark", label: "網站收藏", href: "/bookmarks", icon: "bookmark" },
  { kind: "anime", label: "動漫", href: "/anime", icon: "anime" },
  { kind: "note", label: "筆記", href: "/notes", icon: "note" },
  { kind: "code", label: "程式碼", href: "/code", icon: "code" },
  { kind: "photo", label: "照片", href: "/photos", icon: "photo" },
  { kind: "file", label: "檔案", href: "/files", icon: "file" },
];

const kindLabels: Record<DashboardKind, string> = { bookmark: "網站收藏", anime: "動漫", note: "筆記", code: "程式碼", photo: "照片", file: "檔案" };
const kindIcons: Record<DashboardKind, AppIconName> = { bookmark: "bookmark", anime: "anime", note: "note", code: "code", photo: "photo", file: "file" };

function relativeDate(value: string) {
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return "剛剛更新";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} 天前` : new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", timeZone: "Asia/Taipei" }).format(new Date(value));
}


function DashboardContent({ email }: { email: string }) {
  const profile = useAppProfile();
  const [firstEntry] = useState(() => {
    if (dashboardHasEntered) return false;
    dashboardHasEntered = true;
    return true;
  });
  const [greeting, setGreeting] = useState(() => getDashboardGreeting());
  const [data, setData] = useState<DashboardData | null>(() => readClientResource<DashboardData>(dashboardCacheKey));
  const [pending, setPending] = useState(() => !readClientResource<DashboardData>(dashboardCacheKey));
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const hasData = useRef(Boolean(data));
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      const now = new Date();
      setGreeting(getDashboardGreeting(now));
      timer = window.setTimeout(schedule, millisecondsUntilNextGreetingBoundary(now));
    };
    const onVisibilityChange = () => { if (document.visibilityState === "visible") schedule(); };
    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, []);
  const load = useCallback(async () => {
    if (!hasData.current) setPending(true);
    setError("");
    try {
      const summary = await requestDashboardSummary();
      if (!mounted.current) return;
      setData(summary);
      hasData.current = true;
      if (Object.values(summary.counts).some(value => value === null) || !summary.capacity || !summary.recentAvailable) setError("部分資料暫時無法更新");
    } catch {
      if (mounted.current) setError(hasData.current ? "部分資料暫時無法更新" : "首頁摘要載入失敗，請重試。");
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    // Dashboard chrome is critical; summary counts and capacity are not. Let
    // the document handoff finish while those widgets revalidate behind it.
    document.documentElement.dataset.dashboardCriticalReady = "true";
    window.dispatchEvent(new Event("personal-vault:dashboard-critical-ready"));
    // A queued start coalesces React Strict Mode's setup/cleanup cycle.
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("personal-vault:item-created", refresh);
    return () => {
      mounted.current = false;
      window.clearTimeout(start);
      window.removeEventListener("personal-vault:item-created", refresh);
    };
  }, [load]);
  const databasePercent = data?.capacity?.databaseUnlimited ? 0 : usagePercentage(data?.capacity?.databaseUsedBytes ?? 0, data?.capacity?.databaseQuotaBytes ?? 0);
  const storagePercent = data?.capacity?.storageUnlimited ? 0 : usagePercentage(data?.capacity?.storageUsedBytes ?? 0, data?.capacity?.storageQuotaBytes ?? 0);
  const today = new Date();
  const todayRecentCount = data?.recent.filter(item => {
    const updated = new Date(item.updatedAt);
    return !Number.isNaN(updated.getTime()) && updated.getFullYear() === today.getFullYear() && updated.getMonth() === today.getMonth() && updated.getDate() === today.getDate();
  }).length ?? 0;
  const todaySummary = pending && !data
    ? "正在整理今天的更新…"
    : todayRecentCount > 0
      ? data?.recentAvailable ? `今天新增／更新了 ${todayRecentCount} 筆資料` : `今天有 ${todayRecentCount} 筆可顯示的更新`
      : data?.recentAvailable ? "今天還沒有新的整理紀錄" : "目前沒有可顯示的新整理紀錄";
  return <div className={styles.mobileDashboard} data-dashboard-mobile="true" data-first-entry={firstEntry ? "true" : undefined} data-first-load={!data ? "true" : undefined} aria-busy={pending}>
      <header className={styles.personalHeader}>
        <div className={styles.headerBackdrop} aria-hidden="true" />
        <div className={styles.headerMain}>
          <div className={styles.headerCopy}><p>PERSONAL DASHBOARD</p><h1>{greeting} <span aria-hidden="true">👋</span></h1><small>{email}</small></div>
          <nav className={styles.headerActions} aria-label="首頁快速導覽">
            <Link aria-label="搜尋" prefetch={false} href="/bookmarks"><AppIcon name="search" /></Link>
            <Link aria-label="外觀與設定" prefetch={false} href="/appearance"><AppIcon name="settings" /></Link>
            <Link aria-label="個人檔案" className={styles.avatarButton} prefetch={false} href="/profile"><span aria-hidden="true">{profile.avatar}</span></Link>
          </nav>
        </div>
        <p className={styles.personalMessage}>把重要的事，一個個收進自己的宇宙 <span aria-hidden="true">✦</span></p>
      </header>

      {error && <div className={styles.loadError} role="status">{error}<button type="button" onClick={() => void load()}>重試</button></div>}
      <MobileSection title="資料概覽">
        <div className={styles.overviewGrid}>{overview.map(item => <Link className={`${styles.overviewCard} mobile-surface`} data-kind={item.kind} href={item.href} key={item.kind} prefetch={false}><span className={styles.iconBox}><AppIcon name={item.icon} /></span>{!data && pending ? <i aria-hidden="true" className={`${styles.valueSkeleton} skeleton-block`} /> : <strong>{data?.counts[item.kind] ?? "—"}</strong>}<small>{item.label}</small></Link>)}</div>
      </MobileSection>

      <MobileSection title="今日小結">
        <a className={`${styles.todaySummary} mobile-surface`} href="#dashboard-recent"><span className={styles.todayIcon}><AppIcon name="calendar" /></span><span><strong>{todaySummary}</strong><small>依可安全顯示的最近新增／更新整理</small></span><b aria-hidden="true">›</b></a>
      </MobileSection>

      <MobileSection title="儲存空間" action={<Link prefetch={false} href="/storage-usage">詳細</Link>}>
        <Link className={`${styles.storageCard} mobile-surface`} href="/storage-usage" prefetch={false}>{data?.capacity ? <><div className={styles.storageRow}><span><AppIcon name="database" />Database</span><strong>{formatBytes(data?.capacity.databaseUsedBytes)} / {data?.capacity.databaseUnlimited ? "無上限" : formatBytes(data?.capacity.databaseQuotaBytes)}</strong></div><i className={styles.progress}><b style={{ width: `${Math.min(100, databasePercent)}%` }} /></i><div className={styles.storageRow}><span><AppIcon name="storage" />Storage</span><strong>{formatBytes(data?.capacity.storageUsedBytes)} / {data?.capacity.storageUnlimited ? "無上限" : formatBytes(data?.capacity.storageQuotaBytes)}</strong></div><i className={styles.progress}><b style={{ width: `${Math.min(100, storagePercent)}%` }} /></i></> : pending ? <div aria-hidden="true" className={styles.storageSkeleton}><i className="skeleton-block" /><i className="skeleton-block" /><i className="skeleton-block" /><i className="skeleton-block" /></div> : <p className={styles.unavailable}>目前無法取得容量，點此重新查看。</p>}</Link>
      </MobileSection>

      <MobileSection title="最近新增／更新" action={data?.recent.length ? <span className={styles.sectionMeta}>最新 {data.recent.length} 筆</span> : undefined}>
        <div className={styles.recentList} id="dashboard-recent">{data?.recent.length ? data.recent.map(item => <Link href={item.href} key={`${item.kind}-${item.id}`} prefetch={false}><span className={styles.recentIcon} data-kind={item.kind}><AppIcon name={kindIcons[item.kind]} /></span><span><strong>{item.title}</strong><small>{kindLabels[item.kind]} · {relativeDate(item.updatedAt)}</small></span><b aria-hidden="true">›</b></Link>) : pending ? <div aria-hidden="true" className={styles.recentSkeleton}>{Array.from({ length: 3 }, (_, index) => <div key={index}><i className="skeleton-block" /><span><b className="skeleton-block" /><b className="skeleton-block" /></span></div>)}</div> : <p className={styles.empty}>{data?.recentUnavailableKinds?.length === overview.length ? "目前無法取得更新紀錄。" : "新增第一筆資料後，最近更新會顯示在這裡。"}</p>}</div>
      </MobileSection>
    </div>;
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CreateItemButton } from "@/components/layout/create-item-provider";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { MobilePageHeader, MobileSection } from "@/components/ui/mobile-layout";
import type { DashboardData, DashboardKind } from "@/lib/dashboard/types";
import { getDashboardGreeting, millisecondsUntilNextGreetingBoundary } from "@/lib/dashboard/greeting";
import { formatBytes, usagePercentage } from "@/lib/format-bytes";
import styles from "./dashboard-mobile.module.css";

const query = "(max-width: 700px)";
const subscribe = (callback: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const snapshot = () => window.matchMedia(query).matches;
const serverSnapshot = () => false;

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
  const [greeting, setGreeting] = useState(() => getDashboardGreeting());
  const [data, setData] = useState<DashboardData | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
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
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    const timeout = window.setTimeout(() => controller.abort("timeout"), 15000);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("摘要暫時無法載入");
      const summary: DashboardData = await response.json();
      if (request.current !== controller) return;
      setData(summary);
      if (Object.values(summary.counts).some(value => value === null) || !summary.capacity || !summary.recentAvailable) setError("部分資料暫時無法更新");
    } catch {
      if (request.current === controller && (!controller.signal.aborted || controller.signal.reason === "timeout")) setError("首頁摘要載入失敗，請重試。");
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) setPending(false);
    }
  }, []);
  useEffect(() => {
    // A queued start coalesces React Strict Mode's setup/cleanup cycle.
    const start = window.setTimeout(() => void load(), 0);
    const refresh = () => void load();
    window.addEventListener("personal-vault:item-created", refresh);
    return () => {
      window.clearTimeout(start);
      request.current?.abort();
      request.current = null;
      window.removeEventListener("personal-vault:item-created", refresh);
    };
  }, [load]);
  const databasePercent = data?.capacity?.databaseUnlimited ? 0 : usagePercentage(data?.capacity?.databaseUsedBytes ?? 0, data?.capacity?.databaseQuotaBytes ?? 0);
  const storagePercent = data?.capacity?.storageUnlimited ? 0 : usagePercentage(data?.capacity?.storageUsedBytes ?? 0, data?.capacity?.storageQuotaBytes ?? 0);
  return <div className={styles.mobileDashboard} aria-busy={pending}>
      <MobilePageHeader eyebrow="PERSONAL DASHBOARD" title={greeting} subtitle={email} actions={<><Link aria-label="搜尋" prefetch={false} href="/bookmarks"><AppIcon name="search" /></Link><Link aria-label="設定" prefetch={false} href="/appearance"><AppIcon name="settings" /></Link></>} />

      {error && <div className={styles.loadError} role="status">{error}<button type="button" onClick={() => void load()}>重試</button></div>}
      <MobileSection title="資料概覽">
        <div className={styles.overviewGrid}>{overview.map(item => <Link className={`${styles.overviewCard} mobile-surface`} href={item.href} key={item.kind} prefetch={false}><span className={styles.iconBox}><AppIcon name={item.icon} /></span><strong>{data?.counts[item.kind] ?? "—"}</strong><small>{item.label}</small></Link>)}</div>
      </MobileSection>

      <MobileSection title="快速操作">
        <div className={`${styles.quickActions} mobile-surface`}><CreateItemButton kind="bookmark" className={styles.quickAction}><AppIcon name="bookmark" /><span>網站</span></CreateItemButton><Link className={styles.quickAction} prefetch={false} href="/anime"><AppIcon name="anime" /><span>動漫</span></Link><CreateItemButton kind="note" className={styles.quickAction}><AppIcon name="note" /><span>筆記</span></CreateItemButton><Link className={styles.quickAction} prefetch={false} href="/vault"><AppIcon name="lock" /><span>保管庫</span></Link></div>
      </MobileSection>

      <MobileSection title="儲存空間" action={<Link prefetch={false} href="/storage-usage">詳細</Link>}>
        <Link className={`${styles.storageCard} mobile-surface`} href="/storage-usage" prefetch={false}>{data?.capacity ? <><div className={styles.storageRow}><span><AppIcon name="database" />Database</span><strong>{formatBytes(data?.capacity.databaseUsedBytes)} / {data?.capacity.databaseUnlimited ? "無上限" : formatBytes(data?.capacity.databaseQuotaBytes)}</strong></div><i className={styles.progress}><b style={{ width: `${Math.min(100, databasePercent)}%` }} /></i><div className={styles.storageRow}><span><AppIcon name="storage" />Storage</span><strong>{formatBytes(data?.capacity.storageUsedBytes)} / {data?.capacity.storageUnlimited ? "無上限" : formatBytes(data?.capacity.storageQuotaBytes)}</strong></div><i className={styles.progress}><b style={{ width: `${Math.min(100, storagePercent)}%` }} /></i></> : <p className={styles.unavailable}>目前無法取得容量，點此重新查看。</p>}</Link>
      </MobileSection>

      <MobileSection title="最近新增／更新">
        <div className={`${styles.recentList} mobile-surface`}>{data?.recent.length ? data.recent.map(item => <Link href={item.href} key={`${item.kind}-${item.id}`} prefetch={false}><span className={styles.recentIcon}><AppIcon name={kindIcons[item.kind]} /></span><span><strong>{item.title}</strong><small>{kindLabels[item.kind]} · {relativeDate(item.updatedAt)}</small></span><b aria-hidden="true">›</b></Link>) : <p className={styles.empty}>{pending ? "正在載入摘要…" : data?.recentUnavailableKinds?.length === overview.length ? "目前無法取得更新紀錄。" : "新增第一筆資料後，最近更新會顯示在這裡。"}</p>}</div>
      </MobileSection>
    </div>;
}

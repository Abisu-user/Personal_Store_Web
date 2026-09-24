"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useBackgroundSave } from "@/components/background-save/background-save-provider";
import { createLabels, useOpenCreate, type CreateKind } from "@/components/layout/create-item-provider";
import { useAppProfile } from "@/components/layout/app-profile-provider";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { getDashboardGreeting, millisecondsUntilNextGreetingBoundary } from "@/lib/dashboard/greeting";
import { formatBytes } from "@/lib/format-bytes";
import type { DashboardKind } from "@/lib/dashboard/types";
import type { DesktopDashboardData, DesktopDashboardItem } from "@/lib/dashboard/desktop-data";
import styles from "./desktop-dashboard.module.css";

const desktopQuery = "(min-width: 701px)";
const subscribe = (listener: () => void) => { const media = matchMedia(desktopQuery); media.addEventListener("change", listener); return () => media.removeEventListener("change", listener); };
const snapshot = () => matchMedia(desktopQuery).matches;
const serverSnapshot = () => false;
const labels: Record<DashboardKind, string> = { bookmark: "網站收藏", note: "筆記", code: "程式碼", photo: "照片", file: "檔案", anime: "動漫收藏" };
const icons: Record<DashboardKind, AppIconName> = { bookmark: "bookmark", note: "note", code: "code", photo: "photo", file: "file", anime: "anime" };
type SearchItem = DesktopDashboardItem;

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  if (elapsed < 60_000) return "剛剛";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分鐘前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小時前`;
  if (elapsed < 7 * 86_400_000) return `${Math.floor(elapsed / 86_400_000)} 天前`;
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(value));
}

export function DesktopDashboard({ email }: { email: string }) {
  const desktop = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return desktop ? <DesktopContent email={email} /> : null;
}

function DesktopContent({ email }: { email: string }) {
  const profile = useAppProfile();
  const queue = useBackgroundSave();
  const openCreate = useOpenCreate();
  const [data, setData] = useState<DesktopDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [greeting, setGreeting] = useState(() => getDashboardGreeting());
  const [today, setToday] = useState("");
  const mounted = useRef(true);
  const lastSavedRefresh = useRef<number | null>(null);
  const latestSavedAt = queue.jobs.reduce<number | null>((latest, job) => job.status === "saved" && (latest === null || job.updatedAt > latest) ? job.updatedAt : latest, null);
  const load = useCallback(async () => {
    try {
      // Never keep old titles on screen while lock state is being rechecked.
      setData(null);
      setLoading(true);
      setError("");
      const response = await fetch("/api/dashboard/desktop", { cache: "no-store", signal: AbortSignal.timeout(18000) });
      if (!response.ok) throw new Error("首頁資料暫時無法載入。");
      const result = await response.json() as DesktopDashboardData;
      if (mounted.current) setData(result);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "首頁資料暫時無法載入。");
    } finally { if (mounted.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => void load());
    const onCreated = () => { window.setTimeout(() => void load(), 700); };
    window.addEventListener("personal-vault:item-created", onCreated);
    return () => { mounted.current = false; window.removeEventListener("personal-vault:item-created", onCreated); };
  }, [load]);
  useEffect(() => {
    if (latestSavedAt === null) return;
    if (lastSavedRefresh.current === null) { lastSavedRefresh.current = latestSavedAt; return; }
    if (latestSavedAt <= lastSavedRefresh.current) return;
    lastSavedRefresh.current = latestSavedAt;
    const timer = window.setTimeout(() => void load(), 300);
    return () => window.clearTimeout(timer);
  }, [latestSavedAt, load]);
  useEffect(() => {
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      const now = new Date();
      setGreeting(getDashboardGreeting(now));
      setToday(new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(now));
      timer = window.setTimeout(update, millisecondsUntilNextGreetingBoundary(now));
    };
    const visible = () => { if (document.visibilityState === "visible") { update(); setSearchOpen(false); void load(); } };
    update(); document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [load]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, []);
  const displayName = profile.displayName?.trim() || profile.username?.trim() || email.split("@")[0] || "你好";
  const capacity = data?.capacity;
  const storage = capacity ? `${formatBytes(capacity.storageUsedBytes)}${capacity.storageUnlimited ? "" : ` / ${formatBytes(capacity.storageQuotaBytes)}`}` : null;
  return <div className={styles.desktopDashboard} data-desktop-dashboard>
    <div className={styles.topbar}><span className={styles.topbarLabel}>PERSONAL STORE · DASHBOARD</span><div className={styles.topActions}>
      <button aria-label="搜尋全部" onClick={() => setSearchOpen(true)} type="button"><AppIcon name="search" /></button>
      <button aria-label="背景儲存佇列" onClick={queue.open} type="button"><AppIcon name="storage" />{queue.jobs.some((job) => ["queued", "saving", "retrying", "failed", "offline"].includes(job.status)) && <i />}</button>
    </div></div>
    <section className={styles.hero}><div className={styles.heroCopy}><p className={styles.eyebrow}>YOUR PERSONAL SPACE</p><h1>{greeting === "晚安" ? "晚上好" : greeting}，{displayName}</h1><p>你的資料都在這裡。快速回到最近使用的內容，或開始新增資料。</p><div className={styles.heroActions}><button className={styles.primaryButton} onClick={() => setQuickOpen(true)} type="button"><AppIcon name="plus" /> 快速新增</button><button className={styles.secondaryButton} onClick={() => setSearchOpen(true)} type="button"><AppIcon name="search" /> 搜尋全部 <kbd>⌘ / Ctrl K</kbd></button></div></div><div className={styles.today}><span className={styles.todayCaption}>今日概覽</span><strong>{today || "今天"}</strong><div><span>安全狀態</span><b>{data?.appLock ? data.appLock.configured && data.appLock.autoLockEnabled ? "App Lock 已啟用" : "App Lock 未啟用" : "—"}</b></div><div><span>最近開啟</span><b>{data ? `${data.recentOpened.length} 筆` : "—"}</b></div>{storage && <div><span>儲存空間</span><b>{storage}</b></div>}</div></section>
    {error && <div className={styles.notice} role="status">{error} <button onClick={() => void load()} type="button">重試</button></div>}
    {data?.unavailable.length ? <p className={styles.partial}>部分來源暫時無法更新；已取得的資料仍可使用。</p> : null}
    <section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>SHORTCUTS</p><h2>常用網站</h2></div><Link href="/bookmarks?manageShortcuts=1" prefetch={false}>管理常用網站 →</Link></div><div className={styles.shortcutList}>{loading && !data ? <p className={styles.empty}>正在載入常用網站…</p> : data?.shortcuts.length ? data.shortcuts.map((item) => <a className={styles.shortcut} href={item.url} key={item.id} rel="noopener noreferrer" target="_blank" title={item.title}><span>{item.imageUrl ? <img alt="" src={item.imageUrl} /> : <AppIcon name="bookmark" />}</span><b>{item.title}</b></a>) : <p className={styles.empty}>尚未指定常用網站，可至網站收藏設定。</p>}</div></section>
    <div className={styles.activityGrid}><section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>PICK UP WHERE YOU LEFT OFF</p><h2>最近開啟</h2></div></div><div className={styles.recentList}>{data?.recentOpened.length ? data.recentOpened.map((item) => <ActivityRow item={item} key={`${item.kind}:${item.id}`} />) : <p className={styles.empty}>{loading ? "正在載入…" : "還沒有最近開啟的資料。"}</p>}</div></section><section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>NEW IN YOUR SPACE</p><h2>最近新增</h2></div></div><div className={styles.addedList}>{data?.recentAdded.length ? data.recentAdded.map((item, index) => <ActivityRow feature={index === 0} item={item} key={`${item.kind}:${item.id}`} />) : <p className={styles.empty}>{loading ? "正在載入…" : "還沒有最近新增的資料。"}</p>}</div></section></div>
    <section className={styles.section}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>ALL YOUR FOLDERS</p><h2>所有資料夾</h2></div><Link href="/organize" prefetch={false}>查看全部 →</Link></div><div className={styles.folderGrid}>{data?.folders.length ? data.folders.map((folder) => <Link className={styles.folder} href={folder.href} key={`${folder.kind}:${folder.id}`} prefetch={false}><span><AppIcon name={folder.locked ? "lock" : "folder"} /></span><strong>{folder.name}</strong><small>{labels[folder.kind]} · {folder.locked ? "已鎖定" : "資料夾"}</small></Link>) : <p className={styles.empty}>{loading ? "正在載入…" : "還沒有資料夾。"}</p>}</div></section>
    <ModalDialog className={styles.dialog} eyebrow="QUICK ADD" onClose={() => setQuickOpen(false)} open={quickOpen} title="快速新增"><div className={styles.quickGrid}>{(Object.entries(createLabels) as [CreateKind, string][]).map(([kind, label]) => <button key={kind} onClick={() => { setQuickOpen(false); openCreate(kind); }} type="button"><AppIcon name={kind === "vocabulary" ? "vocabulary" : icons[kind]} /><span>{label}</span></button>)}</div><p className={styles.quickNote}>動漫與保管庫請在原功能頁新增；保管庫的解鎖金鑰不會帶到首頁。</p></ModalDialog>
    {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
  </div>;
}

function ActivityRow({ item, feature = false }: { item: DesktopDashboardItem; feature?: boolean }) {
  return <Link className={`${styles.activityRow} ${feature ? styles.featured : ""}`} href={item.href} prefetch={false}><span className={styles.itemIcon}><AppIcon name={icons[item.kind]} /></span><span className={styles.itemCopy}><b>{item.title}</b><small>{labels[item.kind]} · {relativeTime(item.at)}</small></span><span aria-hidden="true">›</span></Link>;
}

function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DashboardKind | "all">("all");
  const [items, setItems] = useState<SearchItem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPending(true); setError("");
      try {
        const response = await fetch(`/api/dashboard/desktop?q=${encodeURIComponent(query.trim())}&kind=${kind}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("搜尋暫時無法使用。");
        const value = await response.json() as { items: SearchItem[] };
        setItems(value.items);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "搜尋暫時無法使用。"); }
      finally { if (!controller.signal.aborted) setPending(false); }
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, kind]);
  useEffect(() => { const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape); }, [onClose]);
  return <div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div aria-label="搜尋全部" aria-modal="true" className={`${styles.dialog} ${styles.searchDialog}`} role="dialog"><div className={styles.dialogHead}><div><p className={styles.eyebrow}>SEARCH YOUR SPACE</p><h2>搜尋全部</h2></div><button aria-label="關閉" onClick={onClose} type="button">×</button></div><div className={styles.searchInput}><AppIcon name="search" /><input aria-label="搜尋資料" maxLength={80} onChange={(event) => { setQuery(event.target.value); setItems([]); setPending(false); setError(""); }} placeholder="搜尋標題、名稱或網址…" ref={input} value={query} /></div><div className={styles.filters}>{(["all", "bookmark", "note", "anime", "code", "photo", "file"] as const).map((value) => <button aria-pressed={kind === value} key={value} onClick={() => { setKind(value); setItems([]); setPending(false); }} type="button">{value === "all" ? "全部" : labels[value]}</button>)}</div><div className={styles.searchResults}>{error ? <p className={styles.empty}>{error}</p> : pending ? <p className={styles.empty}>正在搜尋…</p> : items.length ? items.map((item) => <ActivityRow item={item} key={`${item.kind}:${item.id}`} />) : <p className={styles.empty}>{query.trim().length < 2 ? "請輸入至少 2 個字元。" : "沒有可顯示的搜尋結果。鎖定內容不會出現在搜尋中。"}</p>}</div></div></div>;
}

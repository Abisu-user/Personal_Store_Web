"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { useBackgroundSave } from "@/components/background-save/background-save-provider";
import { useMobileModalLayout } from "@/components/ui/mobile-modal-layout";
import { useDialogFocus } from "@/components/ui/use-dialog-focus";
import type { DesktopDashboardItem } from "@/lib/dashboard/desktop-data";
import type { DashboardKind } from "@/lib/dashboard/types";
import styles from "./global-search.module.css";

const SearchContext = createContext<{ isOpen: boolean; open: () => void } | null>(null);
const labels: Record<DashboardKind, string> = { bookmark: "網站收藏", note: "筆記", code: "程式碼", photo: "照片", file: "檔案", anime: "動漫收藏" };
const icons: Record<DashboardKind, AppIconName> = { bookmark: "bookmark", note: "note", code: "code", photo: "photo", file: "file", anime: "anime" };

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [activePath, setActivePath] = useState<string | null>(null);
  const pathname = usePathname();
  const queue = useBackgroundSave();
  const isOpen = activePath !== null && activePath === pathname && !queue.isOpen;
  const close = useCallback(() => setActivePath(null), []);
  const open = useCallback(() => {
    // The app lock retains mounted children. Never open an overlay above it.
    if (!document.querySelector(".app-lock-overlay, [aria-modal='true']")) setActivePath(pathname);
  }, [pathname]);
  useEffect(() => {
    const timer = window.setTimeout(close, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, close]);
  useEffect(() => {
    // A failed background job can open the queue while search is open. Keep a
    // single focus owner rather than stacking two global modal overlays.
    if (!queue.isOpen) return;
    const timer = window.setTimeout(close, 0);
    return () => window.clearTimeout(timer);
  }, [queue.isOpen, close]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); open(); }
    };
    const hidden = () => { if (document.visibilityState !== "visible") close(); };
    document.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", close);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", close); };
  }, [open, close]);
  return <SearchContext.Provider value={{ isOpen, open }}>{children}{isOpen && <GlobalSearch onClose={close} />}</SearchContext.Provider>;
}

export function useGlobalSearch() {
  const value = useContext(SearchContext);
  if (!value) throw new Error("useGlobalSearch 必須在 GlobalSearchProvider 內使用。");
  return value;
}

/** Extracted from the homepage: same endpoint, debounce, filters and privacy. */
function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<DashboardKind | "all">("all");
  const [items, setItems] = useState<DesktopDashboardItem[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  useMobileModalLayout(true);
  useDialogFocus(true, panel, onClose);
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPending(true); setError("");
      try {
        const response = await fetch(`/api/dashboard/desktop?q=${encodeURIComponent(query.trim())}&kind=${kind}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("搜尋暫時無法使用。");
        const value = await response.json() as { items: DesktopDashboardItem[] };
        if (!controller.signal.aborted) setItems(value.items);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "搜尋暫時無法使用。"); }
      finally { if (!controller.signal.aborted) setPending(false); }
    }, 220);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, kind]);
  return createPortal(<div className={styles.overlay} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section aria-label="搜尋全部" aria-modal="true" className={styles.dialog} ref={panel} role="dialog"><div className={styles.dialogHead}><div><p className={styles.eyebrow}>SEARCH YOUR SPACE</p><h2>搜尋全部</h2></div><button aria-label="關閉搜尋" onClick={onClose} type="button">×</button></div><div className={styles.searchInput}><AppIcon name="search" /><input aria-label="搜尋資料" data-dialog-autofocus maxLength={80} onChange={(event) => { setQuery(event.target.value); setItems([]); setPending(false); setError(""); }} placeholder="搜尋標題、名稱或網址…" value={query} /></div><div className={styles.filters}>{(["all", "bookmark", "note", "anime", "code", "photo", "file"] as const).map((value) => <button aria-pressed={kind === value} key={value} onClick={() => { setKind(value); setItems([]); setPending(false); setError(""); }} type="button">{value === "all" ? "全部" : labels[value]}</button>)}</div><div aria-live="polite" className={styles.searchResults}>{error ? <p className={styles.empty}>{error}</p> : pending ? <p className={styles.empty}>正在搜尋…</p> : items.length ? items.map((item) => <Link className={styles.activityRow} href={item.href} key={`${item.kind}:${item.id}`} onClick={onClose} prefetch={false}><span className={styles.itemIcon}><AppIcon name={icons[item.kind]} /></span><span className={styles.itemCopy}><b>{item.title}</b><small>{labels[item.kind]} · {relativeTime(item.at)}</small></span><span aria-hidden="true">›</span></Link>) : <p className={styles.empty}>{query.trim().length < 2 ? "請輸入至少 2 個字元。" : "沒有可顯示的搜尋結果。鎖定內容不會出現在搜尋中。"}</p>}</div></section></div>, document.body);
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - Date.parse(value));
  if (elapsed < 60_000) return "剛剛";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分鐘前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小時前`;
  if (elapsed < 7 * 86_400_000) return `${Math.floor(elapsed / 86_400_000)} 天前`;
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(value));
}

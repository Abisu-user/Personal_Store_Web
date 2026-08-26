"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clearClientResources } from "@/lib/pwa/client-resource-cache";
import { mobileNavigationDefaults, mobileNavigationDestinations, readMobileNavigationPreferences, type MobileNavigationPreferences } from "@/lib/layout/mobile-navigation-preferences";
const moreItems = [["/notes", "□", "筆記"], ["/code", "⌘", "程式碼"], ["/photos", "▧", "照片"], ["/vocabulary", "文", "單字學習"], ["/anime", "◉", "動漫收藏"], ["/vault", "◈", "保管庫"], ["/calendar", "◌", "日曆"], ["/appearance", "◐", "外觀與布局"], ["/security", "⌁", "安全中心"], ["/security/mfa", "◈", "雙因素驗證"], ["/profile", "●", "帳號設定"]] as const;
export function MobileAppNavigation() {
  const pathname = usePathname(); const router = useRouter(); const [moreOpen, setMoreOpen] = useState(false); const [signingOut, setSigningOut] = useState(false); const [pendingPath, setPendingPath] = useState<string | null>(null); const [navigation, setNavigation] = useState<MobileNavigationPreferences>(mobileNavigationDefaults);
  const prefetch = (href: string) => router.prefetch(href); const active = (href: string) => (pendingPath ?? pathname) === href || (href !== "/dashboard" && (pendingPath ?? pathname).startsWith(href));
  useEffect(() => {
    // iOS standalone can report a visual viewport shorter than the actual app canvas.
    // Use the largest stable reading so no white strip appears below the app shell.
    const syncViewport = () => document.documentElement.style.setProperty("--app-visible-height", `${Math.round(Math.max(window.innerHeight, window.visualViewport?.height ?? 0, document.documentElement.clientHeight))}px`);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    return () => { window.removeEventListener("resize", syncViewport); window.visualViewport?.removeEventListener("resize", syncViewport); window.visualViewport?.removeEventListener("scroll", syncViewport); };
  }, []);
  useEffect(() => { setPendingPath(null); }, [pathname]);
  useEffect(() => {
    const syncNavigation = () => setNavigation(readMobileNavigationPreferences());
    syncNavigation();
    window.addEventListener("personal-vault:mobile-navigation", syncNavigation);
    window.addEventListener("storage", syncNavigation);
    return () => { window.removeEventListener("personal-vault:mobile-navigation", syncNavigation); window.removeEventListener("storage", syncNavigation); };
  }, []);
  async function signOut() { setSigningOut(true); clearClientResources(); await createClient().auth.signOut(); router.replace("/login"); router.refresh(); }
  const linkProps = (href: string) => ({
    onMouseEnter: () => prefetch(href),
    onFocus: () => prefetch(href),
    onClick: () => setPendingPath(href),
  });
  const customItems = navigation.items.map((id) => mobileNavigationDestinations.find((item) => item.id === id)).filter((item): item is typeof mobileNavigationDestinations[number] => Boolean(item));
  const beforeCreate = customItems.slice(0, navigation.itemCount === 7 ? 2 : 1); const afterCreate = customItems.slice(beforeCreate.length);
  const renderNavigationItem = (item: typeof mobileNavigationDestinations[number]) => <Link aria-current={active(item.href) ? "page" : undefined} className={active(item.href) ? "active" : ""} href={item.href} key={item.id} {...linkProps(item.href)}><i>{item.icon}</i><span>{item.label}</span></Link>;
  return <><nav aria-label="手機主要導覽" className={`mobile-bottom-nav${navigation.itemCount === 7 ? " has-seven-items" : ""}`} style={{ "--mobile-navigation-count": navigation.itemCount } as React.CSSProperties}><Link aria-current={active("/dashboard") ? "page" : undefined} className={active("/dashboard") ? "active" : ""} href="/dashboard" {...linkProps("/dashboard")}><i>⌂</i><span>首頁</span></Link>{beforeCreate.map(renderNavigationItem)}<Link className={`mobile-create${pendingPath === "/create" ? " active" : ""}`} href="/create" {...linkProps("/create")}><i>＋</i><span>新增</span></Link>{afterCreate.map(renderNavigationItem)}<button aria-expanded={moreOpen} className={moreOpen ? "active" : ""} onClick={() => setMoreOpen(true)} type="button"><i>•••</i><span>更多</span></button></nav>{moreOpen && <div className="mobile-more-layer" role="presentation"><button aria-label="關閉更多選單" className="mobile-more-backdrop" onClick={() => setMoreOpen(false)} type="button" /><section aria-label="更多功能" className="mobile-more-sheet" role="dialog" aria-modal="true"><div className="mobile-sheet-handle" /><header><div><p className="eyebrow">MORE</p><h2>更多功能</h2></div><button aria-label="關閉" onClick={() => setMoreOpen(false)} type="button">×</button></header><nav>{moreItems.map(([href, icon, label]) => <Link className={active(href) ? "active" : ""} href={href} key={href} onClick={() => { setMoreOpen(false); setPendingPath(href); }} onFocus={() => prefetch(href)} onMouseEnter={() => prefetch(href)}><i>{icon}</i>{label}</Link>)}</nav><button className="mobile-sheet-logout" disabled={signingOut} onClick={() => void signOut()} type="button"><i>⇥</i>{signingOut ? "登出中…" : "登出"}</button></section></div>}</>;
}

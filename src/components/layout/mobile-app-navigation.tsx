"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
const moreItems = [["/notes", "□", "筆記"], ["/code", "⌘", "程式碼"], ["/photos", "▧", "照片"], ["/vault", "◈", "保管庫"], ["/calendar", "◌", "日曆"], ["/organize", "☷", "管理類別／資料夾"], ["/appearance", "◐", "外觀與布局"], ["/security", "⌁", "安全中心"], ["/security/mfa", "◈", "雙因素驗證"], ["/profile", "●", "帳號設定"]] as const;
const primaryRoutes = ["/dashboard", "/bookmarks", "/create", "/files", "/notes", "/code", "/photos"];
export function MobileAppNavigation() {
  const pathname = usePathname(); const router = useRouter(); const [moreOpen, setMoreOpen] = useState(false); const [signingOut, setSigningOut] = useState(false);
  const prefetch = (href: string) => router.prefetch(href); const active = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  useEffect(() => {
    primaryRoutes.forEach(prefetch);
    const syncViewport = () => document.documentElement.style.setProperty("--app-visible-height", `${Math.round(window.visualViewport?.height ?? window.innerHeight)}px`);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    return () => { window.removeEventListener("resize", syncViewport); window.visualViewport?.removeEventListener("resize", syncViewport); window.visualViewport?.removeEventListener("scroll", syncViewport); };
  }, []);
  async function signOut() { setSigningOut(true); await createClient().auth.signOut(); router.replace("/login"); router.refresh(); }
  const linkProps = (href: string) => ({ onPointerDown: () => prefetch(href), onTouchStart: () => prefetch(href), onMouseEnter: () => prefetch(href), onFocus: () => prefetch(href) });
  return <><nav aria-label="手機主要導覽" className="mobile-bottom-nav"><Link aria-current={active("/dashboard") ? "page" : undefined} className={active("/dashboard") ? "active" : ""} href="/dashboard" {...linkProps("/dashboard")}><i>⌂</i><span>首頁</span></Link><Link aria-current={active("/bookmarks") ? "page" : undefined} className={active("/bookmarks") ? "active" : ""} href="/bookmarks" {...linkProps("/bookmarks")}><i>◇</i><span>收藏</span></Link><Link className="mobile-create" href="/create" {...linkProps("/create")}><i>＋</i><span>新增</span></Link><Link aria-current={active("/files") ? "page" : undefined} className={active("/files") ? "active" : ""} href="/files" {...linkProps("/files")}><i>▣</i><span>檔案</span></Link><button aria-expanded={moreOpen} className={moreOpen ? "active" : ""} onClick={() => setMoreOpen(true)} type="button"><i>•••</i><span>更多</span></button></nav>{moreOpen && <div className="mobile-more-layer" role="presentation"><button aria-label="關閉更多選單" className="mobile-more-backdrop" onClick={() => setMoreOpen(false)} type="button" /><section aria-label="更多功能" className="mobile-more-sheet" role="dialog" aria-modal="true"><div className="mobile-sheet-handle" /><header><div><p className="eyebrow">MORE</p><h2>更多功能</h2></div><button aria-label="關閉" onClick={() => setMoreOpen(false)} type="button">×</button></header><nav>{moreItems.map(([href, icon, label]) => <Link className={active(href) ? "active" : ""} href={href} key={href} onClick={() => setMoreOpen(false)} {...linkProps(href)}><i>{icon}</i>{label}</Link>)}</nav><button className="mobile-sheet-logout" disabled={signingOut} onClick={() => void signOut()} type="button"><i>⇥</i>{signingOut ? "登出中…" : "登出"}</button></section></div>}</>;
}

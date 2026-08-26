"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ProfileAvatar } from "@/lib/profile/constants";
import { clearClientResources } from "@/lib/pwa/client-resource-cache";
import { createClient } from "@/lib/supabase/client";

const primaryItems = [
  { href: "/dashboard", label: "首頁", icon: "⌂" }, { href: "/bookmarks", label: "收藏與整理", icon: "◇" }, { href: "/notes", label: "筆記", icon: "□" }, { href: "/code", label: "程式碼", icon: "⌘" }, { href: "/files", label: "檔案", icon: "▣" }, { href: "/photos", label: "照片", icon: "▧" }, { href: "/vocabulary", label: "單字學習", icon: "文" }, { href: "/anime", label: "動漫收藏", icon: "◉" }, { href: "/vault", label: "保管庫", icon: "◈" }, { href: "/calendar", label: "日曆", icon: "◌" }, { href: "/organize", label: "管理資料夾", icon: "☷" },
];

export function AppSidebar({ email, displayName, avatar }: { email: string; displayName: string | null; avatar: ProfileAvatar }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const prefetchRoute = (href: string) => { const route = href.split("#", 1)[0]; if (!route || route === pathname) return; router.prefetch(route); };
  const prefetchHandlers = (href: string) => ({ onFocus: () => prefetchRoute(href), onMouseEnter: () => prefetchRoute(href) });
  const closeMenu = () => setMenuOpen(false);
  async function signOut() { setSigningOut(true); clearClientResources(); await createClient().auth.signOut(); closeMenu(); router.replace("/login"); router.refresh(); }
  const navigationLink = (href: string, label: string, icon: string, active: boolean) => <Link className={active ? "nav-item active" : "nav-item"} href={href} key={label} onClick={closeMenu} prefetch {...prefetchHandlers(href)}><i aria-hidden="true">{icon}</i>{label}</Link>;
  const logoutIcon = <svg aria-hidden="true" className="sidebar-sign-out-icon" fill="none" viewBox="0 0 24 24"><path d="M4 3.75h11.5a1.5 1.5 0 0 1 1.5 1.5v13.5a1.5 1.5 0 0 1-1.5 1.5H4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="m15.5 6.2-5.2 2.15a1 1 0 0 0-.62.92v8.1a1 1 0 0 0 1.38.92l4.44-1.84" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /><path d="M20 12h-7m4-3 3 3-3 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /></svg>;

  return <><button aria-controls="app-sidebar" aria-expanded={menuOpen} aria-label="開啟導覽選單" className={`mobile-nav-toggle${menuOpen ? " menu-open" : ""}`} onClick={() => setMenuOpen((current) => !current)} type="button"><span aria-hidden="true">☰</span><span>選單</span></button>{menuOpen && <button aria-label="關閉導覽選單" className="mobile-nav-scrim" onClick={closeMenu} type="button" />}<aside className={`app-sidebar${menuOpen ? " mobile-open" : ""}`} id="app-sidebar"><button aria-label="關閉選單" className="mobile-nav-close" onClick={closeMenu} type="button">×</button><Link className="vault-logo" href="/dashboard" onClick={closeMenu} prefetch {...prefetchHandlers("/dashboard")}><span><img alt="" src="/icon.svg" /></span><div><strong>Personal Vault</strong><small>PRIVATE SPACE</small></div></Link><nav aria-label="主要導覽" className="sidebar-nav"><p>工作空間</p>{primaryItems.map((item) => navigationLink(item.href, item.label, item.icon, pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))))}</nav><nav aria-label="個人化設定" className="sidebar-nav sidebar-preferences"><p>個人化</p>{navigationLink("/appearance", "外觀與布局", "◐", pathname === "/appearance")}</nav><div className="sidebar-bottom"><nav aria-label="安全設定" className="sidebar-nav sidebar-security"><p>安全</p>{navigationLink("/security", "安全中心", "⌁", pathname === "/security")}{navigationLink("/security/mfa", "雙因素驗證", "◈", pathname === "/security/mfa")}</nav><div className="sidebar-account"><Link aria-current={pathname === "/profile" ? "page" : undefined} className="sidebar-profile" href="/profile" onClick={closeMenu} prefetch {...prefetchHandlers("/profile")}><span>{avatar}</span><div><strong>{displayName || email.split("@")[0]}</strong><small>{email}</small></div></Link><button aria-label="登出" className="sidebar-sign-out" disabled={signingOut} onClick={() => void signOut()} title="登出" type="button">{signingOut ? "…" : logoutIcon}</button></div></div></aside></>;
}

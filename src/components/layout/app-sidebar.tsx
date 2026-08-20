"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ProfileAvatar } from "@/lib/profile/constants";

const primaryItems = [
  { href: "/dashboard", label: "首頁", icon: "⌂" },
  { href: "/bookmarks", label: "我的收藏", icon: "◇" },
  { href: "/notes", label: "筆記", icon: "□" },
  { href: "/code", label: "程式碼", icon: "⌘" },
  { href: "/files", label: "檔案", icon: "▣" },
  { href: "/vault", label: "保管庫", icon: "◈" },
  { href: "/calendar", label: "日曆", icon: "◌" },
  { href: "/create", label: "新增資料", icon: "+" },
];

export function AppSidebar({ email, displayName, avatar }: { email: string; displayName: string | null; avatar: ProfileAvatar }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const prefetchRoute = (href: string) => {
    const route = href.split("#", 1)[0];

    if (!route || route === pathname) return;

    router.prefetch(route);
  };

  const prefetchHandlers = (href: string) => ({
    onFocus: () => prefetchRoute(href),
    onMouseEnter: () => prefetchRoute(href),
  });

  const closeMenu = () => setMenuOpen(false);
  const navigationLink = (href: string, label: string, icon: string, active: boolean) => <Link className={active ? "nav-item active" : "nav-item"} href={href} key={label} onClick={closeMenu} prefetch {...prefetchHandlers(href)}><i aria-hidden="true">{icon}</i>{label}</Link>;

  return <><button aria-controls="app-sidebar" aria-expanded={menuOpen} aria-label="開啟導覽選單" className={`mobile-nav-toggle${menuOpen ? " menu-open" : ""}`} onClick={() => setMenuOpen((current) => !current)} type="button"><span aria-hidden="true">☰</span><span>選單</span></button>{menuOpen && <button aria-label="關閉導覽選單" className="mobile-nav-scrim" onClick={closeMenu} type="button" />}<aside className={`app-sidebar${menuOpen ? " mobile-open" : ""}`} id="app-sidebar"><button aria-label="關閉選單" className="mobile-nav-close" onClick={closeMenu} type="button">×</button><Link className="vault-logo" href="/dashboard" onClick={closeMenu} prefetch {...prefetchHandlers("/dashboard")}><span>V</span><div><strong>Personal Vault</strong><small>PRIVATE SPACE</small></div></Link><nav aria-label="主要導覽" className="sidebar-nav"><p>工作空間</p>{primaryItems.map((item) => navigationLink(item.href, item.label, item.icon, pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))))}</nav><nav aria-label="個人化設定" className="sidebar-nav sidebar-preferences"><p>個人化</p>{navigationLink("/appearance", "外觀與布局", "◐", pathname === "/appearance")}</nav><div className="sidebar-bottom"><nav aria-label="安全設定" className="sidebar-nav sidebar-security"><p>安全</p>{navigationLink("/security", "安全中心", "⌁", pathname === "/security")}{navigationLink("/security/mfa", "雙因素驗證", "◈", pathname === "/security/mfa")}</nav><Link aria-current={pathname === "/profile" ? "page" : undefined} className="sidebar-profile" href="/profile" onClick={closeMenu} prefetch {...prefetchHandlers("/profile")}><span>{avatar}</span><div><strong>{displayName || email.split("@")[0]}</strong><small>{email}</small></div></Link></div></aside></>;
}

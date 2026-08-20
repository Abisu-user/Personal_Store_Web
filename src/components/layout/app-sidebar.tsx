"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

  const prefetchRoute = (href: string) => {
    const route = href.split("#", 1)[0];

    if (!route || route === pathname) return;

    router.prefetch(route);
  };

  const prefetchHandlers = (href: string) => ({
    onFocus: () => prefetchRoute(href),
    onMouseEnter: () => prefetchRoute(href),
  });

  return <aside className="app-sidebar"><Link className="vault-logo" href="/dashboard" prefetch {...prefetchHandlers("/dashboard")}><span>V</span><div><strong>Personal Vault</strong><small>PRIVATE SPACE</small></div></Link><nav aria-label="主要導覽" className="sidebar-nav"><p>工作空間</p>{primaryItems.map((item) => { const active = !item.href.includes("#") && (pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))); return <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.label} prefetch {...prefetchHandlers(item.href)}><i aria-hidden="true">{item.icon}</i>{item.label}</Link>; })}</nav><nav aria-label="個人化設定" className="sidebar-nav sidebar-preferences"><p>個人化</p><Link className={pathname === "/appearance" ? "nav-item active" : "nav-item"} href="/appearance" prefetch {...prefetchHandlers("/appearance")}><i aria-hidden="true">◐</i>外觀與布局</Link></nav><nav aria-label="安全設定" className="sidebar-nav sidebar-security"><p>安全</p><Link className={pathname === "/security" ? "nav-item active" : "nav-item"} href="/security" prefetch {...prefetchHandlers("/security")}><i aria-hidden="true">⌁</i>安全中心</Link><Link className={pathname === "/security/mfa" ? "nav-item active" : "nav-item"} href="/security/mfa" prefetch {...prefetchHandlers("/security/mfa")}><i aria-hidden="true">◈</i>雙因素驗證</Link></nav><Link aria-current={pathname === "/profile" ? "page" : undefined} className="sidebar-profile" href="/profile" prefetch {...prefetchHandlers("/profile")}><span>{avatar}</span><div><strong>{displayName || email.split("@")[0]}</strong><small>{email}</small></div></Link></aside>;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const primaryItems = [
  { href: "/dashboard", label: "首頁", icon: "⌂" },
  { href: "/bookmarks", label: "我的收藏", icon: "◇" },
  { href: "/notes", label: "筆記", icon: "□" },
  { href: "/code", label: "程式碼", icon: "⌘" },
  { href: "/bookmarks#new-bookmark", label: "新增資料", icon: "+" },
  { href: "/calendar", label: "日曆", icon: "◌" },
];

export function AppSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return <aside className="app-sidebar"><Link className="vault-logo" href="/dashboard"><span>V</span><div><strong>Personal Vault</strong><small>PRIVATE SPACE</small></div></Link><nav aria-label="主要導覽" className="sidebar-nav"><p>工作空間</p>{primaryItems.map((item) => { const active = !item.href.includes("#") && (pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))); return <Link className={active ? "nav-item active" : "nav-item"} href={item.href} key={item.label}><i aria-hidden="true">{item.icon}</i>{item.label}{item.href === "/calendar" && <em>即將推出</em>}</Link>; })}</nav><nav aria-label="安全設定" className="sidebar-nav sidebar-security"><p>安全</p><Link className={pathname.startsWith("/security") ? "nav-item active" : "nav-item"} href="/security"><i aria-hidden="true">⌁</i>安全中心</Link><Link className={pathname === "/security/mfa" ? "nav-item active" : "nav-item"} href="/security/mfa"><i aria-hidden="true">◈</i>雙因素驗證</Link></nav><div className="sidebar-profile"><span>{email.slice(0, 1).toUpperCase()}</span><div><strong>{email.split("@")[0]}</strong><small>{email}</small></div></div></aside>;
}

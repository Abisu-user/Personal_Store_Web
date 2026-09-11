"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { clearAppearanceIdentity } from "@/lib/appearance/preferences";
import { mobileNavigationDefaults, mobileNavigationDestinations, readMobileNavigationPreferences, type MobileNavigationPreferences } from "@/lib/layout/mobile-navigation-preferences";
import { clearClientResources } from "@/lib/pwa/client-resource-cache";
import { createClient } from "@/lib/supabase/client";
import { useOpenCreate, type CreateKind } from "./create-item-provider";

const moreItems: Array<{ href: string; icon: AppIconName; label: string }> = [
  { href: "/notes", icon: "note", label: "筆記" }, { href: "/code", icon: "code", label: "程式碼" },
  { href: "/photos", icon: "photo", label: "照片" }, { href: "/vocabulary", icon: "vocabulary", label: "單字學習" },
  { href: "/anime", icon: "anime", label: "動漫收藏" }, { href: "/vault", icon: "lock", label: "保管庫" },
  { href: "/calendar", icon: "calendar", label: "日曆" }, { href: "/appearance", icon: "appearance", label: "外觀與布局" },
  { href: "/storage-usage", icon: "storage", label: "儲存空間" }, { href: "/security", icon: "security", label: "安全中心" },
  { href: "/security/mfa", icon: "security", label: "雙因素驗證" }, { href: "/profile", icon: "profile", label: "帳號設定" },
];

export function MobileAppNavigation() {
  const openCreate = useOpenCreate();
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [resolvedPath, setResolvedPath] = useState(pathname);
  const [navigation, setNavigation] = useState<MobileNavigationPreferences>(mobileNavigationDefaults);
  const prefetch = (href: string) => router.prefetch(href);
  const active = (href: string) => (pendingPath ?? pathname) === href || (href !== "/dashboard" && (pendingPath ?? pathname).startsWith(href));

  useEffect(() => {
    const root = document.documentElement;
    const syncViewport = () => {
      const layoutHeight = Math.max(window.innerHeight, root.clientHeight, window.visualViewport?.height ?? 0);
      const viewport = window.visualViewport;
      const interactiveHeight = viewport?.height ?? window.innerHeight;
      const keyboardInset = Math.max(0, layoutHeight - interactiveHeight - (viewport?.offsetTop ?? 0));
      root.style.setProperty("--app-visible-height", `${Math.round(layoutHeight)}px`);
      root.style.setProperty("--app-interactive-height", `${Math.round(interactiveHeight)}px`);
      root.style.setProperty("--mobile-keyboard-inset", `${Math.round(keyboardInset)}px`);
      root.dataset.mobileKeyboard = keyboardInset > 140 ? "open" : "closed";
    };
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      delete root.dataset.mobileKeyboard;
    };
  }, []);

  // Clear the optimistic highlight when navigation resolves, before rendering.
  if (resolvedPath !== pathname) {
    setResolvedPath(pathname);
    setPendingPath(null);
  }
  useEffect(() => {
    const syncNavigation = () => setNavigation(readMobileNavigationPreferences());
    syncNavigation();
    window.addEventListener("personal-vault:mobile-navigation", syncNavigation);
    window.addEventListener("storage", syncNavigation);
    return () => { window.removeEventListener("personal-vault:mobile-navigation", syncNavigation); window.removeEventListener("storage", syncNavigation); };
  }, []);

  async function signOut() {
    setSigningOut(true);
    clearAppearanceIdentity();
    clearClientResources();
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const linkProps = (href: string) => ({ onMouseEnter: () => prefetch(href), onFocus: () => prefetch(href), onClick: () => setPendingPath(href) });
  const customItems = navigation.items.map(id => mobileNavigationDestinations.find(item => item.id === id)).filter((item): item is typeof mobileNavigationDestinations[number] => Boolean(item));
  const beforeCreate = customItems.slice(0, navigation.itemCount === 7 ? 2 : 1);
  const afterCreate = customItems.slice(beforeCreate.length);

  function startCreate() {
    if (["/anime", "/vault", "/calendar"].includes(pathname)) { window.dispatchEvent(new CustomEvent("personal-vault:new-item")); return; }
    const kind = ({ "/bookmarks": "bookmark", "/notes": "note", "/code": "code", "/files": "file", "/photos": "photo", "/vocabulary": "vocabulary" } as Record<string, CreateKind>)[pathname];
    openCreate(kind);
  }

  const renderNavigationItem = (item: typeof mobileNavigationDestinations[number]) => <Link aria-current={active(item.href) ? "page" : undefined} className={active(item.href) ? "active" : ""} href={item.href} key={item.id} prefetch={false} {...linkProps(item.href)}><i><AppIcon name={item.icon as AppIconName} /></i><span>{item.label}</span></Link>;

  return <>
    <nav aria-label="手機主要導覽" className={`mobile-bottom-nav${navigation.itemCount === 7 ? " has-seven-items" : ""}`} style={{ "--mobile-navigation-count": navigation.itemCount } as React.CSSProperties}>
      <Link aria-current={active("/dashboard") ? "page" : undefined} className={active("/dashboard") ? "active" : ""} href="/dashboard" prefetch={false} {...linkProps("/dashboard")}><i><AppIcon name="home" /></i><span>首頁</span></Link>
      {beforeCreate.map(renderNavigationItem)}
      <button aria-label="新增資料" className="mobile-create" onClick={startCreate} type="button"><i><AppIcon name="plus" /></i><span>新增</span></button>
      {afterCreate.map(renderNavigationItem)}
      <button aria-expanded={moreOpen} aria-haspopup="dialog" className={moreOpen ? "active" : ""} onClick={() => setMoreOpen(true)} type="button"><i><AppIcon name="more" /></i><span>更多</span></button>
    </nav>
    {moreOpen && <MobileBottomSheet className="mobile-navigation-sheet" open title="更多功能" eyebrow="MORE" onClose={() => setMoreOpen(false)}><nav>{moreItems.map(item => <Link className={active(item.href) ? "active" : ""} href={item.href} key={item.href} onClick={() => { setMoreOpen(false); setPendingPath(item.href); }} onFocus={() => prefetch(item.href)} onMouseEnter={() => prefetch(item.href)} prefetch={false}><i><AppIcon name={item.icon} /></i>{item.label}</Link>)}</nav><button className="mobile-sheet-logout" disabled={signingOut} onClick={() => void signOut()} type="button"><i><AppIcon name="logout" /></i>{signingOut ? "登出中…" : "登出"}</button></MobileBottomSheet>}
  </>;
}

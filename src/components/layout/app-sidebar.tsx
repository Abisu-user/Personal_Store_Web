"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { clearAppearanceIdentity } from "@/lib/appearance/preferences";
import type { ProfileAvatar } from "@/lib/profile/constants";
import { clearClientResources } from "@/lib/pwa/client-resource-cache";
import { createClient } from "@/lib/supabase/client";

import styles from "./desktop-sidebar.module.css";

type NavigationItem = {
  href: string;
  label: string;
  icon: AppIconName;
};

type NavigationGroup = {
  label: string;
  ariaLabel: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    label: "PERSONAL",
    ariaLabel: "個人工作空間",
    items: [
      { href: "/dashboard", label: "首頁", icon: "home" },
      { href: "/bookmarks", label: "網站收藏", icon: "bookmark" },
      { href: "/notes", label: "筆記", icon: "note" },
      { href: "/photos", label: "照片", icon: "photo" },
      { href: "/files", label: "檔案", icon: "file" },
      { href: "/code", label: "程式碼", icon: "code" },
    ],
  },
  {
    label: "COLLECTIONS",
    ariaLabel: "收藏與工具",
    items: [
      { href: "/anime", label: "動漫收藏", icon: "anime" },
      { href: "/vault", label: "私密保管庫", icon: "lock" },
      { href: "/vocabulary", label: "單字學習", icon: "vocabulary" },
      { href: "/ktv", label: "KTV 點歌收藏", icon: "music" },
      { href: "/calendar", label: "日曆", icon: "calendar" },
    ],
  },
  {
    label: "SYSTEM",
    ariaLabel: "系統設定",
    items: [
      { href: "/appearance", label: "外觀與布局", icon: "appearance" },
      { href: "/storage-usage", label: "儲存空間", icon: "storage" },
      { href: "/security", label: "安全中心", icon: "security" },
      { href: "/security/mfa", label: "雙因素驗證", icon: "settings" },
    ],
  },
];

const navigationItems = navigationGroups.flatMap((group) => group.items);
const createRouteParents: Record<string, string> = {
  bookmark: "/bookmarks",
  note: "/notes",
  code: "/code",
  file: "/files",
  photo: "/photos",
  vocabulary: "/vocabulary",
};

function routeMatches(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function resolveActiveHref(pathname: string) {
  if (pathname.startsWith("/create/")) {
    const type = pathname.split("/")[2] ?? "";
    return createRouteParents[type] ?? null;
  }
  return navigationItems
    .filter((item) => routeMatches(pathname, item.href))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href ?? null;
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts.slice(0, 2).map((part) => Array.from(part)[0]?.toUpperCase()).join("");
}

export function AppSidebar({
  email,
  displayName,
  avatar,
  isExpanded = false,
  isPinned = false,
  onInteract,
  onLogoClick,
  onPinClick,
}: {
  email: string;
  displayName: string | null;
  avatar: ProfileAvatar;
  isExpanded?: boolean;
  isPinned?: boolean;
  onInteract?: () => void;
  onLogoClick?: () => void;
  onPinClick?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const activeHref = useMemo(() => resolveActiveHref(pathname), [pathname]);
  const profileName = displayName?.trim() || email.split("@")[0] || "Personal Store";
  const avatarContent = avatar || initialsFor(profileName);

  function prefetchRoute(href: string) {
    if (href !== pathname) router.prefetch(href);
  }

  async function signOut() {
    setSigningOut(true);
    clearAppearanceIdentity();
    clearClientResources();
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <aside
      aria-label="Personal Store 側邊導覽"
      className={`${styles.sidebar} ${isExpanded ? styles.expanded : ""}`}
      data-expanded={isExpanded}
      data-pinned={isPinned}
      onClickCapture={onInteract}
      onKeyDownCapture={onInteract}
      onPointerDownCapture={onInteract}
      onScrollCapture={onInteract}
    >
      <header className={styles.profile}>
        <button
          aria-expanded={isExpanded}
          aria-label={isPinned ? "側邊欄已固定" : isExpanded ? "收合側邊欄" : "展開側邊欄"}
          className={styles.avatar}
          onClick={onLogoClick}
          title={isPinned ? "側邊欄已固定" : isExpanded ? "收合側邊欄" : "展開側邊欄"}
          type="button"
        >
          {avatarContent}
        </button>
        <Link
          aria-current={pathname === "/profile" ? "page" : undefined}
          aria-hidden={!isExpanded}
          className={styles.profileCopy}
          href="/profile"
          onFocus={() => prefetchRoute("/profile")}
          onMouseEnter={() => prefetchRoute("/profile")}
          prefetch={false}
          tabIndex={isExpanded ? 0 : -1}
        >
          <strong>{profileName}</strong>
          <small>Personal Store</small>
        </Link>
        <button
          aria-hidden={!isExpanded}
          aria-label={isPinned ? "取消固定側邊欄" : "固定展開側邊欄"}
          aria-pressed={isPinned}
          className={styles.pinToggle}
          disabled={!isExpanded}
          onClick={onPinClick}
          tabIndex={isExpanded ? 0 : -1}
          title={isPinned ? "取消固定側邊欄" : "固定側邊欄"}
          type="button"
        >
          <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
            <path d="m15 6-6 6 6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
        </button>
      </header>

      <div className={styles.navigation}>
        {navigationGroups.map((group) => (
          <nav aria-label={group.ariaLabel} className={styles.group} key={group.label}>
            <p className={styles.groupLabel}>{group.label}</p>
            {group.items.map((item) => {
              const active = activeHref === item.href;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={`${styles.navItem} ${active ? styles.active : ""}`}
                  href={item.href}
                  key={item.href}
                  onFocus={() => prefetchRoute(item.href)}
                  onMouseEnter={() => prefetchRoute(item.href)}
                  onPointerDown={() => prefetchRoute(item.href)}
                  prefetch={false}
                  title={item.label}
                >
                  <i aria-hidden="true" className={styles.icon}>
                    <AppIcon name={item.icon} />
                  </i>
                  <span className={styles.label}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        ))}
      </div>

      <footer className={styles.footer}>
        <button
          aria-label="登出"
          className={styles.logout}
          disabled={signingOut}
          onClick={() => void signOut()}
          title="登出"
          type="button"
        >
          <i aria-hidden="true" className={styles.icon}>
            <AppIcon name="logout" />
          </i>
          <span className={styles.label}>{signingOut ? "登出中…" : "登出"}</span>
        </button>
      </footer>
    </aside>
  );
}

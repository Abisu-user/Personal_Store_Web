"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { BackgroundJobIndicator } from "@/components/background-save/background-save-provider";
import { ContextCreateButton } from "@/components/layout/context-create-button";
import { MobileAppNavigation } from "@/components/layout/mobile-app-navigation";
import { AppPageTransition } from "@/components/layout/app-page-transition";
import type { ProfileAvatar } from "@/lib/profile/constants";

import { AppSidebar } from "./app-sidebar";

const SIDEBAR_AUTO_CLOSE_MS = 5000;

export function DesktopAppShell({
  avatar,
  children,
  displayName,
  email,
}: {
  avatar: ProfileAvatar;
  children: ReactNode;
  displayName: string | null;
  email: string;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const sidebarStateRef = useRef({ isExpanded: false, isPinned: false });
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearAutoCloseTimer() {
    if (autoCloseTimerRef.current !== null) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }

  function startAutoCloseTimer() {
    clearAutoCloseTimer();
    if (!sidebarStateRef.current.isExpanded || sidebarStateRef.current.isPinned) return;

    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      if (!sidebarStateRef.current.isExpanded || sidebarStateRef.current.isPinned) return;
      sidebarStateRef.current = { isExpanded: false, isPinned: false };
      setIsExpanded(false);
    }, SIDEBAR_AUTO_CLOSE_MS);
  }

  function changeSidebarState(expanded: boolean, pinned: boolean) {
    sidebarStateRef.current = { isExpanded: expanded, isPinned: pinned };
    setIsExpanded(expanded);
    setIsPinned(pinned);
    if (expanded && !pinned) startAutoCloseTimer();
    else clearAutoCloseTimer();
  }

  function toggleLogo() {
    if (sidebarStateRef.current.isPinned) return;
    changeSidebarState(!sidebarStateRef.current.isExpanded, false);
  }

  function togglePin() {
    if (!sidebarStateRef.current.isExpanded) return;
    changeSidebarState(true, !sidebarStateRef.current.isPinned);
  }

  function onSidebarInteraction() {
    if (sidebarStateRef.current.isExpanded && !sidebarStateRef.current.isPinned) {
      startAutoCloseTimer();
    }
  }

  useEffect(() => () => {
    if (autoCloseTimerRef.current !== null) clearTimeout(autoCloseTimerRef.current);
  }, []);

  return (
    <div
      className="app-shell desktop-app-shell"
      data-sidebar-open={isExpanded}
      data-sidebar-pinned={isPinned}
    >
      <AppSidebar
        avatar={avatar}
        displayName={displayName}
        email={email}
        isExpanded={isExpanded}
        isPinned={isPinned}
        onInteract={onSidebarInteraction}
        onLogoClick={toggleLogo}
        onPinClick={togglePin}
      />
      <div className="app-main desktop-app-main app-main-with-job-status">
        <BackgroundJobIndicator />
        <AppPageTransition>{children}</AppPageTransition>
        <ContextCreateButton />
      </div>
      <MobileAppNavigation />
    </div>
  );
}

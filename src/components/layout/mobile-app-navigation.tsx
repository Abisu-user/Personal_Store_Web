"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { AppIcon, type AppIconName } from "@/components/ui/app-icon";
import { clearAppearanceIdentity, readAppearance } from "@/lib/appearance/preferences";
import { mobileNavigationDefaults, mobileNavigationDestinations, mobileNavigationVisibleSlotKeys, normalizeMobileNavigationPreferences, type MobileNavigationPreferences } from "@/lib/layout/mobile-navigation-preferences";
import { mobileNavigationThemeVariables } from "@/lib/layout/mobile-navigation-theme";
import { clearClientResources } from "@/lib/pwa/client-resource-cache";
import { createClient } from "@/lib/supabase/client";
import { useOpenCreate, type CreateKind } from "./create-item-provider";

type Destination = (typeof mobileNavigationDestinations)[number];
type NavigationItem = {
  id: string;
  label: string;
  icon: AppIconName;
  kind: "route" | "create" | "more";
  href?: string;
  destinationId?: Destination["id"];
};

const holdDurationMs = 300;
const holdMovementThreshold = 12;
const snapDurationMs = 190;
const moreRevealDelayMs = 80;
const moreExitDurationMs = 320;

type NavigationGeometry = {
  centers: number[];
  navLeft: number;
  minCenter: number;
  maxCenter: number;
};

type NavigationPointer = {
  id: number;
  itemIndex: number;
  lastClientX: number;
  startX: number;
  startY: number;
};

type NavigationMotion = "idle" | "scrubbing" | "snapping";

const compactMoreLabels: Partial<Record<Destination["id"], string>> = {
  bookmarks: "網站收藏",
  notes: "備忘錄",
  photos: "相片",
  vocabulary: "單字",
  anime: "動漫收藏",
  ktv: "KTV",
  vault: "保管庫",
  organize: "整理",
  appearance: "外觀",
  storage: "儲存空間",
  security: "安全中心",
  mfa: "雙重驗證",
  profile: "帳號",
};

function routeMatches(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function destinationById(id: Destination["id"]) {
  return mobileNavigationDestinations.find((item) => item.id === id);
}

function haptic(duration: number) {
  try { navigator.vibrate?.(duration); } catch { /* Haptics are an optional enhancement. */ }
}

export function MobileAppNavigation() {
  const openCreate = useOpenCreate();
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreMounted, setMoreMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<{ from: string; target: string } | null>(null);
  const [navigation, setNavigation] = useState<MobileNavigationPreferences>(mobileNavigationDefaults);
  const [motion, setMotion] = useState<NavigationMotion>("idle");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const geometryRef = useRef<NavigationGeometry | null>(null);
  const moreCloseTimerRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const snapTimerRef = useRef<number | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const pointerRef = useRef<NavigationPointer | null>(null);
  const motionRef = useRef<NavigationMotion>("idle");
  const scrubbingRef = useRef(false);
  const previewIndexRef = useRef<number | null>(null);
  const committedIndexRef = useRef(0);
  const measuredOnceRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const currentPath = pendingTransition && pathname === pendingTransition.from ? pendingTransition.target : pathname;

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

  useEffect(() => {
    const syncNavigation = () => setNavigation(readAppearance().mobileNavigation);
    const syncLegacyFixture = (event: Event) => setNavigation(normalizeMobileNavigationPreferences((event as CustomEvent).detail));
    syncNavigation();
    window.addEventListener("personal-vault:appearance", syncNavigation);
    window.addEventListener("personal-vault:appearance-ready", syncNavigation);
    window.addEventListener("personal-vault:mobile-navigation", syncLegacyFixture);
    window.addEventListener("storage", syncNavigation);
    return () => {
      window.removeEventListener("personal-vault:appearance", syncNavigation);
      window.removeEventListener("personal-vault:appearance-ready", syncNavigation);
      window.removeEventListener("personal-vault:mobile-navigation", syncLegacyFixture);
      window.removeEventListener("storage", syncNavigation);
    };
  }, []);

  const slotKeys = useMemo(() => mobileNavigationVisibleSlotKeys(navigation.sideCount), [navigation.sideCount]);
  const visibleCustomIds = useMemo(
    () => [...slotKeys.left, ...slotKeys.right].map((key) => navigation.slots[key]),
    [navigation.slots, slotKeys],
  );
  const items = useMemo<NavigationItem[]>(() => {
    const mapSlot = (key: (typeof slotKeys.left)[number]): NavigationItem | null => {
      const destination = destinationById(navigation.slots[key]);
      return destination ? { ...destination, kind: "route", destinationId: destination.id } : null;
    };
    const left = slotKeys.left.map(mapSlot).filter((item): item is NavigationItem => Boolean(item));
    const right = slotKeys.right.map(mapSlot).filter((item): item is NavigationItem => Boolean(item));
    return [
      { id: "home", href: "/dashboard", icon: "home", label: "首頁", kind: "route" },
      ...left,
      { id: "create", icon: "plus", label: "新增", kind: "create" },
      ...right,
      { id: "more", icon: "more", label: "更多", kind: "more" },
    ];
  }, [navigation.slots, slotKeys]);
  const moreItems = useMemo(
    () => mobileNavigationDestinations.filter((item) => !visibleCustomIds.includes(item.id)),
    [visibleCustomIds],
  );
  const activeIndex = useMemo(() => {
    if (moreOpen) return items.length - 1;
    const matched = items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.kind === "route" && item.href && routeMatches(currentPath, item.href))
      .sort((left, right) => (right.item.href?.length ?? 0) - (left.item.href?.length ?? 0))[0];
    return matched?.index ?? items.length - 1;
  }, [currentPath, items, moreOpen]);
  const visualIndex = previewIndex ?? activeIndex;
  const navigationTheme = useMemo(() => mobileNavigationThemeVariables(navigation), [navigation]);

  const setMotionState = useCallback((nextMotion: NavigationMotion) => {
    motionRef.current = nextMotion;
    setMotion(nextMotion);
    if (navRef.current) navRef.current.dataset.mobileNavMotion = nextMotion === "scrubbing" ? "drag" : nextMotion === "snapping" ? "snap" : "idle";
  }, []);

  const measureNavigation = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return null;
    const navBounds = nav.getBoundingClientRect();
    const centers = Array.from(nav.querySelectorAll<HTMLElement>("[data-mobile-nav-index]"))
      .map((item) => {
        const bounds = item.getBoundingClientRect();
        return bounds.left - navBounds.left + bounds.width / 2;
      });
    if (!centers.length) return null;
    const geometry = {
      centers,
      navLeft: navBounds.left,
      minCenter: centers[0],
      maxCenter: centers[centers.length - 1],
    } satisfies NavigationGeometry;
    geometryRef.current = geometry;
    return geometry;
  }, []);

  const writeBubbleCenter = useCallback((center: number, nextMotion: "drag" | "instant" | "snap") => {
    const nav = navRef.current;
    if (!nav) return;
    nav.dataset.mobileNavMotion = nextMotion;
    nav.style.setProperty("--mobile-nav-active-x", `${center}px`);
  }, []);

  const placeBubbleAtIndex = useCallback((index: number, nextMotion: "instant" | "snap" = "snap") => {
    const geometry = geometryRef.current ?? measureNavigation();
    const center = geometry?.centers[index];
    if (center === undefined) return;
    writeBubbleCenter(center, nextMotion);
  }, [measureNavigation, writeBubbleCenter]);

  const updatePreviewIndex = useCallback((index: number, withHaptic = true) => {
    if (previewIndexRef.current === index) return;
    previewIndexRef.current = index;
    setPreviewIndex(index);
    if (withHaptic) haptic(7);
  }, []);

  const resolvePointerPosition = useCallback((clientX: number) => {
    const geometry = geometryRef.current;
    if (!geometry) return null;
    const localX = clientX - geometry.navLeft;
    const center = Math.min(geometry.maxCenter, Math.max(geometry.minCenter, localX));
    let index = 0;
    let distance = Number.POSITIVE_INFINITY;
    geometry.centers.forEach((itemCenter, itemIndex) => {
      const nextDistance = Math.abs(center - itemCenter);
      if (nextDistance < distance) {
        index = itemIndex;
        distance = nextDistance;
      }
    });
    return { center, index };
  }, []);

  const flushPointerPosition = useCallback((clientX: number) => {
    const resolved = resolvePointerPosition(clientX);
    if (!resolved) return null;
    writeBubbleCenter(resolved.center, "drag");
    updatePreviewIndex(resolved.index);
    return resolved;
  }, [resolvePointerPosition, updatePreviewIndex, writeBubbleCenter]);

  const schedulePointerPosition = useCallback((clientX: number) => {
    if (pointerRef.current) pointerRef.current.lastClientX = clientX;
    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = window.requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const pointer = pointerRef.current;
      if (!pointer || !scrubbingRef.current) return;
      flushPointerPosition(pointer.lastClientX);
    });
  }, [flushPointerPosition]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let frame = 0;
    let active = true;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!active) return;
        const geometry = measureNavigation();
        if (!geometry || motionRef.current === "scrubbing") return;
        const index = previewIndexRef.current ?? committedIndexRef.current;
        const nextMotion = measuredOnceRef.current ? "snap" : "instant";
        measuredOnceRef.current = true;
        placeBubbleAtIndex(index, nextMotion);
      });
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(nav);
    nav.querySelectorAll<HTMLElement>("[data-mobile-nav-index]").forEach((item) => observer?.observe(item));
    window.addEventListener("orientationchange", update);
    document.fonts?.ready.then(update).catch(() => undefined);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("orientationchange", update);
    };
  }, [items.length, measureNavigation, placeBubbleAtIndex]);

  useLayoutEffect(() => {
    committedIndexRef.current = activeIndex;
    if (motionRef.current === "idle" && previewIndexRef.current === null) placeBubbleAtIndex(activeIndex, measuredOnceRef.current ? "snap" : "instant");
  }, [activeIndex, placeBubbleAtIndex]);

  const openMore = useCallback(() => {
    if (moreCloseTimerRef.current !== null) window.clearTimeout(moreCloseTimerRef.current);
    moreCloseTimerRef.current = null;
    setMoreMounted(true);
    setMoreOpen(true);
  }, []);

  const closeMore = useCallback(() => {
    setMoreOpen(false);
    if (moreCloseTimerRef.current !== null) window.clearTimeout(moreCloseTimerRef.current);
    moreCloseTimerRef.current = window.setTimeout(() => {
      setMoreMounted(false);
      moreCloseTimerRef.current = null;
    }, moreExitDurationMs);
  }, []);

  useEffect(() => () => {
    if (moreCloseTimerRef.current !== null) window.clearTimeout(moreCloseTimerRef.current);
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current);
    if (snapTimerRef.current !== null) window.clearTimeout(snapTimerRef.current);
    if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
  }, []);

  const prefetch = useCallback((href: string | undefined) => {
    if (href && href !== pathname) router.prefetch(href);
  }, [pathname, router]);

  const startCreate = useCallback(() => {
    if (["/anime", "/ktv", "/vault", "/calendar"].includes(pathname)) {
      window.dispatchEvent(new CustomEvent("personal-vault:new-item"));
      return;
    }
    const kind = ({ "/bookmarks": "bookmark", "/notes": "note", "/code": "code", "/files": "file", "/photos": "photo", "/vocabulary": "vocabulary" } as Record<string, CreateKind>)[pathname];
    openCreate(kind);
  }, [openCreate, pathname]);

  const runItem = useCallback((item: NavigationItem) => {
    if (item.kind === "create") {
      startCreate();
      return;
    }
    if (item.kind === "more") {
      openMore();
      return;
    }
    if (!item.href) return;
    if (item.href === "/bookmarks" && pathname === "/bookmarks") {
      window.dispatchEvent(new CustomEvent("personal-vault:bookmarks-overview"));
    }
    if (item.href === "/photos" && pathname === "/photos") {
      window.dispatchEvent(new CustomEvent("personal-vault:photos-overview"));
    }
    if (item.href !== pathname) {
      setPendingTransition({ from: pathname, target: item.href });
      router.push(item.href);
    }
  }, [openMore, pathname, router, startCreate]);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const clearSnap = useCallback(() => {
    if (snapTimerRef.current !== null) {
      window.clearTimeout(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  }, []);

  const resetPreview = useCallback(() => {
    previewIndexRef.current = null;
    setPreviewIndex(null);
  }, []);

  const commitIndex = useCallback((index: number) => {
    const item = items[index];
    if (!item) return;
    clearSnap();
    updatePreviewIndex(index, false);
    setMotionState("snapping");
    placeBubbleAtIndex(index, "snap");
    const commitDelay = item.kind === "more" ? moreRevealDelayMs : snapDurationMs;
    snapTimerRef.current = window.setTimeout(() => {
      snapTimerRef.current = null;
      runItem(item);
      resetPreview();
      setMotionState("idle");
      const restingIndex = item.kind === "create" ? committedIndexRef.current : index;
      window.requestAnimationFrame(() => placeBubbleAtIndex(restingIndex, "snap"));
    }, commitDelay);
  }, [clearSnap, items, placeBubbleAtIndex, resetPreview, runItem, setMotionState, updatePreviewIndex]);

  const cancelGesture = useCallback(() => {
    clearHold();
    clearSnap();
    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    const wasScrubbing = scrubbingRef.current;
    scrubbingRef.current = false;
    pointerRef.current = null;
    resetPreview();
    if (!wasScrubbing) {
      setMotionState("idle");
      return;
    }
    suppressClickUntilRef.current = performance.now() + 450;
    setMotionState("snapping");
    placeBubbleAtIndex(committedIndexRef.current, "snap");
    snapTimerRef.current = window.setTimeout(() => {
      snapTimerRef.current = null;
      setMotionState("idle");
    }, snapDurationMs);
  }, [clearHold, clearSnap, placeBubbleAtIndex, resetPreview, setMotionState]);

  const finishScrub = useCallback((clientX: number) => {
    clearHold();
    if (!scrubbingRef.current) {
      pointerRef.current = null;
      return;
    }
    if (pointerFrameRef.current !== null) {
      window.cancelAnimationFrame(pointerFrameRef.current);
      pointerFrameRef.current = null;
    }
    const finalPosition = flushPointerPosition(clientX);
    scrubbingRef.current = false;
    pointerRef.current = null;
    suppressClickUntilRef.current = performance.now() + 450;
    if (finalPosition) commitIndex(finalPosition.index);
    else cancelGesture();
  }, [cancelGesture, clearHold, commitIndex, flushPointerPosition]);

  function handlePointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-mobile-nav-index]");
    if (!button) return;
    const index = Number(button.dataset.mobileNavIndex);
    prefetch(items[index]?.href);
    if (index !== activeIndex) return;
    measureNavigation();
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastClientX: event.clientX,
      itemIndex: index,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is unavailable in some embedded browsers. */ }
    clearHold();
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (!pointerRef.current || pointerRef.current.itemIndex !== activeIndex) return;
      scrubbingRef.current = true;
      updatePreviewIndex(activeIndex, false);
      setMotionState("scrubbing");
      schedulePointerPosition(pointerRef.current.lastClientX);
      haptic(16);
    }, holdDurationMs);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointer.lastClientX = event.clientX;
    if (!scrubbingRef.current) {
      if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > holdMovementThreshold) {
        clearHold();
        pointerRef.current = null;
        suppressClickUntilRef.current = performance.now() + 350;
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Capture may already be released. */ }
      }
      return;
    }
    event.preventDefault();
    schedulePointerPosition(event.clientX);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLElement>) {
    if (pointerRef.current?.id !== event.pointerId) return;
    if (scrubbingRef.current) {
      event.preventDefault();
      finishScrub(event.clientX);
      return;
    }
    clearHold();
    pointerRef.current = null;
  }

  async function signOut() {
    setSigningOut(true);
    clearAppearanceIdentity();
    clearClientResources();
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const navStyle = {
    ...navigationTheme,
    "--mobile-navigation-count": items.length,
    "--mobile-nav-active-x": `calc((100% - 10px) / ${items.length} * ${activeIndex + .5} + 5px)`,
  } as CSSProperties;

  return <>
    <div className="mobile-bottom-nav-wrap">
      <nav
        aria-label="手機主要導覽"
        className={`mobile-bottom-nav${motion === "scrubbing" ? " is-scrubbing" : ""}`}
        data-mobile-nav-count={items.length}
        data-mobile-nav-motion={motion === "scrubbing" ? "drag" : motion === "snapping" ? "snap" : "idle"}
        onContextMenu={(event) => event.preventDefault()}
        onLostPointerCapture={(event) => { if (pointerRef.current?.id === event.pointerId) cancelGesture(); }}
        onPointerCancel={(event) => { if (pointerRef.current?.id === event.pointerId) cancelGesture(); }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={navRef}
        style={navStyle}
      >
        <span aria-hidden="true" className="mobile-nav-active-indicator">
          <span>
            <span className="mobile-nav-indicator-content" key={items[visualIndex]?.id}>
              <i><AppIcon name={items[visualIndex]?.icon ?? "home"} /></i>
              <span>{items[visualIndex]?.label ?? "首頁"}</span>
            </span>
          </span>
        </span>
        {items.map((item, index) => {
          const selected = visualIndex === index;
          return <button
            aria-current={index === activeIndex && item.kind !== "create" ? "page" : undefined}
            aria-expanded={item.kind === "more" ? moreOpen : undefined}
            aria-haspopup={item.kind === "more" ? "dialog" : undefined}
            aria-label={item.kind === "create" ? "新增資料" : item.label}
            className={`mobile-nav-item${selected ? " is-active" : ""}${item.kind === "create" ? " mobile-create" : ""}`}
            data-mobile-nav-index={index}
            key={item.id}
            onClick={() => {
              if (performance.now() < suppressClickUntilRef.current) return;
              commitIndex(index);
            }}
            onFocus={() => prefetch(item.href)}
            onMouseEnter={() => prefetch(item.href)}
            type="button"
          >
            <i aria-hidden="true"><AppIcon name={item.icon} /></i>
            <span>{item.label}</span>
          </button>;
        })}
      </nav>
    </div>
    <div aria-live="polite" className={`mobile-nav-scrub-tip${motion === "scrubbing" ? " show" : ""}`} role="status">左右滑動選擇頁面，放手切換</div>
    {moreMounted && <div className="mobile-navigation-theme-host" style={navigationTheme as CSSProperties}><MobileBottomSheet className={`mobile-navigation-sheet${moreOpen ? " is-open" : " is-closing"}`} open title="更多功能" eyebrow="" onClose={closeMore}><nav className="mobile-navigation-more-grid">{moreItems.map(item => <Link aria-current={routeMatches(pathname, item.href) ? "page" : undefined} className={routeMatches(pathname, item.href) ? "active" : ""} href={item.href} key={item.href} onClick={() => { closeMore(); setPendingTransition({ from: pathname, target: item.href }); }} onFocus={() => prefetch(item.href)} onMouseEnter={() => prefetch(item.href)} prefetch={false}><i><AppIcon name={item.icon} /></i><span>{compactMoreLabels[item.id] ?? item.label}</span></Link>)}</nav><button className="mobile-sheet-logout" disabled={signingOut} onClick={() => void signOut()} type="button"><i><AppIcon name="logout" /></i>{signingOut ? "登出中…" : "登出"}</button></MobileBottomSheet></div>}
  </>;
}

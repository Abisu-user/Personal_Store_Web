"use client";

import { useEffect } from "react";

let activeMobileDialogs = 0;
let previousBodyOverflow = "";
let previousBodyOverscroll = "";
let previousRootOverflow = "";

function isMobileViewport() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function updateVisualViewport() {
  const viewport = window.visualViewport;
  const height = Math.round(viewport?.height ?? window.innerHeight);
  const offsetTop = Math.round(viewport?.offsetTop ?? 0);
  document.documentElement.style.setProperty("--mobile-modal-viewport-height", `${height}px`);
  document.documentElement.style.setProperty("--mobile-modal-viewport-offset", `${offsetTop}px`);
}

/** Keeps every shared dialog above PWA navigation and the iOS keyboard. */
export function useMobileModalLayout(open: boolean) {
  useEffect(() => {
    if (!open || typeof window === "undefined" || !isMobileViewport()) return;
    const root = document.documentElement;
    const body = document.body;
    if (activeMobileDialogs === 0) {
      previousBodyOverflow = body.style.overflow;
      previousBodyOverscroll = body.style.overscrollBehavior;
      previousRootOverflow = root.style.overflow;
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
      root.style.overflow = "hidden";
      root.dataset.mobileModalOpen = "true";
    }
    activeMobileDialogs += 1;
    updateVisualViewport();
    const viewport = window.visualViewport;
    const keepFocusedFieldVisible = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("input, textarea, select, [contenteditable='true']")) return;
      window.requestAnimationFrame(() => target.scrollIntoView({ block: "center", inline: "nearest" }));
    };
    window.addEventListener("resize", updateVisualViewport);
    window.addEventListener("orientationchange", updateVisualViewport);
    viewport?.addEventListener("resize", updateVisualViewport);
    viewport?.addEventListener("scroll", updateVisualViewport);
    document.addEventListener("focusin", keepFocusedFieldVisible);
    return () => {
      window.removeEventListener("resize", updateVisualViewport);
      window.removeEventListener("orientationchange", updateVisualViewport);
      viewport?.removeEventListener("resize", updateVisualViewport);
      viewport?.removeEventListener("scroll", updateVisualViewport);
      document.removeEventListener("focusin", keepFocusedFieldVisible);
      activeMobileDialogs = Math.max(0, activeMobileDialogs - 1);
      if (activeMobileDialogs === 0) {
        body.style.overflow = previousBodyOverflow;
        body.style.overscrollBehavior = previousBodyOverscroll;
        root.style.overflow = previousRootOverflow;
        delete root.dataset.mobileModalOpen;
        root.style.removeProperty("--mobile-modal-viewport-height");
        root.style.removeProperty("--mobile-modal-viewport-offset");
      }
    };
  }, [open]);
}

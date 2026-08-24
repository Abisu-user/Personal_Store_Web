"use client";

import { useEffect } from "react";
import { applyAppearance, hydrateAppearanceImages, migrateAppearanceForCurrentDevice, nextBackground, readAppearance, saveAppearance } from "@/lib/appearance/preferences";

/** Applies the saved device preference and loads background binaries from IndexedDB. */
export function AppearanceProvider() {
  useEffect(() => {
    let timer: number | undefined; let cancelled = false;
    const applySaved = async (rotateForLogin = false) => {
      window.clearInterval(timer); let appearance = readAppearance();
      try { appearance = await hydrateAppearanceImages(appearance); } catch { /* Keep non-image preferences even when browser storage is unavailable. */ }
      if (cancelled) return;
      migrateAppearanceForCurrentDevice(appearance);
      if (rotateForLogin && appearance.backgroundRotation === "login" && appearance.backgroundImages.length > 1) { appearance = nextBackground(appearance); saveAppearance(appearance); } else applyAppearance(appearance);
      if (appearance.backgroundRotation === "interval" && appearance.backgroundImages.length > 1) timer = window.setInterval(() => saveAppearance(nextBackground(readAppearance())), appearance.backgroundRotationMinutes * 60_000);
    };
    void applySaved(true); const onAppearanceChange = () => { void applySaved(); }; window.addEventListener("personal-vault:appearance", onAppearanceChange);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("personal-vault:appearance", onAppearanceChange); };
  }, []);
  return null;
}

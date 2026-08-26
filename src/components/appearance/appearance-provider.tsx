"use client";

import { useEffect } from "react";
import { applyAppearance, hasScopedAppearance, hydrateAppearanceImages, migrateAppearanceForCurrentDevice, nextBackground, readAppearance, readAppearanceBackup, saveAppearance } from "@/lib/appearance/preferences";

/** Applies the saved device preference and loads background binaries from IndexedDB. */
export function AppearanceProvider() {
  useEffect(() => {
    let timer: number | undefined; let cancelled = false;
    const applySaved = async (rotateForLogin = false) => {
      window.clearInterval(timer); let appearance = readAppearance();
      // On iOS PWA, localStorage may briefly be unavailable while the shell is
      // restoring. Prefer the same device's IndexedDB backup in that case.
      if (!hasScopedAppearance()) {
        const backup = await readAppearanceBackup();
        if (backup) appearance = backup;
      }
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

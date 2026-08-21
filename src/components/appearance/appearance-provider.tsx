"use client";

import { useEffect } from "react";
import { applyAppearance, nextBackground, readAppearance, saveAppearance } from "@/lib/appearance/preferences";

/** Applies the saved device preference and rotates only its local background playlist. */
export function AppearanceProvider() {
  useEffect(() => {
    let timer: number | undefined;
    const applySaved = (rotateForLogin = false) => { window.clearInterval(timer); let appearance = readAppearance(); if (rotateForLogin && appearance.backgroundRotation === "login" && appearance.backgroundImages.length > 1) { appearance = nextBackground(appearance); saveAppearance(appearance); } else applyAppearance(appearance); if (appearance.backgroundRotation === "interval" && appearance.backgroundImages.length > 1) timer = window.setInterval(() => saveAppearance(nextBackground(readAppearance())), appearance.backgroundRotationMinutes * 60_000); };
    applySaved(true); const onAppearanceChange = () => applySaved(); window.addEventListener("personal-vault:appearance", onAppearanceChange);
    return () => { window.clearInterval(timer); window.removeEventListener("personal-vault:appearance", onAppearanceChange); };
  }, []);
  return null;
}

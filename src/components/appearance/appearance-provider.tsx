"use client";

import { useEffect } from "react";

import { applyAppearance, clearAppearanceIdentity, loadAccountAppearance, nextBackground, readAppearance, saveAppearance } from "@/lib/appearance/preferences";
import { createClient } from "@/lib/supabase/client";

/** Loads the signed-in account's server preference before showing its background. */
export function AppearanceProvider() {
  useEffect(() => {
    let timer: number | undefined;
    let cancelled = false;
    const rotateBackground = () => { if (!cancelled) saveAppearance(nextBackground(readAppearance())); };
    const resetTimer = (appearance = readAppearance()) => {
      window.clearInterval(timer);
      if (appearance.backgroundRotation === "interval" && appearance.backgroundImages.length > 1) {
        timer = window.setInterval(rotateBackground, appearance.backgroundRotationMinutes * 60_000);
      }
    };
    const load = async (rotateForLogin = false) => {
      window.clearInterval(timer);
      // Keep the last verified account/device appearance while refreshing.
      // Resetting here made route/auth refreshes briefly paint the default.
      let appearance;
      try { appearance = (await loadAccountAppearance()).appearance; } catch { return; }
      if (cancelled) return;
      if (rotateForLogin && appearance.backgroundRotation === "login" && appearance.backgroundImages.length > 1) {
        appearance = nextBackground(appearance);
        saveAppearance(appearance);
      } else applyAppearance(appearance);
      resetTimer(appearance);
    };

    void load(true);
    const onAppearanceChange = () => resetTimer();
    window.addEventListener("personal-vault:appearance", onAppearanceChange);
    const { data: authListener } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") clearAppearanceIdentity();
      if (event === "SIGNED_IN" || event === "USER_UPDATED") window.setTimeout(() => void load(true), 0);
    });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      authListener.subscription.unsubscribe();
      window.removeEventListener("personal-vault:appearance", onAppearanceChange);
    };
  }, []);
  return null;
}

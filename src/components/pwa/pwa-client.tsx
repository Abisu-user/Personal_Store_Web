"use client";

import { useEffect } from "react";

/** Registers only the safe static App Shell cache and exposes network state to CSS. */
export function PwaClient() {
  useEffect(() => {
    const syncNetwork = () => { document.documentElement.dataset.network = navigator.onLine ? "online" : "offline"; };
    syncNetwork();
    window.addEventListener("online", syncNetwork);
    window.addEventListener("offline", syncNetwork);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    return () => { window.removeEventListener("online", syncNetwork); window.removeEventListener("offline", syncNetwork); };
  }, []);

  return null;
}

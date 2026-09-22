"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import styles from "./app-startup.module.css";

type StartupPhase = "initializing" | "exiting" | "complete";

const APPEARANCE_READY_EVENT = "personal-vault:appearance-ready";
const DASHBOARD_READY_EVENT = "personal-vault:dashboard-critical-ready";
const MINIMUM_VISIBLE_MS = 760;
const HANDOFF_MINIMUM_VISIBLE_MS = 140;
const MAXIMUM_WAIT_MS = 6500;
const EXIT_DURATION_MS = 440;
const HANDOFF_EXIT_DURATION_MS = 260;
const SLOW_MESSAGE_MS = 4500;

type StartupWindow = Window & { __PERSONAL_STORE_STARTUP_AT__?: number };

function initialDocumentReady() {
  return Boolean(document.querySelector(".app-shell, .auth-shell, .auth-shell-simple, .landing"));
}

/** Owns the one-time document startup transition without remounting page content. */
export function AppStartupProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const initialPathname = useRef(pathname);
  const [phase, setPhase] = useState<StartupPhase>("initializing");
  const [slow, setSlow] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    const root = document.documentElement;
    const startupWindow = window as StartupWindow;
    startedAt.current = startupWindow.__PERSONAL_STORE_STARTUP_AT__ ?? performance.now();
    root.dataset.startupActive = "true";
    root.dataset.startupState = "initializing";
    const handoff = root.dataset.startupHandoff === "true";
    const minimumVisibleMs = handoff ? HANDOFF_MINIMUM_VISIBLE_MS : MINIMUM_VISIBLE_MS;
    const exitDurationMs = handoff ? HANDOFF_EXIT_DURATION_MS : EXIT_DURATION_MS;

    const mobileDashboard = initialPathname.current === "/dashboard" && window.matchMedia("(max-width: 700px)").matches;
    let appearanceReady = root.dataset.appearanceReady === "true";
    let documentReady = initialDocumentReady();
    let dashboardReady = !mobileDashboard || root.dataset.dashboardCriticalReady === "true";
    let finishing = false;
    let minimumTimer = 0;
    let exitTimer = 0;

    const finish = () => {
      if (finishing) return;
      finishing = true;
      setPhase("exiting");
      root.dataset.startupState = "exiting";
      exitTimer = window.setTimeout(() => {
        setPhase("complete");
        root.dataset.startupState = "complete";
        delete root.dataset.startupActive;
        delete root.dataset.startupHandoff;
        window.sessionStorage.removeItem("personal-store:post-login-handoff:v1");
      }, exitDurationMs);
    };

    const check = (force = false) => {
      if (finishing || (!force && !(appearanceReady && documentReady && dashboardReady))) return;
      const elapsed = performance.now() - startedAt.current;
      window.clearTimeout(minimumTimer);
      minimumTimer = window.setTimeout(finish, Math.max(0, minimumVisibleMs - elapsed));
    };

    const onAppearanceReady = () => { appearanceReady = true; check(); };
    const onDashboardReady = () => { dashboardReady = true; check(); };
    const observeDocument = new MutationObserver(() => {
      if (!documentReady && initialDocumentReady()) {
        documentReady = true;
        observeDocument.disconnect();
        check();
      }
    });

    if (!documentReady) observeDocument.observe(document.body, { childList: true, subtree: true });
    window.addEventListener(APPEARANCE_READY_EVENT, onAppearanceReady);
    window.addEventListener(DASHBOARD_READY_EVENT, onDashboardReady);
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_MESSAGE_MS);
    const maximumTimer = window.setTimeout(() => check(true), MAXIMUM_WAIT_MS);
    check();

    return () => {
      observeDocument.disconnect();
      window.removeEventListener(APPEARANCE_READY_EVENT, onAppearanceReady);
      window.removeEventListener(DASHBOARD_READY_EVENT, onDashboardReady);
      window.clearTimeout(minimumTimer);
      window.clearTimeout(exitTimer);
      window.clearTimeout(slowTimer);
      window.clearTimeout(maximumTimer);
    };
  }, []);

  return <>
    {children}
    {phase !== "complete" && <div aria-hidden="true" className={`${styles.splash} ${phase === "exiting" ? styles.exiting : ""}`}>
      <div className={styles.ambient} />
      <div className={styles.content}>
        <div className={styles.logo}><Image alt="" draggable={false} height={84} priority src="/icon.svg" unoptimized width={84} /></div>
        <strong>Personal Store</strong>
        <span>{slow ? "載入時間稍長，請稍候…" : "正在準備你的空間"}</span>
      </div>
    </div>}
  </>;
}

export { APPEARANCE_READY_EVENT, DASHBOARD_READY_EVENT };

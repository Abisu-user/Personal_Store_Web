"use client";

import { useEffect, useState } from "react";
import styles from "./build-diagnostics.module.css";

const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "unknown";

function assetName(selector: string, attribute: "href" | "src") {
  const element = document.querySelector(selector);
  const value = element?.getAttribute(attribute);
  return value ? new URL(value, location.origin).pathname.split("/").pop() || "未偵測" : "未偵測";
}

export function BuildDiagnostics() {
  const [activeWorker, setActiveWorker] = useState("檢查中…");
  const [serverWorker, setServerWorker] = useState("檢查中…");
  const [assets, setAssets] = useState({ css: "未偵測", js: "未偵測" });
  const [mode, setMode] = useState("Browser");

  useEffect(() => {
    const pageFrame = window.requestAnimationFrame(() => {
      setMode(window.matchMedia("(display-mode: standalone)").matches ? "Standalone PWA" : "Browser");
      setAssets({
        css: assetName('link[rel="stylesheet"][href*="/_next/static/"]', "href"),
        js: assetName('script[src*="/_next/static/"]', "src"),
      });
    });
    void fetch("/sw.js", { cache: "no-store" }).then((response) => {
      setServerWorker(response.ok ? response.headers.get("X-Personal-Vault-SW-Version") || "未提供版本" : `HTTP ${response.status}`);
    }).catch(() => setServerWorker("無法連線"));

    if (!("serviceWorker" in navigator)) return () => window.cancelAnimationFrame(pageFrame);
    let timer: ReturnType<typeof setTimeout> | null = null;
    let port: MessagePort | null = null;
    const inspectWorker = () => {
      if (timer) clearTimeout(timer);
      port?.close();
      const controller = navigator.serviceWorker.controller;
      if (!controller) { setActiveWorker("尚未接管此頁"); return; }
      const channel = new MessageChannel();
      port = channel.port1;
      channel.port1.onmessage = (event: MessageEvent<{ buildId?: string }>) => {
        if (timer) clearTimeout(timer);
        setActiveWorker(event.data?.buildId || "未提供版本");
        channel.port1.close();
      };
      timer = setTimeout(() => { setActiveWorker("舊版 Worker（無版本資訊）"); channel.port1.close(); }, 1600);
      controller.postMessage({ type: "PERSONAL_VAULT_VERSION" }, [channel.port2]);
    };
    const workerFrame = window.requestAnimationFrame(inspectWorker);
    navigator.serviceWorker.addEventListener("controllerchange", inspectWorker);
    return () => {
      window.cancelAnimationFrame(pageFrame);
      window.cancelAnimationFrame(workerFrame);
      navigator.serviceWorker.removeEventListener("controllerchange", inspectWorker);
      if (timer) clearTimeout(timer);
      port?.close();
    };
  }, []);

  return <details className={styles.details}>
    <summary>版本資訊</summary>
    <dl>
      <div><dt>頁面 Build</dt><dd>{buildId}</dd></div>
      <div><dt>執行模式</dt><dd>{mode}</dd></div>
      <div><dt>目前 Worker</dt><dd>{activeWorker}</dd></div>
      <div><dt>伺服器 Worker</dt><dd>{serverWorker}</dd></div>
      <div><dt>CSS Asset</dt><dd>{assets.css}</dd></div>
      <div><dt>JS Asset</dt><dd>{assets.js}</dd></div>
    </dl>
  </details>;
}

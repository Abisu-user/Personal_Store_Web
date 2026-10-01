import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BackgroundSaveProvider, useBackgroundSave } from "@/components/background-save/background-save-provider";
import { GlobalSearchProvider } from "@/components/layout/global-search-provider";
import { GlobalHeaderActions, PageHeaderActions } from "@/components/layout/global-header-actions";
import { MobilePageHeader } from "@/components/ui/mobile-layout";
import { AnimeHeader } from "@/components/anime/anime-header";
import { AppIcon } from "@/components/ui/app-icon";
import calendar from "@/components/calendar/calendar-mobile.module.css";
import anime from "@/components/anime/anime-mobile.module.css";
import dashboard from "@/app/(app)/dashboard/dashboard-mobile.module.css";

function Fixture() {
  const queue = useBackgroundSave();
  const [route, setRoute] = useState("bookmarks");
  const [fail, setFail] = useState(true);
  const [local, setLocal] = useState(false);
  function enqueue(count = 1, failure = false) {
    for (let index = 0; index < count; index++) queue.enqueue({ type: "note", title: "隔離測試工作", persist: false, maxRetries: 0, debounceMs: 400,
      execute: () => new Promise((resolve, reject) => window.setTimeout(() => failure && (window as unknown as { testFail: boolean }).testFail ? reject(new Error("模擬失敗")) : resolve({}), 1200)) });
  }
  useEffect(() => { (window as unknown as { testFail: boolean }).testFail = fail; }, [fail]);
  const plus = <button className="mobile-icon-button" aria-label="新增資料" type="button"><AppIcon name="plus" /></button>;
  const localSearch = <button className="mobile-icon-button" aria-label="頁內搜尋" onClick={() => setLocal(!local)} type="button"><AppIcon name="search" /></button>;
  return <div className="app-main" style={{ padding: 16 }}>
    <div id="controls"><button onClick={() => enqueue()} type="button">加入測試佇列</button><button onClick={() => enqueue(3)} type="button">加入三筆</button><button onClick={() => enqueue(1, true)} type="button">加入失敗</button><button onClick={() => setFail(false)} type="button">允許重試成功</button><button onClick={() => setRoute(route === "bookmarks" ? "calendar" : "bookmarks")} type="button">切換功能頁</button></div>
    <div id="route" key={route}><header className="page-heading"><div><p className="eyebrow">FEATURE</p><h1>{route === "bookmarks" ? "網站收藏" : "私人日曆"}</h1><p>頁面說明</p></div><PageHeaderActions><button className="button" type="button">＋ 新增網站收藏</button></PageHeaderActions></header></div>
    <section id="long-title"><header className="page-heading"><div><h1>很長的私人功能頁面標題與說明</h1></div><PageHeaderActions /></header></section>
    <section id="mobile-library"><MobilePageHeader eyebrow="BOOKMARK LIBRARY" title="全部網站" leading={<button className="mobile-icon-button" aria-label="返回" type="button">‹</button>} actions={<>{localSearch}{plus}</>} /></section>
    <section id="mobile-notes"><MobilePageHeader title="筆記與想法" actions={plus} /></section>
    <section id="anime" className={anime.animePage}><AnimeHeader activeTab="library" adultUnlocked={false} hasAdultAccess onCreate={() => {}} onOpenAdult={() => {}} onSelectTab={() => {}} /><div className="anime-mobile-heading"><h1>動漫收藏</h1><div className={anime.headingActions}>{localSearch}{plus}<GlobalHeaderActions /></div></div></section>
    <section id="calendar"><header className={calendar.hero}><div><p className={calendar.kicker}>CALENDAR</p><h1>私人日曆</h1><p className={calendar.heroDescription}>日曆描述</p></div><div className="page-header-actions"><div className={calendar.stats}><div><strong>2</strong><span>本月行程</span></div><div><strong>3</strong><span>本月放假</span></div></div><GlobalHeaderActions /></div></header></section>
    <section id="mobile-home" className={dashboard.mobileDashboard}><header className={dashboard.personalHeader}><div className={dashboard.headerMain}><div className={dashboard.headerCopy}><p>PERSONAL DASHBOARD</p><h1>下午好 👋</h1><small>fixture@example.com</small></div><nav className={dashboard.headerActions}><a className={dashboard.avatarButton} aria-label="個人檔案">✦</a><GlobalHeaderActions /></nav></div></header></section>
    <output id="local-state">{local ? "頁內搜尋已開啟" : "頁內搜尋未開啟"}</output>
  </div>;
}
createRoot(document.getElementById("root")!).render(<BackgroundSaveProvider userId="isolated-header-test"><GlobalSearchProvider><Fixture /></GlobalSearchProvider></BackgroundSaveProvider>);

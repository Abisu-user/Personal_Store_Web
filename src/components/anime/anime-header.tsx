"use client";

import { GlobalHeaderActions } from "@/components/layout/global-header-actions";
import { AppIcon } from "@/components/ui/app-icon";

export type AnimeTab = "home" | "library" | "discover" | "stats" | "adult";

export function AnimeHeader({
  activeTab,
  adultUnlocked,
  hasAdultAccess,
  onCreate,
  onOpenAdult,
  onSelectTab,
}: {
  activeTab: AnimeTab;
  adultUnlocked: boolean;
  hasAdultAccess: boolean;
  onCreate: () => void;
  onOpenAdult: () => void;
  onSelectTab: (tab: Exclude<AnimeTab, "adult">) => void;
}) {
  const tabs: { key: Exclude<AnimeTab, "adult">; label: string }[] = [
    { key: "home", label: "首頁" },
    { key: "library", label: "我的收藏" },
    { key: "discover", label: "探索" },
    { key: "stats", label: "統計" },
  ];

  return (
    <header className="anime-toolbar anime-shared-header">
      <div className="anime-header-title">
        <p className="eyebrow">ANIME LIBRARY</p>
        <div className="anime-heading-row">
          <h1>動漫收藏</h1>
          <div className="anime-toolbar-actions">
            {(activeTab !== "adult" || adultUnlocked) && (
              <button className="button compact page-create-button anime-create-button" onClick={onCreate} type="button">
                <AppIcon name="plus" />{activeTab === "adult" ? "新增成人作品" : "新增動漫"}
              </button>
            )}
            <GlobalHeaderActions />
          </div>
        </div>
        <p>搜尋 Anime Database，一鍵加入並記錄每一部作品的觀看進度。</p>
      </div>
      <div className={`anime-tabs bookmark-view-tabs${hasAdultAccess ? " has-adult" : ""}`} role="tablist" aria-label="動漫功能">
        {tabs.map(({ key, label }) => (
          <button aria-selected={activeTab === key} className={activeTab === key ? "active" : ""} key={key} onClick={() => onSelectTab(key)} role="tab" type="button">
            {label}
          </button>
        ))}
        {hasAdultAccess && (
          <button aria-selected={activeTab === "adult"} className={activeTab === "adult" ? "active" : ""} onClick={onOpenAdult} role="tab" type="button">
            成人內容
          </button>
        )}
      </div>
    </header>
  );
}

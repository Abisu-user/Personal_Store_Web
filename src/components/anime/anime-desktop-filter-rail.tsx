"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { animeStatusLabels, type AnimeFolder, type AnimeLibraryItem, type AnimeTag, type AnimeWatchStatus } from "@/lib/anime/types";

type StatusFilter = "all" | AnimeWatchStatus;
const statuses: StatusFilter[] = ["all", "planning", "watching", "completed", "dropped"];

export function AnimeDesktopFilterRail({
  categoryFilters,
  categories,
  folderFilters,
  folders,
  items,
  onAddCategory,
  onAddFolder,
  onCategoryChange,
  onFolderChange,
  onManageCategories,
  onManageFolders,
  onStatusChange,
  onTrash,
  selectedStatus,
  trashCount,
  trashSelected,
}: {
  categoryFilters: string[];
  categories: AnimeTag[];
  folderFilters: string[];
  folders: AnimeFolder[];
  items: AnimeLibraryItem[];
  onAddCategory: () => void;
  onAddFolder: () => void;
  onCategoryChange: (ids: string[]) => void;
  onFolderChange: (ids: string[]) => void;
  onManageCategories: () => void;
  onManageFolders: () => void;
  onStatusChange?: (value: StatusFilter) => void;
  onTrash: () => void;
  selectedStatus?: StatusFilter;
  trashCount: number;
  trashSelected: boolean;
}) {
  const [allFoldersOpen, setAllFoldersOpen] = useState(false);
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  const visibleFolders = folders.filter((folder) => folder.isVisible);
  const displayedFolders = allFoldersOpen || visibleFolders.slice(7).some((folder) => folderFilters.includes(folder.id))
    ? visibleFolders : visibleFolders.slice(0, 7);
  const displayedCategories = allCategoriesOpen || categories.slice(7).some((category) => categoryFilters.includes(category.id))
    ? categories : categories.slice(0, 7);
  return (
    <aside aria-label="動漫收藏篩選" className="anime-desktop-filter-rail">
      {onStatusChange && (
        <section className="anime-filter-rail-group">
          <h2>觀看狀態</h2>
          {statuses.map((status) => (
            <button
              aria-pressed={!trashSelected && !folderFilters.length && selectedStatus === status}
              className={!trashSelected && !folderFilters.length && selectedStatus === status ? "active" : ""}
              key={status}
              onClick={() => onStatusChange(status)}
              type="button"
            >
              <span>{status === "all" ? "全部" : animeStatusLabels[status]}</span>
              <small>{status === "all" ? items.length : items.filter((item) => item.watchStatus === status).length}</small>
            </button>
          ))}
        </section>
      )}
      <section className="anime-filter-rail-group">
        <header><h2>資料夾</h2><div><button aria-label="新增動漫資料夾" onClick={onAddFolder} type="button">＋</button><button aria-label="管理動漫資料夾" onClick={onManageFolders} type="button">管理</button></div></header>
        <button aria-pressed={!trashSelected && !folderFilters.length} className={!trashSelected && !folderFilters.length ? "active" : ""} onClick={() => onFolderChange([])} type="button">
          <span><AppIcon name="folder" />所有資料夾</span>
        </button>
        {displayedFolders.map((folder) => (
          <button aria-pressed={folderFilters.includes(folder.id)} className={folderFilters.includes(folder.id) ? "active" : ""} key={folder.id} onClick={() => onFolderChange(folderFilters.includes(folder.id) ? folderFilters.filter((id) => id !== folder.id) : [...folderFilters, folder.id])} type="button">
            <span><AppIcon name="folder" />{folder.name}</span>
            <small>{items.filter((item) => item.folderIds.includes(folder.id)).length}</small>
          </button>
        ))}
        {visibleFolders.length > 7 && <button className="anime-filter-rail-more" onClick={() => setAllFoldersOpen((open) => !open)} type="button">{allFoldersOpen ? "收起資料夾" : "更多資料夾 ›"}</button>}
      </section>
      <section className="anime-filter-rail-group">
        <header><h2>類別</h2><div><button aria-label="新增動漫類別" onClick={onAddCategory} type="button">＋</button><button aria-label="管理動漫類別" onClick={onManageCategories} type="button">管理</button></div></header>
        <button aria-pressed={!trashSelected && !categoryFilters.length} className={!trashSelected && !categoryFilters.length ? "active" : ""} onClick={() => onCategoryChange([])} type="button">
          <span><AppIcon name="tag" />所有類別</span>
        </button>
        {displayedCategories.map((category) => (
          <button aria-pressed={categoryFilters.includes(category.id)} className={categoryFilters.includes(category.id) ? "active" : ""} key={category.id} onClick={() => onCategoryChange(categoryFilters.includes(category.id) ? categoryFilters.filter((id) => id !== category.id) : [...categoryFilters, category.id])} type="button">
            <span><AppIcon name="tag" />{category.name}</span>
            <small>{items.filter((item) => item.tags.some((tag) => tag.id === category.id)).length}</small>
          </button>
        ))}
        {categories.length > 7 && <button className="anime-filter-rail-more" onClick={() => setAllCategoriesOpen((open) => !open)} type="button">{allCategoriesOpen ? "收起類別" : "更多類別 ›"}</button>}
      </section>
      <section className="anime-filter-rail-group">
        <button aria-pressed={trashSelected} className={trashSelected ? "active" : ""} onClick={onTrash} type="button">
          <span><AppIcon name="trash" />垃圾桶</span><small>{trashCount}</small>
        </button>
      </section>
    </aside>
  );
}

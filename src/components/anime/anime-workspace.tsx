"use client";
import styles from "./anime-mobile.module.css";
import { AppIcon } from "@/components/ui/app-icon";
import { CreateItemModal } from "@/components/ui/create-item-modal";
import { CreateFormActions } from "@/components/ui/create-form-actions";

import { type FormEvent, type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CoverImageField,
  type CoverSelection,
  uploadCover,
} from "@/components/content/cover-image-field";
import { AnimeDiscovery } from "@/components/anime/anime-discovery";
import { AnimeHome } from "@/components/anime/anime-home";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog, OperationStatus } from "@/components/ui/modal-dialog";
import { ResponsiveChipOverflow } from "@/components/ui/responsive-chip-overflow";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { useBackgroundSave } from "@/components/background-save/background-save-provider";
import { TaxonomyMultiSelect } from "@/components/content/taxonomy-multi-select";
import {
  GlassyPinVerification,
  pinVerificationErrorFromResponse,
} from "@/components/security/glassy-pin-verification";
import {
  animeStatusLabels,
  type AnimeLibraryItem,
  type AnimePreferences,
  type AnimeTag,
  type AnimeWatchStatus,
  type AnimeWorkspaceData,
  type ExternalAnime,
} from "@/lib/anime/types";
import {
  readClientResource,
  writeClientResource,
} from "@/lib/pwa/client-resource-cache";

type Tab = "home" | "discover" | "library" | "stats" | "adult";
type AdultView = "library" | "discover";
type CategoryScope = "standard" | "adult";
type Filter = "all" | AnimeWatchStatus;
// Paused remains supported for older records, but is no longer offered as a
// viewing-state choice. Editing an old paused record moves it to 想看.
const statuses: Exclude<AnimeWatchStatus, "paused">[] = [
  "planning",
  "watching",
  "completed",
  "dropped",
];
// 「暫停」仍保留在既有資料的狀態中，但不再作為主要清單的常駐篩選。
const visibleFilters: Filter[] = [
  "all",
  "planning",
  "watching",
  "completed",
  "dropped",
];
const defaultPreferences: AnimePreferences = {
  adultModeEnabled: false,
  adultHiddenByDefault: true,
  adultAccessMode: "none",
  blurAdultCovers: true,
};
const empty: AnimeWorkspaceData = {
  library: [],
  tags: [],
  folders: [],
  logs: [],
  preferences: defaultPreferences,
  adultPermissions: { adultContentAccess: false, adultContentAdmin: false },
};
// `title` is the user's editable display name.  Provider names remain in the
// detail view, but must never override a name the user has changed.
const displayTitle = (
  anime: Pick<AnimeLibraryItem, "title" | "titleChinese" | "titleJapanese">,
) => anime.title || anime.titleChinese || anime.titleJapanese || "未命名動漫";
const externalDisplayTitle = (anime: ExternalAnime) =>
  anime.titleChinese || anime.titleJapanese || anime.title || "未命名動漫";

function optimisticAnime(anime: ExternalAnime, optimisticId: string, adult: boolean): AnimeLibraryItem {
  const now = new Date().toISOString();
  return {
    id: optimisticId,
    externalId: anime.id,
    externalSource: anime.source,
    title: externalDisplayTitle(anime),
    titleJapanese: anime.titleJapanese,
    titleEnglish: anime.titleEnglish,
    titleChinese: anime.titleChinese,
    originalTitle: anime.originalTitle,
    coverUrl: anime.coverUrl,
    bannerUrl: anime.bannerUrl,
    synopsis: anime.synopsis,
    animeType: anime.animeType,
    broadcastStatus: anime.broadcastStatus,
    episodes: anime.episodes,
    episodeDuration: anime.episodeDuration,
    releaseYear: anime.releaseYear,
    season: anime.season,
    startDate: anime.startDate,
    endDate: anime.endDate,
    ageRating: anime.ageRating,
    sourceMaterial: anime.sourceMaterial,
    publicScore: anime.publicScore,
    genres: anime.genres,
    studios: anime.studios,
    relations: anime.relations,
    watchStatus: "planning",
    watchedEpisodes: 0,
    rating: null,
    favorite: false,
    personalRank: null,
    notes: null,
    startedWatchingAt: null,
    completedAt: null,
    lastWatchedAt: null,
    createdAt: now,
    updatedAt: now,
    tags: [],
    sourceUrl: null,
    isAdult: adult,
    contentRating: adult ? anime.contentRating ?? "成人內容" : anime.contentRating,
    adultSource: adult ? anime.source : null,
    externalUrl: anime.externalUrl,
    folderId: null,
    folderIds: [],
  };
}
async function api<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof body.error === "string" ? body.error : "操作失敗，請稍後再試。",
    );
  return body as T;
}

function coverUrl(anime: AnimeLibraryItem) {
  return anime.coverUrl?.startsWith("/") || anime.coverUrl?.startsWith("http")
    ? anime.coverUrl
    : anime.coverUrl
      ? `/api/anime/library/${anime.id}/cover?v=${encodeURIComponent(anime.updatedAt)}`
      : null;
}

function toggledFolderIds(folderIds: string[], folderId: string) {
  return folderIds.includes(folderId)
    ? folderIds.filter((id) => id !== folderId)
    : [...folderIds, folderId];
}

function categoryLabelInFolderSelection(category: AnimeTag, folders: AnimeWorkspaceData["folders"], folderIds: string[]) {
  if (folderIds.length < 2 || !category.folderId) return category.name;
  const folderName = folders.find((folder) => folder.id === category.folderId)?.name;
  return folderName ? `${category.name}（${folderName}）` : category.name;
}

function Cover({
  anime,
  className = "anime-cover",
  blur = false,
}: {
  anime: AnimeLibraryItem;
  className?: string;
  blur?: boolean;
}) {
  const src = coverUrl(anime);
  return src ? (
    <img
      alt={blur ? "成人內容封面（已模糊）" : `${displayTitle(anime)} 封面`}
      className={`${className}${blur ? " anime-adult-cover-blur" : ""}`}
      decoding="async"
      loading="lazy"
      src={src}
    />
  ) : (
    <div className={`${className} anime-cover-fallback`}>ANIME</div>
  );
}

function Status({ value }: { value: AnimeWatchStatus }) {
  return (
    <span className={`anime-status status-${value}`}>
      {animeStatusLabels[value]}
    </span>
  );
}

function StarRating({
  value,
  onChange,
  readonly = false,
}: {
  value: number | null;
  onChange?: (next: number | null) => void;
  readonly?: boolean;
}) {
  return (
    <div
      aria-label={value === null ? "尚未評分" : `我的評分 ${value} / 10`}
      className={`anime-stars${readonly ? " readonly" : ""}`}
    >
      {Array.from({ length: 10 }, (_, index) => {
        const star = index + 1;
        return (
          <button
            aria-label={`${star} 星`}
            className={value !== null && star <= value ? "active" : ""}
            disabled={readonly}
            key={star}
            onClick={() => onChange?.(value === star ? null : star)}
            type="button"
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function AnimeFolderNavigation({
  folders,
  onChange,
  onFoldersChange,
  onTrash,
  scope,
  selectedIds,
  inline = false,
  collectionLayout = false,
  compactOnMobile = false,
  manageSignal = 0,
  trashCount = 0,
  trashSelected = false,
}: {
  folders: AnimeWorkspaceData["folders"];
  onChange: (folderIds: string[]) => void;
  onFoldersChange: (folders: AnimeWorkspaceData["folders"]) => void;
  onTrash?: () => void;
  scope: CategoryScope;
  selectedIds: string[];
  inline?: boolean;
  /** Use the same labelled left-rail/right-actions layout as 網站收藏. */
  collectionLayout?: boolean;
  /** The standard library shares its rail with watch-status shortcuts. */
  compactOnMobile?: boolean;
  /** Allows the mobile filter sheet to open the existing manager without duplicating it. */
  manageSignal?: number;
  trashCount?: number;
  trashSelected?: boolean;
}) {
  const backgroundJobs = useBackgroundSave();
  const [adding, setAdding] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const pending = false;
  const [error, setError] = useState<string | null>(null);
  const [draftFolders, setDraftFolders] = useState<AnimeWorkspaceData["folders"]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [rename, setRename] = useState<{ id: string; value: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const sortedFolders = (values: AnimeWorkspaceData["folders"]) => [...values].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-TW"));
  const visible = sortedFolders(folders).filter((folder) => folder.isVisible);
  const openManager = () => {
    setDraftFolders(sortedFolders(folders));
    setRemovedIds([]);
    setRename(null);
    setDraggingId(null);
    setError(null);
    setManaging(true);
  };
  const previousManageSignal = useRef(manageSignal);
  useEffect(() => {
    if (manageSignal === previousManageSignal.current) return;
    previousManageSignal.current = manageSignal;
    openManager();
  // `openManager` intentionally captures the latest folders whenever the signal changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manageSignal]);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    const optimistic = { id: `optimistic-${crypto.randomUUID()}`, name: name.trim(), scope, sortOrder: folders.length, isVisible: true };
    onFoldersChange(sortedFolders([...folders, optimistic]));
    onChange([optimistic.id]);
    setName("");
    setAdding(false);
    backgroundJobs.enqueue({
      type: "anime-folder",
      title: scope === "adult" ? "新增成人動漫資料夾" : "新增動漫資料夾",
      operation: "新增資料夾",
      page: "/anime",
      request: { url: "/api/anime/folders", method: "POST", body: { name: optimistic.name, scope } },
      rollback: () => { onFoldersChange(folders); onChange([]); },
      onSuccess: (result) => {
        const folder = (result as { folder: AnimeWorkspaceData["folders"][number] }).folder;
        onFoldersChange(sortedFolders([...folders, folder]));
        onChange([folder.id]);
      },
      onError: (cause) => setError(cause.message || "無法新增資料夾。"),
    });
  };
  const updateDraftName = () => {
    if (!rename?.value.trim()) return;
    setDraftFolders((current) => current.map((folder) => folder.id === rename.id ? { ...folder, name: rename.value.trim().slice(0, 80) } : folder));
    setRename(null);
  };
  const moveDraft = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setDraftFolders((current) => {
      const from = current.findIndex((folder) => folder.id === fromId);
      const to = current.findIndex((folder) => folder.id === toId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moving] = next.splice(from, 1);
      next.splice(to, 0, moving);
      return next;
    });
  };
  const beginLongPress = (id: string, pointerType: string) => {
    if (pointerType === "mouse") return;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => setDraggingId(id), 420);
  };
  const endDrag = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    setDraggingId(null);
  };
  const commitManager = async () => {
    const original = sortedFolders(folders);
    const changed = original.length !== draftFolders.length || original.some((folder, index) => folder.id !== draftFolders[index]?.id || folder.name !== draftFolders[index]?.name) || removedIds.length > 0;
    if (!changed) { setManaging(false); return; }
    setError(null);
    const nextFolders = draftFolders.map((folder, sortOrder) => ({ ...folder, sortOrder }));
    if (removedIds.some((id) => selectedIds.includes(id))) onChange(selectedIds.filter((id) => !removedIds.includes(id)));
    onFoldersChange(nextFolders);
    setManaging(false);
    backgroundJobs.enqueue({
      type: "anime-folder",
      title: scope === "adult" ? "整理成人動漫資料夾" : "整理動漫資料夾",
      operation: "更新資料夾",
      page: "/anime",
      execute: async () => {
      for (const [sortOrder, folder] of draftFolders.entries()) {
        const previous = original.find((item) => item.id === folder.id);
        if (!previous || previous.name !== folder.name || previous.sortOrder !== sortOrder) {
          await api("/api/anime/folders", { method: "PATCH", body: JSON.stringify({ id: folder.id, name: folder.name, sortOrder }) });
        }
      }
      for (const id of removedIds) await api("/api/anime/folders", { method: "DELETE", body: JSON.stringify({ id }) });
        return { ok: true };
      },
      rollback: () => onFoldersChange(original),
      onError: (cause) => setError(cause.message || "無法儲存資料夾整理結果，排序已恢復。"),
    });
  };
  return (
    <section
      className={`${inline ? "anime-folder-bar anime-folder-bar-inline" : "anime-folder-bar"}${collectionLayout ? " collection-navigation-section anime-folder-navigation" : ""}`}
      aria-label="動漫資料夾"
      data-anime-scope={scope}
      data-chip-overflow-container={collectionLayout || undefined}
    >
      {collectionLayout && (
        <header>
          <strong>資料夾</strong>
          <div data-chip-overflow-actions>
            <button
              aria-label="管理動漫資料夾"
              className="collection-navigation-action"
              onClick={openManager}
              type="button"
            >
              管理
            </button>
            <button
              aria-label="新增動漫資料夾"
              className="collection-navigation-action primary"
              onClick={() => { setError(null); setAdding(true); }}
              type="button"
            >
              ＋ 新增
            </button>
          </div>
        </header>
      )}
      <ResponsiveChipOverflow
        activeIds={selectedIds}
        className={`anime-category-scroll${collectionLayout ? " bookmark-view-tabs collection-category-strip" : ""}`}
        items={visible}
        trailingCount={onTrash ? (collectionLayout ? 1 : 3) : (collectionLayout ? 0 : 2)}
        itemId={(folder) => folder.id}
        itemMeasureKey={(folder) => folder.name}
        renderItem={(folder) => <button className={selectedIds.includes(folder.id) ? "active" : ""} key={folder.id} onClick={() => onChange(toggledFolderIds(selectedIds, folder.id))} type="button">{folder.name}</button>}
        renderMore={(hasHiddenActive) => <button aria-label="更多動漫資料夾" className={hasHiddenActive ? "anime-category-utility active" : "anime-category-utility"} onClick={() => { setError(null); setMoreOpen(true); }} type="button">更多</button>}
        rowClassName="anime-category-scroll-row"
        trailing={<>{!collectionLayout && <>
          <button
            aria-label="修改資料夾"
            className="anime-category-utility"
            onClick={openManager}
            type="button"
          >
            🔧
          </button>
          <button
            aria-label="新增資料夾"
            className="anime-category-utility anime-category-add-button"
            onClick={() => { setError(null); setAdding(true); }}
            type="button"
          >
            ＋
            </button>
        </>}
        {onTrash && (
          <button
            aria-label="動漫垃圾桶"
            aria-pressed={trashSelected}
            className={trashSelected ? "anime-category-utility anime-folder-trash-button active" : "anime-category-utility anime-folder-trash-button"}
            onClick={(event) => {
              // This control only changes the active collection view.  Keep
              // its click isolated from any nearby editor/form controls.
              event.preventDefault();
              event.stopPropagation();
              onTrash();
            }}
            type="button"
          >
            垃圾桶 <span>{trashCount}</span>
          </button>
        )}
        </>}
      />
      <ModalDialog
        className="mobile-sheet-dialog"
        onClose={() => setAdding(false)}
        open={adding}
        pending={pending}
        title="新增動漫資料夾"
      >
        <form className="anime-category-dialog" onSubmit={create}>
          <label>
            資料夾名稱
            <input
              autoFocus
              disabled={pending}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：本季、經典作品"
              value={name}
            />
          </label>
          {error && <p className="notice error">{error}</p>}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={pending}
              onClick={() => setAdding(false)}
              type="button"
            >
              取消
            </button>
            <button
              className="button"
              disabled={pending || !name.trim()}
              type="submit"
            >
              新增資料夾
            </button>
          </div>
        </form>
      </ModalDialog>
      <ModalDialog
        className="mobile-sheet-dialog"
        onClose={() => setMoreOpen(false)}
        open={moreOpen}
        title="動漫資料夾"
      >
        <div className="collection-category-dialog collection-category-manager">
          <p>此處僅可選擇資料夾；新增、修改、排序與刪除請使用資料夾列的管理按鈕。</p>
          <input aria-label="搜尋動漫資料夾" onChange={(event) => setQuery(event.target.value)} placeholder="搜尋資料夾" value={query} />
          <div className="collection-category-manager-list">
            {onTrash && <button className={trashSelected ? "active" : ""} onClick={() => { onTrash(); setMoreOpen(false); }} type="button">垃圾桶 <span>{trashCount}</span></button>}
            {visible.filter((folder) => folder.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map((folder) => <button className={selectedIds.includes(folder.id) ? "active" : ""} key={folder.id} onClick={() => onChange(toggledFolderIds(selectedIds, folder.id))} type="button">{folder.name}</button>)}
            {!folders.length && <p className="manager-empty">尚未建立資料夾。</p>}
          </div>
        </div>
      </ModalDialog>
      <ModalDialog className="mobile-sheet-dialog" onClose={() => void commitManager()} open={managing} pending={pending} title="修改動漫資料夾">
        <div className="collection-category-dialog collection-category-manager">
          <p>電腦以滑鼠左鍵拖曳、手機以手指長按拖曳調整位置；刪除會先在此視覺化隱藏，關閉後才一次儲存。</p>
          {error && <p className="notice error">{error}</p>}
          <div className="taxonomy-manager-list anime-folder-manager-list">
            {draftFolders.map((folder) => <article aria-grabbed={draggingId === folder.id} className={draggingId === folder.id ? "taxonomy-manager-item anime-folder-manager-item dragging" : "taxonomy-manager-item anime-folder-manager-item"} data-taxonomy-entity="folder" data-taxonomy-id={folder.id} draggable key={folder.id} onDragEnd={endDrag} onDragOver={(event) => { event.preventDefault(); if (draggingId) moveDraft(draggingId, folder.id); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", folder.id); setDraggingId(folder.id); }} onPointerDown={(event: PointerEvent<HTMLElement>) => beginLongPress(folder.id, event.pointerType)} onPointerMove={(event: PointerEvent<HTMLElement>) => { if (!draggingId) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-taxonomy-entity='folder']"); if (target?.dataset.taxonomyId) moveDraft(draggingId, target.dataset.taxonomyId); }} onPointerUp={endDrag}><button className="taxonomy-item-name" onClick={() => setRename({ id: folder.id, value: folder.name })} type="button">{folder.name}</button><button aria-label={`移除 ${folder.name}`} className="taxonomy-delete" onClick={() => { setDraftFolders((current) => current.filter((item) => item.id !== folder.id)); setRemovedIds((current) => [...current, folder.id]); }} type="button">×</button></article>)}
            {!draftFolders.length && <p className="manager-empty">尚未建立資料夾。</p>}
          </div>
        </div>
      </ModalDialog>
      {rename && <ModalDialog className="mobile-sheet-dialog" onClose={() => setRename(null)} open title="修改資料夾"><form className="collection-category-dialog" onSubmit={(event) => { event.preventDefault(); updateDraftName(); }}><label>資料夾名稱<input autoFocus maxLength={80} onChange={(event) => setRename((current) => current ? { ...current, value: event.target.value } : current)} value={rename.value} /></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setRename(null)} type="button">取消</button><button className="button" type="submit">套用</button></div></form></ModalDialog>}
    </section>
  );
}

function AnimeCategoryManager({
  folderId,
  onChange,
  onClose,
  open,
  scope,
  tags,
}: {
  folderId: string | null;
  onChange: (nextTags: AnimeTag[], removedIds: string[]) => void;
  onClose: () => void;
  open: boolean;
  scope: CategoryScope;
  tags: AnimeTag[];
}) {
  const backgroundJobs = useBackgroundSave();
  const initialTags = tags.filter((tag) => tag.folderId === folderId).sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "zh-TW"));
  const [draftTags, setDraftTags] = useState<AnimeTag[]>(initialTags);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [rename, setRename] = useState<{ id: string; value: string } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const pending = false;
  const [error, setError] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const inFolder = initialTags;

  const moveDraft = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setDraftTags((current) => {
      const from = current.findIndex((tag) => tag.id === fromId);
      const to = current.findIndex((tag) => tag.id === toId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moving] = next.splice(from, 1);
      next.splice(to, 0, moving);
      return next;
    });
  };
  const finishDrag = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    setDraggingId(null);
  };
  const startLongPress = (id: string, pointerType: string) => {
    if (pointerType === "mouse") return;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => setDraggingId(id), 420);
  };
  const applyName = () => {
    if (!rename?.value.trim()) return;
    setDraftTags((current) => current.map((tag) => tag.id === rename.id ? { ...tag, name: rename.value.trim().slice(0, 50) } : tag));
    setRename(null);
  };
  const commit = async () => {
    const changed = inFolder.length !== draftTags.length || inFolder.some((tag, index) => tag.id !== draftTags[index]?.id || tag.name !== draftTags[index]?.name) || removedIds.length > 0;
    if (!changed) { onClose(); return; }
    setError(null);
    onClose();
    backgroundJobs.enqueue({
      type: "anime-category",
      title: scope === "adult" ? "整理成人動漫類別" : "整理動漫類別",
      operation: "更新類別",
      page: "/anime",
      execute: async () => {
      for (const [sortOrder, tag] of draftTags.entries()) {
        const previous = inFolder.find((item) => item.id === tag.id);
        if (!previous || previous.name !== tag.name || previous.sortOrder !== sortOrder) {
          await api("/api/anime/tags", { method: "PATCH", body: JSON.stringify({ id: tag.id, name: tag.name, sortOrder }) });
        }
      }
      for (const id of removedIds) await api("/api/anime/tags", { method: "DELETE", body: JSON.stringify({ id }) });
        return { ok: true };
      },
      onSuccess: () => onChange([...tags.filter((tag) => tag.folderId !== folderId), ...draftTags.map((tag, sortOrder) => ({ ...tag, sortOrder }))], removedIds),
      onError: (cause) => setError(cause.message || "無法儲存類別整理結果。"),
    });
  };
  return <>
    <ModalDialog className="mobile-sheet-dialog" onClose={() => void commit()} open={open} pending={pending} title={scope === "adult" ? "修改成人動漫類別" : "修改動漫類別"}>
      <div className="collection-category-dialog collection-category-manager">
        <p>電腦以滑鼠左鍵拖曳、手機以手指長按拖曳調整位置；刪除會先在此視覺化隱藏，關閉後才一次儲存。</p>
        {error && <p className="notice error">{error}</p>}
        <div className="taxonomy-manager-list">
          {draftTags.map((tag) => <article aria-grabbed={draggingId === tag.id} className={draggingId === tag.id ? "taxonomy-manager-item dragging" : "taxonomy-manager-item"} data-taxonomy-entity="anime-category" data-taxonomy-id={tag.id} draggable key={tag.id} onDragEnd={finishDrag} onDragOver={(event) => { event.preventDefault(); if (draggingId) moveDraft(draggingId, tag.id); }} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", tag.id); setDraggingId(tag.id); }} onPointerDown={(event: PointerEvent<HTMLElement>) => startLongPress(tag.id, event.pointerType)} onPointerMove={(event: PointerEvent<HTMLElement>) => { if (!draggingId) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-taxonomy-entity='anime-category']"); if (target?.dataset.taxonomyId) moveDraft(draggingId, target.dataset.taxonomyId); }} onPointerUp={finishDrag}><button className="taxonomy-item-name" onClick={() => setRename({ id: tag.id, value: tag.name })} type="button">{tag.name}</button><button aria-label={`移除類別 ${tag.name}`} className="taxonomy-delete" onClick={() => { setDraftTags((current) => current.filter((item) => item.id !== tag.id)); setRemovedIds((current) => [...current, tag.id]); }} type="button">×</button></article>)}
          {!draftTags.length && <p className="manager-empty">目前資料夾尚未建立類別。</p>}
        </div>
      </div>
    </ModalDialog>
    {rename && <ModalDialog className="mobile-sheet-dialog" onClose={() => setRename(null)} open title="修改動漫類別"><form className="collection-category-dialog" onSubmit={(event) => { event.preventDefault(); applyName(); }}><label>類別名稱<input autoFocus maxLength={50} onChange={(event) => setRename((current) => current ? { ...current, value: event.target.value } : current)} value={rename.value} /></label><div className="dialog-actions"><button className="secondary-button" onClick={() => setRename(null)} type="button">取消</button><button className="button" type="submit">套用</button></div></form></ModalDialog>}
  </>;
}

function AnimeCollectionList({
  adult = false,
  blur = false,
  categories,
  folders,
  items,
  onGridColumnsChange,
  onMutated,
  onOpen,
  onStatusChange,
  scope,
  trashed = false,
}: {
  adult?: boolean;
  blur?: boolean;
  categories: AnimeTag[];
  folders: AnimeWorkspaceData["folders"];
  items: AnimeLibraryItem[];
  onGridColumnsChange?: (columns: number | null) => void;
  onMutated: () => Promise<void>;
  onOpen: (anime: AnimeLibraryItem) => void;
  onStatusChange?: (anime: AnimeLibraryItem, status: Exclude<AnimeWatchStatus, "paused">) => void;
  scope: CategoryScope;
  trashed?: boolean;
}) {
  const backgroundJobs = useBackgroundSave();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [confirmPermanent, setConfirmPermanent] = useState(false);
  const pending = false;
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const visibleItems = items.filter((item) => !hiddenIds.includes(item.id));
  const selected = new Set(selectedIds);
  const allSelected = visibleItems.length > 0 && selectedIds.length === visibleItems.length;
  useEffect(() => {
    if (!onGridColumnsChange || !gridRef.current) return;
    const grid = gridRef.current;
    const updateColumns = () => {
      if (!window.matchMedia("(min-width: 701px)").matches) {
        onGridColumnsChange(null);
        return;
      }
      const columns = window
        .getComputedStyle(grid)
        .gridTemplateColumns.split(/\s+/)
        .filter(Boolean).length;
      onGridColumnsChange(Math.max(1, columns));
    };
    const observer = new ResizeObserver(updateColumns);
    observer.observe(grid);
    updateColumns();
    return () => observer.disconnect();
  }, [items.length, onGridColumnsChange]);
  const toggle = (animeId: string) =>
    setSelectedIds((ids) =>
      ids.includes(animeId)
        ? ids.filter((id) => id !== animeId)
        : [...ids, animeId],
    );
  const run = async (
    action: "trash" | "restore" | "permanent" | "organize",
  ) => {
    if (!selectedIds.length) return;
    setMessage(null);
    const ids = [...selectedIds];
    if (action !== "organize") setHiddenIds((current) => [...new Set([...current, ...ids])]);
    setSelectedIds([]);
    setSelecting(false);
    setOrganizeOpen(false);
    setConfirmPermanent(false);
    backgroundJobs.enqueue({
      type: adult ? "anime-adult-batch" : "anime-batch",
      title: `${action === "organize" ? "批量整理" : action === "restore" ? "批量還原" : action === "permanent" ? "批量永久刪除" : "批量刪除"} ${ids.length} 筆動漫`,
      operation: action === "organize" ? "批量整理" : action === "restore" ? "批量還原" : action === "permanent" ? "批量永久刪除" : "批量移至垃圾桶",
      page: "/anime",
      request: {
        url: "/api/anime/library",
        method: "PATCH",
        body: {
          action,
          ids,
          scope,
          ...(action === "organize"
            ? { folderIds, categoryIds }
            : {}),
        },
      },
      rollback: () => setHiddenIds((current) => current.filter((id) => !ids.includes(id))),
      onSuccess: () => {
        setHiddenIds((current) => current.filter((id) => !ids.includes(id)));
        void onMutated().catch((cause) => setMessage(cause instanceof Error ? cause.message : "背景同步完成，但重新整理清單失敗。"));
      },
      onError: (cause) => setMessage(cause.message || "無法完成批量操作。"),
    });
  };
  return (
    <>
      <div className="anime-bulk-toolbar">
        {!selecting && <button
          className="secondary-button compact"
          onClick={() => {
            setSelecting(true);
            setSelectedIds([]);
          }}
          type="button"
        >
          選取
        </button>}
        {selecting && (
          <label><input checked={allSelected} onChange={() => setSelectedIds(allSelected ? [] : visibleItems.map((anime) => anime.id))} type="checkbox" />全選目前清單</label>
        )}
      </div>
      <BatchActionBar count={selectedIds.length} onCancel={() => { setSelectedIds([]); setSelecting(false); }}>
        {trashed ? (<>
          <button className="button" disabled={pending} onClick={() => void run("restore")} type="button">還原</button>
          <button className="danger-button" disabled={pending} onClick={() => setConfirmPermanent(true)} type="button">永久刪除</button>
        </>) : (<>
          <button className="secondary-button" disabled={pending} onClick={() => setOrganizeOpen(true)} type="button">整理</button>
          <button className="danger-button" disabled={pending} onClick={() => void run("trash")} type="button">刪除</button>
        </>)}
      </BatchActionBar>
      {message && <p className="notice error">{message}</p>}
      <div className="anime-grid" ref={gridRef}>
        {visibleItems.map((anime) => (
          <article
            className={`anime-card${adult ? " anime-adult-card" : ""}`}
            key={anime.id}
          >
            {selecting && (
              <label className="anime-card-select">
                <input
                  aria-label={`選取 ${displayTitle(anime)}`}
                  checked={selected.has(anime.id)}
                  onChange={() => toggle(anime.id)}
                  type="checkbox"
                />
              </label>
            )}
            <button
              className="anime-card-main"
              onClick={() => onOpen(anime)}
              type="button"
            >
              <Cover anime={anime} blur={adult && blur} />
              <div className="anime-card-copy">
                <div className="anime-card-line">
                  <Status value={anime.watchStatus} />
                  {adult && <span className="anime-adult-badge">18+</span>}
                  {anime.rating !== null && !adult && (
                    <span className="anime-rating-summary">
                      ★ {anime.rating}
                    </span>
                  )}
                </div>
                <h3>{displayTitle(anime)}</h3>
                <p>
                  {anime.tags.map((category) => category.name).join(" · ") ||
                    "未分類"}
                </p>
                {!adult && (
                  <div className={styles.episodeProgress}>
                    <span><span>{anime.watchedEpisodes > 0 ? `已看 ${anime.watchedEpisodes} 集` : "尚未開始"}</span><span>{anime.episodes && anime.episodes > 0 ? `共 ${anime.episodes} 集` : "集數未定"}</span></span>
                    {anime.episodes && anime.episodes > 0 ? <i aria-hidden="true"><b style={{ width: `${Math.min(100, Math.max(0, anime.watchedEpisodes / anime.episodes * 100))}%` }} /></i> : null}
                  </div>
                )}
                {!adult && (
                  <div className="anime-card-link">
                    {anime.sourceUrl ? "已設定觀看連結" : "尚未設定觀看連結"}
                  </div>
                )}
              </div>
            </button>
            {!trashed && onStatusChange && <div className="anime-card-quick-status"><label><span>觀看狀態</span><select aria-label={`更新 ${displayTitle(anime)} 的觀看狀態`} onChange={(event) => onStatusChange(anime, event.target.value as Exclude<AnimeWatchStatus, "paused">)} value={anime.watchStatus === "paused" ? "planning" : anime.watchStatus}>{statuses.map((status) => <option key={status} value={status}>{animeStatusLabels[status]}</option>)}</select></label></div>}
          </article>
        ))}
      </div>
      <ModalDialog
        className="mobile-sheet-dialog bulk-organize-modal"
        onClose={() => setOrganizeOpen(false)}
        open={organizeOpen}
        pending={pending}
        title="批量整理選取資料"
      >
        <div className="anime-category-dialog bulk-organize-dialog">
          <p className="bulk-organize-description">整理 {selectedIds.length} 筆動漫。套用後會更新所選作品的資料夾與類別歸屬。</p>
          <div className="bulk-organize-static-mode"><span>操作方式</span><div className="operation-select-row"><span className="operation-select-icon"><AppIcon name="folder" /></span><strong>設定資料夾／類別</strong></div></div>
          <TaxonomyMultiSelect
            categories={categories.map((category) => ({ id: category.id, name: categoryLabelInFolderSelection(category, folders, folderIds), folder_id: category.folderId }))}
            categoryIds={categoryIds}
            disabled={pending}
            folderIds={folderIds}
            folders={folders.map((folder) => ({ id: folder.id, name: folder.name, is_visible: folder.isVisible }))}
            onCategoryIdsChange={setCategoryIds}
            onFolderIdsChange={setFolderIds}
            showUnassignedCategoriesWithFolders={false}
            folderHint="選擇要設定的資料夾"
            categoryHint="選擇要設定的類別"
          />
          {!folders.length && <p className="anime-field-hint">尚未建立資料夾；不勾選代表未整理。</p>}
          <p className="anime-field-hint">未勾選任何資料夾時，會移至未整理。</p>
          <div className="dialog-actions bulk-organize-actions">
            <button
              className="secondary-button"
              disabled={pending}
              onClick={() => setOrganizeOpen(false)}
              type="button"
            >
              取消
            </button>
            <button
              className="button"
              disabled={pending}
              onClick={() => void run("organize")}
              type="button"
            >
              套用整理
            </button>
          </div>
        </div>
      </ModalDialog>
      <ConfirmDialog
        confirmLabel="永久刪除"
        description={`確定要永久刪除選取的 ${selectedIds.length} 筆動漫嗎？此操作無法復原。`}
        onCancel={() => setConfirmPermanent(false)}
        onConfirm={() => void run("permanent")}
        open={confirmPermanent}
        pending={pending}
        title="永久刪除動漫"
      />
    </>
  );
}

export function AnimeWorkspace({
  initialData,
  initialAdultOpen = false,
}: {
  initialData?: AnimeWorkspaceData;
  initialAdultOpen?: boolean;
}) {
  const backgroundJobs = useBackgroundSave();
  const [data, setData] = useState(initialData ?? empty);
  const hasAdultAccess = data.adultPermissions?.adultContentAccess === true;
  const initialAdultHandled = useRef(false);
  const [loaded, setLoaded] = useState(Boolean(initialData));
  const [tab, setTab] = useState<Tab>("home");
  const [discoveryView, setDiscoveryView] = useState<"season" | "updates" | "schedule">("season");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [folderFilters, setFolderFilters] = useState<string[]>([]);
  const [adultCategoryFilters, setAdultCategoryFilters] = useState<string[]>([]);
  const [adultFolderFilters, setAdultFolderFilters] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const librarySearch = useRef<HTMLInputElement>(null);
  const [adultQuery, setAdultQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnimeLibraryItem | null>(null);
  const [selectedReadOnly, setSelectedReadOnly] = useState(false);
  const [editing, setEditing] = useState<AnimeLibraryItem | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { const open = () => setAdding(true); window.addEventListener("personal-vault:new-item", open); return () => window.removeEventListener("personal-vault:new-item", open); }, []);
  const [removing, setRemoving] = useState<AnimeLibraryItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [folderManageSignal, setFolderManageSignal] = useState(0);
  const [libraryFilterDraft, setLibraryFilterDraft] = useState<{
    status: Filter;
    folderIds: string[];
    categoryIds: string[];
  }>({ status: "all", folderIds: [], categoryIds: [] });
  const [categoryAddOpen, setCategoryAddOpen] = useState(false);
  const [categoryMoreOpen, setCategoryMoreOpen] = useState(false);
  const [categoryManageScope, setCategoryManageScope] =
    useState<CategoryScope | null>(null);
  const [prefill, setPrefill] = useState<ExternalAnime | null>(null);
  const [adultPrefill, setAdultPrefill] = useState<ExternalAnime | null>(null);
  const [adultData, setAdultData] = useState<AnimeWorkspaceData | null>(null);
  const [trashData, setTrashData] = useState<AnimeWorkspaceData | null>(null);
  const [adultTrashData, setAdultTrashData] =
    useState<AnimeWorkspaceData | null>(null);
  const [libraryView, setLibraryView] = useState<"library" | "trash">(
    "library",
  );
  const [adultLibraryView, setAdultLibraryView] = useState<"library" | "trash">(
    "library",
  );
  const [adultUnlocked, setAdultUnlocked] = useState(false);
  const [adultView, setAdultView] = useState<AdultView>("library");
  const [adultPinPrompt, setAdultPinPrompt] = useState(false);
  const quickAddLocks = useRef(new Set<string>());
  const [preferences, setPreferences] = useState(
    initialData?.preferences ?? defaultPreferences,
  );
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryGridColumns, setLibraryGridColumns] = useState<number | null>(
    null,
  );
  // Mobile keeps its existing 12-item page. On desktop, use every visible
  // column for five rows so a wider workspace shows more work without adding
  // a sixth row.
  const libraryPageSize = libraryGridColumns
    ? libraryGridColumns * 5
    : 12;

  useEffect(() => {
    let active = true;
    const cached = readClientResource<AnimeWorkspaceData>("anime:standard");
    if (cached) {
      // Permission is security-sensitive and is never trusted from the local
      // resource cache.  The fresh server response below restores it.
      setData({ ...cached, adultPermissions: empty.adultPermissions });
      setPreferences(cached.preferences);
      setLoaded(true);
    }
    const load = async () => {
      try {
        const next = await api<AnimeWorkspaceData>("/api/anime/library");
        if (!active) return;
        setData(next);
        setPreferences(next.preferences);
        setLoaded(true);
        if (!next.adultPermissions.adultContentAccess) {
          setAdultUnlocked(false);
          setAdultData(null);
          setTab((current) => current === "adult" ? "library" : current);
        }
        writeClientResource("anime:standard", next);
      } catch (cause) {
        if (active && !cached)
          setNotice(
            cause instanceof Error
              ? cause.message
              : "無法載入動漫資料，請稍後再試。",
          );
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (loaded) writeClientResource("anime:standard", data);
  }, [data, loaded]);

  useEffect(() => {
    if (!notice) return;
    const timeoutId = window.setTimeout(() => setNotice(null), 3_000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  const refresh = async () => {
    const next = await api<AnimeWorkspaceData>("/api/anime/library");
    setData(next);
    setPreferences(next.preferences);
    setLoaded(true);
    if (!next.adultPermissions.adultContentAccess) {
      setAdultUnlocked(false);
      setAdultData(null);
      setTab((current) => current === "adult" ? "library" : current);
    }
    writeClientResource("anime:standard", next);
  };
  const refreshAdult = async () => {
    const next = await api<AnimeWorkspaceData>(
      "/api/anime/library?scope=adult",
    );
    if (document.visibilityState === "visible") setAdultData(next);
  };
  const quickAddExternal = async (anime: ExternalAnime, adult = false) => {
    const key = `${adult ? "adult" : "standard"}:${anime.source}:${anime.id}`;
    if (quickAddLocks.current.has(key)) return;
    const currentLibrary = adult ? (adultData?.library ?? []) : data.library;
    if (currentLibrary.some((item) => item.externalSource === anime.source && item.externalId === anime.id)) {
      setNotice("這部作品已在收藏中。");
      return;
    }
    quickAddLocks.current.add(key);
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const optimistic = optimisticAnime(anime, optimisticId, adult);
    if (adult) setAdultData((current) => current ? { ...current, library: [optimistic, ...current.library] } : current);
    else setData((current) => ({ ...current, library: [optimistic, ...current.library] }));

    return new Promise<void>((resolve, reject) => {
      backgroundJobs.enqueue({
        type: adult ? "anime-adult" : "anime",
        title: `加入收藏：${externalDisplayTitle(anime)}`,
        operation: "加入收藏",
        page: "/anime",
        entityKey: `anime-external:${key}`,
        request: {
          url: "/api/anime/library",
          method: "POST",
          body: {
            title: externalDisplayTitle(anime),
            sourceUrl: null,
            coverUrl: anime.coverUrl,
            watchStatus: "planning",
            categoryIds: [],
            folderIds: [],
            isAdult: adult,
            contentRating: adult ? anime.contentRating ?? "成人內容" : anime.contentRating,
            adultSource: adult ? anime.source : null,
            externalUrl: anime.externalUrl,
            externalId: anime.id,
            externalSource: anime.source,
            metadata: {
              titleJapanese: anime.titleJapanese,
              titleEnglish: anime.titleEnglish,
              titleChinese: anime.titleChinese,
              originalTitle: anime.originalTitle,
              synopsis: anime.synopsis,
              animeType: anime.animeType,
              broadcastStatus: anime.broadcastStatus,
              episodes: anime.episodes,
              episodeDuration: anime.episodeDuration,
              releaseYear: anime.releaseYear,
              season: anime.season,
              startDate: anime.startDate,
              endDate: anime.endDate,
              ageRating: anime.ageRating,
              sourceMaterial: anime.sourceMaterial,
              publicScore: anime.publicScore,
              genres: anime.genres,
              studios: anime.studios,
              relations: anime.relations,
            },
          },
        },
        rollback: () => {
          if (adult) setAdultData((current) => current ? { ...current, library: current.library.filter((item) => item.id !== optimisticId) } : current);
          else setData((current) => ({ ...current, library: current.library.filter((item) => item.id !== optimisticId) }));
        },
        onSuccess: (result) => {
          const savedId = (result as { id?: string } | null)?.id;
          const replace = (items: AnimeLibraryItem[]) => items.map((item) => item.id === optimisticId ? { ...item, id: savedId ?? item.id } : item);
          if (adult) setAdultData((current) => current ? { ...current, library: replace(current.library) } : current);
          else setData((current) => ({ ...current, library: replace(current.library) }));
          quickAddLocks.current.delete(key);
          setNotice("已加入收藏。");
          resolve();
        },
        onError: (cause) => {
          quickAddLocks.current.delete(key);
          setNotice(cause.message || "無法加入收藏。");
          reject(cause);
        },
      });
    });
  };
  const updateWatchStatus = (anime: AnimeLibraryItem, watchStatus: Exclude<AnimeWatchStatus, "paused">) => {
    const adult = anime.isAdult;
    const replace = (items: AnimeLibraryItem[]) => items.map((item) => item.id === anime.id ? { ...item, watchStatus, updatedAt: new Date().toISOString() } : item);
    if (adult) setAdultData((current) => current ? { ...current, library: replace(current.library) } : current);
    else setData((current) => ({ ...current, library: replace(current.library) }));
    backgroundJobs.enqueue({
      type: adult ? "anime-adult" : "anime",
      title: `更新觀看狀態：${displayTitle(anime)}`,
      operation: "更新觀看狀態",
      page: "/anime",
      entityKey: `anime:${anime.id}`,
      request: { url: "/api/anime/library", method: "PATCH", body: { id: anime.id, watchStatus } },
      rollback: () => {
        if (adult) setAdultData((current) => current ? { ...current, library: current.library.map((item) => item.id === anime.id ? anime : item) } : current);
        else setData((current) => ({ ...current, library: current.library.map((item) => item.id === anime.id ? anime : item) }));
      },
      onSuccess: () => setNotice("觀看狀態已更新。"),
      onError: (cause) => setNotice(cause.message || "無法更新觀看狀態。"),
    });
  };
  const refreshTrash = async (scope: CategoryScope) => {
    const next = await api<AnimeWorkspaceData>(
      `/api/anime/library?scope=${scope}&view=trash`,
      { cache: "no-store" },
    );
    if (scope === "adult") setAdultTrashData(next);
    else setTrashData(next);
  };
  const openTrash = async (scope: CategoryScope) => {
    // Switch views synchronously. Loading the data is deliberately separate
    // from mutations, so this never presents the "saving anime" overlay.
    if (scope === "adult") {
      setAdultTrashData(null);
      setAdultLibraryView("trash");
    } else {
      setTrashData(null);
      setLibraryView("trash");
    }
    try {
      await refreshTrash(scope);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "無法讀取垃圾桶。");
    }
  };
  const selectLibraryStatus = (value: Filter) => {
    // A watch-status view and a folder view are mutually exclusive.  Clear
    // the folder first so the interface never leaves two navigation chips
    // looking active at the same time.
    setFolderFilters([]);
    setCategoryFilters([]);
    setLibraryView("library");
    setFilter(value);
  };
  const openLibraryFilters = () => {
    setLibraryFilterDraft({ status: filter, folderIds: folderFilters, categoryIds: categoryFilters });
    setFilterOpen(true);
  };
  const applyLibraryFilters = () => {
    setLibraryView("library");
    setFilter(libraryFilterDraft.status);
    setFolderFilters(libraryFilterDraft.folderIds);
    setCategoryFilters(libraryFilterDraft.categoryIds);
    setFilterOpen(false);
  };
  const updateAdultPreferences = async (changes: Partial<AnimePreferences>) => {
    setPending("adult-settings");
    try {
      const next = await api<AnimePreferences>("/api/anime/preferences", {
        method: "PATCH",
        body: JSON.stringify(changes),
      });
      setPreferences(next);
      setData((current) => ({ ...current, preferences: next }));
      if (!next.adultModeEnabled) {
        setAdultData(null);
        setAdultUnlocked(false);
        if (tab === "adult") setTab("library");
      }
      setNotice("成人內容設定已儲存。");
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "無法儲存成人內容設定。",
      );
    } finally {
      setPending(null);
    }
  };
  const loadAdult = async () => {
    const next = await api<AnimeWorkspaceData>(
      "/api/anime/library?scope=adult",
    );
    if (document.visibilityState !== "visible") return;
    setAdultData(next);
    setAdultUnlocked(true);
    setAdultView("library");
    setTab("adult");
  };
  const openAdult = async () => {
    if (!preferences.adultModeEnabled) {
      setNotice("請先前往安全中心啟用成人內容模式。");
      return;
    }
    // A successful unlock lasts for this visible app session.  It is cleared
    // immediately on backgrounding, but routine actions inside Anime Library
    // must not repeatedly ask for the same adult PIN.
    if (adultUnlocked && adultData) {
      setTab("adult");
      return;
    }
    if (
      preferences.adultAccessMode === "pin4" ||
      preferences.adultAccessMode === "pin6"
    ) {
      setAdultPinPrompt(true);
      return;
    }
    setPending("adult-access");
    setNotice(null);
    try {
      if (preferences.adultAccessMode === "passkey") {
        const { error } = await createClient().auth.signInWithPasskey();
        if (error)
          throw new Error("Face ID / Passkey 驗證未完成，成人內容仍保持隱藏。");
      }
      await loadAdult();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "無法開啟成人內容。");
    } finally {
      setPending(null);
    }
  };
  useEffect(() => {
    if (!initialAdultOpen || initialAdultHandled.current || !loaded || !hasAdultAccess) return;
    initialAdultHandled.current = true;
    void openAdult();
    // Opening the protected tab is a one-time response to the direct route.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAdultAccess, initialAdultOpen, loaded]);
  const verifyAdultPin = async (value: string) => {
    const response = await fetch("/api/anime/preferences/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", pin: value }),
    });
    if (!response.ok) {
      throw await pinVerificationErrorFromResponse(response, "成人區 PIN 驗證失敗。");
    }
  };
  const finishAdultPinUnlock = async () => {
    setAdultPinPrompt(false);
    setPending(null);
    try {
      await loadAdult();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "無法開啟成人內容。");
    }
  };
  useEffect(() => {
    const hideAdult = () => {
      if (document.visibilityState !== "visible") {
        setAdultUnlocked(false);
        setAdultData(null);
        if (tab === "adult") setTab("library");
      }
    };
    document.addEventListener("visibilitychange", hideAdult);
    return () => document.removeEventListener("visibilitychange", hideAdult);
  }, [tab]);
  const library = useMemo(
    () =>
      data.library.filter((anime) => {
        const matchesFilter = filter === "all" || anime.watchStatus === filter;
        const matchesFolder =
          !folderFilters.length || anime.folderIds.some((folderId) => folderFilters.includes(folderId));
        const matchesCategory =
          !categoryFilters.length ||
          anime.tags.some((category) => categoryFilters.includes(category.id));
        const haystack = [
          anime.title,
          anime.titleChinese,
          anime.titleJapanese,
          anime.titleEnglish,
          anime.notes,
          ...anime.tags.map((category) => category.name),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        return (
          matchesFilter &&
          matchesFolder &&
          matchesCategory &&
          haystack.includes(query.toLocaleLowerCase())
        );
      }),
    [categoryFilters, data.library, filter, folderFilters, query],
  );
  const libraryPageCount = Math.max(
    1,
    Math.ceil(library.length / libraryPageSize),
  );
  const activeLibraryPage = Math.min(libraryPage, libraryPageCount);
  const pagedLibrary = library.slice(
    (activeLibraryPage - 1) * libraryPageSize,
    activeLibraryPage * libraryPageSize,
  );
  useEffect(() => {
    setLibraryPage((current) => Math.min(current, libraryPageCount));
  }, [libraryPageCount]);
  useEffect(() => {
    setLibraryPage(1);
  }, [filter, categoryFilters, folderFilters, query]);
  const createCategory = async (scope: CategoryScope) => {
    const name = categoryName.trim();
    if (!name) return;
    const folderId = scope === "adult" ? (adultFolderFilters[0] ?? null) : (folderFilters[0] ?? null);
    const optimistic: AnimeTag = { id: `optimistic-${crypto.randomUUID()}`, name, color: null, folderId, sortOrder: scope === "adult" ? (adultData?.tags.length ?? 0) : data.tags.length };
    const putTag = (tag: AnimeTag) => (current: AnimeWorkspaceData) =>
        current.tags.some((category) => category.id === tag.id)
          ? current
          : {
              ...current,
              tags: [...current.tags, tag].sort((a, b) =>
                a.folderId === b.folderId
                  ? a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "zh-TW")
                  : (a.folderId ?? "").localeCompare(b.folderId ?? ""),
              ),
            };
    if (scope === "adult") setAdultData((current) => current ? putTag(optimistic)(current) : current);
    else setData(putTag(optimistic));
    setCategoryName("");
    setCategoryAddOpen(false);
    backgroundJobs.enqueue({
      type: "anime-category",
      title: scope === "adult" ? "新增成人動漫類別" : "新增動漫類別",
      operation: "新增類別",
      page: "/anime",
      request: { url: "/api/anime/tags", method: "POST", body: { name, scope, folderId } },
      rollback: () => replaceScopeTags(scope, (tags) => tags.filter((tag) => tag.id !== optimistic.id)),
      onSuccess: (result) => {
        const tag = (result as { tag: AnimeTag }).tag;
        replaceScopeTags(scope, (tags) => tags.map((item) => item.id === optimistic.id ? tag : item));
        setNotice("已新增類別。");
      },
      onError: (cause) => setNotice(cause.message || "無法新增類別。"),
    });
  };
  const replaceScopeTags = (
    scope: CategoryScope,
    transform: (tags: AnimeTag[]) => AnimeTag[],
  ) => {
    if (scope === "adult") {
      setAdultData((current) =>
        current ? { ...current, tags: transform(current.tags) } : current,
      );
    } else {
      setData((current) => ({ ...current, tags: transform(current.tags) }));
    }
  };
  const remove = async () => {
    if (!removing) return;
    const removed = removing;
    if (removed.isAdult) setAdultData((current) => current ? { ...current, library: current.library.filter((anime) => anime.id !== removed.id) } : current);
    else setData((current) => ({ ...current, library: current.library.filter((anime) => anime.id !== removed.id) }));
    setSelected(null);
    setRemoving(null);
    backgroundJobs.enqueue({
      type: removed.isAdult ? "anime-adult" : "anime",
      title: removed.isAdult ? "刪除成人作品" : "刪除動漫",
      operation: "移至垃圾桶",
      page: "/anime",
      entityKey: `anime:${removed.id}`,
      request: { url: "/api/anime/library", method: "DELETE", body: { id: removed.id } },
      rollback: () => {
        if (removed.isAdult) setAdultData((current) => current ? { ...current, library: current.library.some((anime) => anime.id === removed.id) ? current.library : [removed, ...current.library] } : current);
        else setData((current) => ({ ...current, library: current.library.some((anime) => anime.id === removed.id) ? current.library : [removed, ...current.library] }));
      },
      onSuccess: () => { setNotice("已移至垃圾桶。"); void refreshTrash(removed.isAdult ? "adult" : "standard").catch(() => undefined); },
      onError: (cause) => setNotice(cause.message || "無法移除動漫，項目已恢復。"),
    });
  };
  const standardScopedTags = data.tags.filter(
    (item) => !folderFilters.length || item.folderId === null || (item.folderId !== null && folderFilters.includes(item.folderId)),
  );
  const adultScopedTags = (adultData?.tags ?? []).filter(
    (item) => !adultFolderFilters.length || item.folderId === null || (item.folderId !== null && adultFolderFilters.includes(item.folderId)),
  );
  return (
    <section className="anime-workspace">
      {pending && (
        <OperationStatus
          label={pending === "adult-access" ? "正在驗證成人內容存取權…" : "正在更新成人內容安全設定…"}
        />
      )}
      <div className="anime-mobile-heading">
        <h1>動漫收藏</h1>
        <div className={styles.headingActions}>
        {tab === "library" && <button className="mobile-icon-button" aria-label="搜尋自己的動漫" onClick={() => librarySearch.current?.focus()} type="button"><AppIcon name="search" /></button>}
        {(tab !== "adult" || adultUnlocked) && (
          <button
            className="button compact page-create-button anime-mobile-create-button"
            onClick={() => setAdding(true)}
            type="button"
          >
            <AppIcon name="plus" />新增
          </button>
        )}
        </div>
      </div>
      <div className="anime-toolbar">
        <div className={`anime-tabs bookmark-view-tabs${hasAdultAccess ? " has-adult" : ""}`} role="tablist" aria-label="動漫功能">
          <button
            className={tab === "home" ? "active" : ""}
            onClick={() => setTab("home")}
            type="button"
          >
            首頁
          </button>
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => setTab("library")}
            type="button"
          >
            我的收藏
          </button>
          <button
            className={tab === "discover" ? "active" : ""}
            onClick={() => setTab("discover")}
            type="button"
          >
            探索
          </button>
          <button
            className={tab === "stats" ? "active" : ""}
            onClick={() => setTab("stats")}
            type="button"
          >
            統計
          </button>
          {hasAdultAccess && (
            <button
              className={tab === "adult" ? "active" : ""}
              onClick={() => void openAdult()}
              type="button"
            >
              成人內容
            </button>
          )}
        </div>
        <div className="anime-toolbar-actions">
          {(tab !== "adult" || adultUnlocked) && (
            <button
              className="button compact page-create-button anime-create-button"
              onClick={() => setAdding(true)}
              type="button"
            >
              ＋ {tab === "adult" ? "新增成人作品" : "新增動漫"}
            </button>
          )}
        </div>
      </div>
      {notice && (
        <div className="notice success anime-notice">
          <span>{notice}</span>
          <button
            aria-label="關閉提示"
            onClick={() => setNotice(null)}
            type="button"
          >
            ×
          </button>
        </div>
      )}
      {tab === "home" && (
        <AnimeHome
          library={data.library}
          onAdd={(anime) => quickAddExternal(anime)}
          onOpenSchedule={() => { setDiscoveryView("schedule"); setTab("discover"); }}
          onOpenSeason={() => { setDiscoveryView("season"); setTab("discover"); }}
        />
      )}
      {tab === "discover" && (
        <AnimeDiscovery initialView={discoveryView} key={discoveryView} library={data.library} onAdd={(anime) => quickAddExternal(anime)} />
      )}
      {tab === "adult" && adultUnlocked && adultData && (
        <section className="anime-adult-workspace">
          <div className="anime-filter-bar anime-adult-filter-bar">
            <div className="anime-filter-scroll">
              <div
                className="anime-tabs bookmark-view-tabs anime-adult-library-tabs"
                role="tablist"
                aria-label="成人內容功能"
              >
                <button
                  className={
                    adultView === "library" &&
                    adultLibraryView === "library" &&
                    !adultFolderFilters.length &&
                    !adultCategoryFilters.length
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    setAdultView("library");
                    setAdultLibraryView("library");
                    setAdultFolderFilters([]);
                    setAdultCategoryFilters([]);
                  }}
                  type="button"
                >
                  我的收藏
                </button>
                <button
                  className={adultView === "discover" ? "active" : ""}
                  onClick={() => {
                    setAdultView("discover");
                    setAdultLibraryView("library");
                    setAdultFolderFilters([]);
                    setAdultCategoryFilters([]);
                  }}
                  type="button"
                >
                  探索
                </button>
              </div>
            </div>
            {adultView === "library" && (
                <input
                  aria-label="搜尋成人動漫"
                  onChange={(event) => setAdultQuery(event.target.value)}
                  placeholder="搜尋成人動漫"
                  value={adultQuery}
                />
            )}
          </div>
          <AnimeFolderNavigation
            collectionLayout
            folders={adultData.folders}
            inline
            onChange={(folderIds) => {
              setAdultView("library");
              setAdultLibraryView("library");
              setAdultFolderFilters(folderIds);
            }}
            onFoldersChange={(folders) =>
              setAdultData((current) =>
                current ? { ...current, folders } : current,
              )
            }
            onTrash={() => {
              setAdultView("library");
              setAdultFolderFilters([]);
              setAdultCategoryFilters([]);
              void openTrash("adult");
            }}
            scope="adult"
            selectedIds={adultFolderFilters}
            trashCount={adultTrashData?.library.length ?? 0}
            trashSelected={adultLibraryView === "trash"}
          />
          {adultView === "library" ? (
            <>
              {adultLibraryView === "library" ? (
                <>
                  <section
                    className="anime-category-bar anime-adult-category-bar collection-navigation-section"
                    aria-label="成人動漫類別"
                    data-anime-scope="adult"
                    data-chip-overflow-container
                  >
                    <header>
                      <strong>類別</strong>
                      <div data-chip-overflow-actions>
                        <button
                          aria-label="管理成人動漫類別"
                          className="collection-navigation-action"
                          onClick={() => setCategoryManageScope("adult")}
                          type="button"
                        >
                          管理
                        </button>
                        <button
                          aria-label="新增成人動漫類別"
                          className="collection-navigation-action primary"
                          onClick={() => setCategoryAddOpen(true)}
                          type="button"
                        >
                          ＋ 新增
                        </button>
                      </div>
                    </header>
                    <ResponsiveChipOverflow
                      activeIds={adultCategoryFilters}
                      className="anime-category-scroll bookmark-view-tabs collection-category-strip"
                      leadingCount={1}
                      items={adultScopedTags}
                      itemId={(category) => category.id}
                      itemMeasureKey={(category) => `${category.name}|${adultData.library.filter((anime) => anime.tags.some((item) => item.id === category.id)).length}`}
                      leading={<button className={!adultCategoryFilters.length ? "active" : ""} onClick={() => setAdultCategoryFilters([])} type="button">所有類別</button>}
                      renderItem={(category) => <button className={adultCategoryFilters.includes(category.id) ? "active" : ""} key={category.id} onClick={() => setAdultCategoryFilters((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])} type="button">{category.name} <small>{adultData.library.filter((anime) => anime.tags.some((item) => item.id === category.id)).length}</small></button>}
                      renderMore={(hasHiddenActive) => <button aria-label="查看更多成人動漫類別" className={hasHiddenActive ? "anime-category-utility active" : "anime-category-utility"} onClick={() => setCategoryMoreOpen(true)} type="button">更多</button>}
                      rowClassName="anime-category-scroll-row"
                    />
                  </section>
                  <AnimeCollectionList
                    adult
                    blur={preferences.blurAdultCovers}
                    categories={adultData.tags}
                    folders={adultData.folders}
                    items={adultData.library.filter(
                      (anime) =>
                        (!adultFolderFilters.length ||
                          anime.folderIds.some((folderId) => adultFolderFilters.includes(folderId))) &&
                        (!adultCategoryFilters.length ||
                          anime.tags.some(
                            (category) => adultCategoryFilters.includes(category.id),
                          )) &&
                        `${displayTitle(anime)} ${anime.notes ?? ""} ${anime.tags.map((tag) => tag.name).join(" ")}`
                          .toLocaleLowerCase()
                          .includes(adultQuery.trim().toLocaleLowerCase()),
                    )}
                    onMutated={async () => {
                      await Promise.all([
                        refreshAdult(),
                        refreshTrash("adult"),
                      ]);
                    }}
                    onOpen={(anime) => {
                      setSelectedReadOnly(false);
                      setSelected(anime);
                    }}
                    onStatusChange={updateWatchStatus}
                    scope="adult"
                  />
                </>
              ) : (
                <AnimeCollectionList
                  adult
                  blur={preferences.blurAdultCovers}
                  categories={adultTrashData?.tags ?? adultData.tags}
                  folders={adultData.folders}
                  items={adultTrashData?.library ?? []}
                  onMutated={async () => {
                    await Promise.all([refreshAdult(), refreshTrash("adult")]);
                  }}
                  onOpen={(anime) => {
                    setSelectedReadOnly(true);
                    setSelected(anime);
                  }}
                  scope="adult"
                  trashed
                />
              )}
              {adultLibraryView === "library" && !adultData.library.length && (
                <div className="anime-empty">
                  <h3>尚未新增成人作品</h3>
                  <p>可使用上方按鈕自行記錄成人作品與觀看連結。</p>
                </div>
              )}
            </>
          ) : (
            <AnimeDiscovery
              adultMode
              library={adultData.library}
              onAdd={(anime) => quickAddExternal(anime, true)}
            />
          )}
        </section>
      )}
      {tab === "adult" && adultUnlocked && adultData && (
        <>
          <ModalDialog
            className="mobile-sheet-dialog"
            onClose={() => setCategoryAddOpen(false)}
            open={categoryAddOpen}
            pending={pending === "category"}
            title="新增成人動漫類別"
          >
            <form
              className="anime-category-dialog"
              onSubmit={(event) => {
                event.preventDefault();
                void createCategory("adult");
              }}
            >
              <label>
                類別名稱
                <input
                  autoFocus
                  disabled={Boolean(pending)}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="例如：收藏、系列"
                  value={categoryName}
                />
              </label>
              <div className="dialog-actions">
                <button
                  className="secondary-button"
                  disabled={Boolean(pending)}
                  onClick={() => setCategoryAddOpen(false)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="button"
                  disabled={Boolean(pending) || !categoryName.trim()}
                  type="submit"
                >
                  新增類別
                </button>
              </div>
            </form>
          </ModalDialog>
          <ModalDialog
            className="mobile-sheet-dialog"
            onClose={() => setCategoryMoreOpen(false)}
            open={categoryMoreOpen}
            title="成人動漫類別"
          >
            <div className="anime-category-dialog">
              <p>選擇目前資料夾的類別以篩選成人作品。</p>
              <input
                aria-label="搜尋成人動漫類別"
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder="搜尋類別"
                value={categoryQuery}
              />
              <div className="anime-category-manager-list">
                <button
                  className={!adultCategoryFilters.length ? "active" : ""}
                  onClick={() => {
                    setAdultCategoryFilters([]);
                    setCategoryMoreOpen(false);
                  }}
                  type="button"
                >
                  所有類別
                </button>
                {adultData.tags
                  .filter(
                    (item) =>
                      (!adultFolderFilters.length ||
                        item.folderId === null || (item.folderId !== null && adultFolderFilters.includes(item.folderId))) &&
                      item.name
                        .toLocaleLowerCase()
                        .includes(categoryQuery.trim().toLocaleLowerCase()),
                  )
                  .map((item) => (
                    <button
                      className={
                        adultCategoryFilters.includes(item.id) ? "active" : ""
                      }
                      key={item.id}
                      onClick={() => {
                        setAdultCategoryFilters((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
                      }}
                      type="button"
                    >
                      {item.name}{" "}
                      <small>
                        {
                          adultData.library.filter((anime) =>
                            anime.tags.some((tag) => tag.id === item.id),
                          ).length
                        }
                      </small>
                    </button>
                  ))}
              </div>
            </div>
          </ModalDialog>
        </>
      )}
      {tab === "library" && (
        <>
          <div className="anime-filter-bar">
            <div className="anime-filter-scroll bookmark-view-tabs">
              {visibleFilters.map((value) => (
                <button
                  className={
                    `${value !== "all" && value !== "planning" ? "anime-status-filter-extra " : ""}${libraryView === "library" && !folderFilters.length && filter === value ? "active" : ""}`
                  }
                  key={value}
                  onClick={() => selectLibraryStatus(value)}
                  type="button"
                >
                  {value === "all" ? "全部" : animeStatusLabels[value]}
                </button>
              ))}
            </div>
            <input
              aria-label="搜尋自己的動漫"
              ref={librarySearch}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋名稱、類別或備註"
              value={query}
            />
            <button
              aria-expanded={filterOpen}
              className="secondary-button compact anime-mobile-filter"
              onClick={openLibraryFilters}
              type="button"
            >
              篩選{filter === "all" ? "" : `：${animeStatusLabels[filter]}`}
            </button>
          </div>
          <AnimeFolderNavigation
            collectionLayout
            folders={data.folders}
            inline
            onChange={(folderIds) => {
              setLibraryView("library");
              setFilter("all");
              setFolderFilters(folderIds);
            }}
            onFoldersChange={(folders) =>
              setData((current) => ({ ...current, folders }))
            }
            manageSignal={folderManageSignal}
            onTrash={() => {
              setFilter("all");
              setFolderFilters([]);
              setCategoryFilters([]);
              void openTrash("standard");
            }}
            scope="standard"
            selectedIds={folderFilters}
            trashCount={trashData?.library.length ?? 0}
            trashSelected={libraryView === "trash"}
          />
          {libraryView === "library" ? (
            <>
              <section className="anime-category-bar collection-navigation-section" aria-label="動漫類別" data-anime-scope="standard" data-chip-overflow-container>
                <header>
                  <strong>類別</strong>
                  <div data-chip-overflow-actions>
                    <button
                      aria-label="管理動漫類別"
                      className="collection-navigation-action"
                      onClick={() => setCategoryManageScope("standard")}
                      type="button"
                    >
                      管理
                    </button>
                    <button
                      aria-label="新增動漫類別"
                      className="collection-navigation-action primary"
                      onClick={() => setCategoryAddOpen(true)}
                      type="button"
                    >
                      ＋ 新增
                    </button>
                  </div>
                </header>
                <ResponsiveChipOverflow
                  activeIds={categoryFilters}
                  className="anime-category-scroll bookmark-view-tabs collection-category-strip"
                  leadingCount={1}
                  items={standardScopedTags}
                  itemId={(category) => category.id}
                  itemMeasureKey={(category) => `${category.name}|${data.library.filter((anime) => anime.tags.some((item) => item.id === category.id)).length}`}
                  leading={<button className={!categoryFilters.length ? "active" : ""} onClick={() => setCategoryFilters([])} type="button">所有類別</button>}
                  renderItem={(category) => <button className={categoryFilters.includes(category.id) ? "active" : ""} key={category.id} onClick={() => setCategoryFilters((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])} type="button">{category.name} <small>{data.library.filter((anime) => anime.tags.some((item) => item.id === category.id)).length}</small></button>}
                  renderMore={(hasHiddenActive) => <button aria-label="查看更多類別" className={hasHiddenActive ? "anime-category-utility active" : "anime-category-utility"} onClick={() => setCategoryMoreOpen(true)} type="button">更多</button>}
                  rowClassName="anime-category-scroll-row"
                />
              </section>
              {!loaded ? (
                <AnimeGridSkeleton />
              ) : (
                <AnimeCollectionList
                  categories={data.tags}
                  folders={data.folders}
                  items={pagedLibrary}
                  onGridColumnsChange={setLibraryGridColumns}
                  onMutated={async () => {
                    await Promise.all([refresh(), refreshTrash("standard")]);
                  }}
                  onOpen={(anime) => {
                    setSelectedReadOnly(false);
                    setSelected(anime);
                  }}
                  onStatusChange={updateWatchStatus}
                  scope="standard"
                />
              )}
              {library.length > libraryPageSize && (
                <nav aria-label="我的動漫分頁" className="anime-pagination">
                  <button
                    aria-label="第一頁"
                    className="secondary-button compact"
                    disabled={activeLibraryPage === 1}
                    onClick={() => setLibraryPage(1)}
                    type="button"
                  >
                    第一頁
                  </button>
                  <button
                    aria-label="上一頁"
                    className="secondary-button compact"
                    disabled={activeLibraryPage === 1}
                    onClick={() =>
                      setLibraryPage((current) => Math.max(1, current - 1))
                    }
                    type="button"
                  >
                    上一頁
                  </button>
                  {Array.from(
                    { length: libraryPageCount },
                    (_, index) => index + 1,
                  )
                    .slice(
                      Math.max(0, activeLibraryPage - 4),
                      Math.min(libraryPageCount, activeLibraryPage + 3),
                    )
                    .map((number) => (
                      <button
                        aria-current={
                          number === activeLibraryPage ? "page" : undefined
                        }
                        className={number === activeLibraryPage ? "active" : ""}
                        key={number}
                        onClick={() => setLibraryPage(number)}
                        type="button"
                      >
                        {number}
                      </button>
                    ))}
                  <button
                    aria-label="下一頁"
                    className="secondary-button compact"
                    disabled={activeLibraryPage === libraryPageCount}
                    onClick={() =>
                      setLibraryPage((current) =>
                        Math.min(libraryPageCount, current + 1),
                      )
                    }
                    type="button"
                  >
                    下一頁
                  </button>
                  <button
                    aria-label="最後一頁"
                    className="secondary-button compact"
                    disabled={activeLibraryPage === libraryPageCount}
                    onClick={() => setLibraryPage(libraryPageCount)}
                    type="button"
                  >
                    最後一頁
                  </button>
                </nav>
              )}
              {!library.length && (
                <div className="anime-empty">
                  <h3>
                    {data.library.length
                      ? "找不到符合的動漫"
                      : "還沒有加入動漫"}
                  </h3>
                  <button
                    className="button compact"
                    onClick={() => setAdding(true)}
                    type="button"
                  >
                    ＋ 新增動漫
                  </button>
                </div>
              )}
            </>
          ) : (
            <AnimeCollectionList
              categories={trashData?.tags ?? data.tags}
              folders={data.folders}
              items={trashData?.library ?? []}
              onMutated={async () => {
                await Promise.all([refresh(), refreshTrash("standard")]);
              }}
              onOpen={(anime) => {
                setSelectedReadOnly(true);
                setSelected(anime);
              }}
              scope="standard"
              trashed
            />
          )}
          <ModalDialog
            className="mobile-sheet-dialog"
            onClose={() => setFilterOpen(false)}
            open={filterOpen}
            title="篩選我的動漫"
          >
            <div className="anime-mobile-filter-panel">
              <section>
                <header><div><strong>觀看狀態</strong><span>可與資料夾、類別一起篩選</span></div><button onClick={() => setLibraryFilterDraft((current) => ({ ...current, status: "all" }))} type="button">清除</button></header>
                <div className="anime-mobile-filter-options">
                {visibleFilters.map((value) => (
                  <button
                    className={libraryFilterDraft.status === value ? "active" : ""}
                    key={value}
                    onClick={() => setLibraryFilterDraft((current) => ({ ...current, status: value }))}
                    type="button"
                  >
                    {value === "all" ? "全部" : animeStatusLabels[value]}
                  </button>
                ))}
                </div>
              </section>
              <section>
                <header><div><strong>資料夾（可複選）</strong><span>符合任一選取資料夾時顯示</span></div><button onClick={() => setLibraryFilterDraft((current) => ({ ...current, folderIds: [] }))} type="button">清除</button></header>
                <div className="anime-mobile-filter-options">
                  {data.folders.filter((folder) => folder.isVisible).map((folder) => <button className={libraryFilterDraft.folderIds.includes(folder.id) ? "active" : ""} key={folder.id} onClick={() => setLibraryFilterDraft((current) => { const folderIds = toggledFolderIds(current.folderIds, folder.id); return { ...current, folderIds, categoryIds: current.categoryIds.filter((categoryId) => { const category = data.tags.find((item) => item.id === categoryId); return !category?.folderId || folderIds.includes(category.folderId); }) }; })} type="button">{libraryFilterDraft.folderIds.includes(folder.id) ? "✓ " : ""}{folder.name}</button>)}
                  {!data.folders.length && <span className="anime-mobile-filter-empty">尚未建立資料夾</span>}
                </div>
                <button className="anime-mobile-filter-manage" onClick={() => { setFilterOpen(false); setFolderManageSignal((value) => value + 1); }} type="button">管理資料夾</button>
              </section>
              <section>
                <header><div><strong>類別（可複選）</strong><span>只顯示目前資料夾可用的類別</span></div><button onClick={() => setLibraryFilterDraft((current) => ({ ...current, categoryIds: [] }))} type="button">清除</button></header>
                <div className="anime-mobile-filter-options">
                  {data.tags.filter((category) => !libraryFilterDraft.folderIds.length || category.folderId === null || (category.folderId && libraryFilterDraft.folderIds.includes(category.folderId))).map((category) => <button className={libraryFilterDraft.categoryIds.includes(category.id) ? "active" : ""} key={category.id} onClick={() => setLibraryFilterDraft((current) => ({ ...current, categoryIds: current.categoryIds.includes(category.id) ? current.categoryIds.filter((id) => id !== category.id) : [...current.categoryIds, category.id] }))} type="button">{libraryFilterDraft.categoryIds.includes(category.id) ? "✓ " : ""}{category.name}</button>)}
                  {!data.tags.length && <span className="anime-mobile-filter-empty">尚未建立類別</span>}
                </div>
                <button className="anime-mobile-filter-manage" onClick={() => { setFilterOpen(false); setCategoryManageScope("standard"); }} type="button">管理類別</button>
              </section>
              <div className="anime-mobile-filter-summary"><strong>目前選擇</strong><span>{libraryFilterDraft.status === "all" ? "全部狀態" : animeStatusLabels[libraryFilterDraft.status]} · {libraryFilterDraft.folderIds.length ? `${libraryFilterDraft.folderIds.length} 個資料夾` : "全部資料夾"} · {libraryFilterDraft.categoryIds.length ? `${libraryFilterDraft.categoryIds.length} 個類別` : "全部類別"}</span></div>
              <div className="dialog-actions anime-mobile-filter-actions"><button className="secondary-button" onClick={() => setLibraryFilterDraft({ status: "all", folderIds: [], categoryIds: [] })} type="button">全部清除</button><button className="button" onClick={applyLibraryFilters} type="button">套用篩選</button></div>
            </div>
          </ModalDialog>
          <ModalDialog
            className="mobile-sheet-dialog"
            onClose={() => setCategoryAddOpen(false)}
            open={categoryAddOpen}
            pending={pending === "category"}
            title="新增動漫類別"
          >
            <form
              className="anime-category-dialog"
              onSubmit={(event) => {
                event.preventDefault();
                void createCategory("standard");
              }}
            >
              <label>
                類別名稱
                <input
                  autoFocus
                  disabled={Boolean(pending)}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="例如：搞笑、動畫"
                  value={categoryName}
                />
              </label>
              <div className="dialog-actions">
                <button
                  className="secondary-button"
                  disabled={Boolean(pending)}
                  onClick={() => setCategoryAddOpen(false)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="button"
                  disabled={Boolean(pending) || !categoryName.trim()}
                  type="submit"
                >
                  新增類別
                </button>
              </div>
            </form>
          </ModalDialog>
          <ModalDialog
            className="mobile-sheet-dialog"
            onClose={() => setCategoryMoreOpen(false)}
            open={categoryMoreOpen}
            title="動漫類別"
          >
            <div className="anime-category-dialog">
              <p>選擇目前資料夾的類別以篩選我的動漫。</p>
              <input
                aria-label="搜尋動漫類別"
                onChange={(event) => setCategoryQuery(event.target.value)}
                placeholder="搜尋類別"
                value={categoryQuery}
              />
              <div className="anime-category-manager-list">
                <button
                  className={!categoryFilters.length ? "active" : ""}
                  onClick={() => {
                    setCategoryFilters([]);
                    setCategoryMoreOpen(false);
                  }}
                  type="button"
                >
                  所有類別
                </button>
                {data.tags
                  .filter(
                    (item) =>
                      (!folderFilters.length || item.folderId === null || (item.folderId !== null && folderFilters.includes(item.folderId))) &&
                      item.name
                        .toLocaleLowerCase()
                        .includes(categoryQuery.trim().toLocaleLowerCase()),
                  )
                  .map((item) => (
                    <button
                      className={categoryFilters.includes(item.id) ? "active" : ""}
                      key={item.id}
                      onClick={() => {
                        setCategoryFilters((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
                      }}
                      type="button"
                    >
                      {item.name}{" "}
                      <small>
                        {
                          data.library.filter((anime) =>
                            anime.tags.some((tag) => tag.id === item.id),
                          ).length
                        }
                      </small>
                    </button>
                  ))}
              </div>
            </div>
          </ModalDialog>
        </>
      )}
      {tab === "stats" && (
        <AnimeStats
          data={data}
          onSelectStatus={(status) => {
            setTab("library");
            selectLibraryStatus(status);
            setLibraryPage(1);
          }}
        />
      )}
      {adding && (
        <AnimeEditor
          adult={tab === "adult"}
          categories={tab === "adult" ? (adultData?.tags ?? []) : data.tags}
          defaultFolderId={tab === "adult" ? (adultFolderFilters[0] ?? null) : (folderFilters[0] ?? null)}
          folders={tab === "adult" ? (adultData?.folders ?? []) : data.folders}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            if (tab === "adult") await refreshAdult();
            else await refresh();
            setNotice(tab === "adult" ? "已新增成人作品。" : "已新增動漫。");
          }}
        />
      )}
      {prefill && (
        <AnimeEditor
          categories={data.tags}
          defaultFolderId={folderFilters[0] ?? null}
          folders={data.folders}
          prefill={prefill}
          onClose={() => setPrefill(null)}
          onSaved={async () => {
            setPrefill(null);
            await refresh();
            setNotice("已新增動漫。");
          }}
        />
      )}
      {adultPrefill && (
        <AnimeEditor
          adult
          categories={adultData?.tags ?? []}
          defaultFolderId={adultFolderFilters[0] ?? null}
          folders={adultData?.folders ?? []}
          prefill={adultPrefill}
          onClose={() => setAdultPrefill(null)}
          onSaved={async () => {
            setAdultPrefill(null);
            await refreshAdult();
            setNotice("已新增成人作品。");
          }}
        />
      )}
      {selected && (
        <AnimeDetailDialog
          anime={selected}
          onClose={() => setSelected(null)}
          onEdit={
            selectedReadOnly
              ? undefined
              : () => {
                  setEditing(selected);
                  setSelected(null);
                }
          }
        />
      )}
      {editing && (
        <AnimeEditor
          anime={editing}
          categories={editing.isAdult ? (adultData?.tags ?? []) : data.tags}
          folders={editing.isAdult ? (adultData?.folders ?? []) : data.folders}
          onClose={() => setEditing(null)}
          onRemove={() => {
            setRemoving(editing);
            setEditing(null);
          }}
          onOptimisticChange={(next) => {
            if (next.isAdult) {
              setAdultData((current) => current ? { ...current, library: current.library.map((item) => item.id === next.id ? next : item) } : current);
            } else {
              setData((current) => ({ ...current, library: current.library.map((item) => item.id === next.id ? next : item) }));
            }
          }}
          onSaved={async () => {
            const wasAdult = editing.isAdult;
            if (wasAdult) {
              await refreshAdult();
              setAdultView("library");
              setTab("adult");
            } else await refresh();
            setEditing(null);
            setNotice("已儲存動漫資料。");
          }}
        />
      )}
      {categoryManageScope && <AnimeCategoryManager
        key={`${categoryManageScope}:${categoryManageScope === "adult" ? adultFolderFilters[0] ?? "unorganized" : folderFilters[0] ?? "unorganized"}`}
        folderId={categoryManageScope === "adult" ? (adultFolderFilters[0] ?? null) : (folderFilters[0] ?? null)}
        onChange={(tags, removedIds) => {
          if (categoryManageScope === "adult") {
            setAdultData((current) => current ? { ...current, tags, library: current.library.map((anime) => ({ ...anime, tags: anime.tags.filter((tag) => !removedIds.includes(tag.id)) })) } : current);
            setAdultCategoryFilters((current) => current.filter((id) => !removedIds.includes(id)));
          } else {
            setData((current) => ({ ...current, tags, library: current.library.map((anime) => ({ ...anime, tags: anime.tags.filter((tag) => !removedIds.includes(tag.id)) })) }));
            setCategoryFilters((current) => current.filter((id) => !removedIds.includes(id)));
          }
          setNotice("已儲存類別整理結果。");
        }}
        onClose={() => setCategoryManageScope(null)}
        open
        scope={categoryManageScope}
        tags={categoryManageScope === "adult" ? (adultData?.tags ?? []) : data.tags}
      />}
      <ConfirmDialog
        confirmLabel="移至垃圾桶"
        description={
          removing ? `確定要將《${removing.title}》移至垃圾桶嗎？` : ""
        }
        onCancel={() => setRemoving(null)}
        onConfirm={() => void remove()}
        open={Boolean(removing)}
        pending={pending === "remove"}
        title="移除我的動漫"
      />
      <ModalDialog
        className="mobile-sheet-dialog pin-verification-dialog"
        onClose={() => {
          if (!pending) setAdultPinPrompt(false);
        }}
        open={adultPinPrompt}
        pending={pending === "adult-access"}
        title="解鎖成人內容"
      >
        <GlassyPinVerification
          embedded
          length={preferences.adultAccessMode === "pin6" ? 6 : 4}
          title="解鎖成人內容"
          description={`請輸入獨立的 ${preferences.adultAccessMode === "pin6" ? "6" : "4"} 位數成人區 PIN。`}
          verifyPin={verifyAdultPin}
          onVerified={finishAdultPinUnlock}
          onCancel={() => setAdultPinPrompt(false)}
          onStateChange={(state) => setPending(state === "centering" || state === "verifying" || state === "success" ? "adult-access" : null)}
        />
      </ModalDialog>
    </section>
  );
}

function AnimeGridSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="正在載入動漫"
      className="anime-grid anime-grid-skeleton"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div className="anime-card" key={index}>
          <div className="anime-card-main">
            <span className="skeleton-block skeleton-cover" />
            <div className="anime-card-copy">
              <span className="skeleton-block skeleton-line short" />
              <span className="skeleton-block skeleton-line" />
              <span className="skeleton-block skeleton-line medium" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnimeStats({
  data,
  onSelectStatus,
}: {
  data: AnimeWorkspaceData;
  onSelectStatus: (status: AnimeWatchStatus) => void;
}) {
  const [statusChart, setStatusChart] = useState<
    "list" | "bars" | "donut"
  >("donut");
  const scores = data.library.flatMap((anime) =>
    anime.rating === null ? [] : [anime.rating],
  );
  const average = scores.length
    ? (
        scores.reduce((total, score) => total + score, 0) / scores.length
      ).toFixed(1)
    : "—";
  const statusCounts = visibleFilters
    .filter((status): status is AnimeWatchStatus => status !== "all")
    .map((status) => ({
    status,
    count: data.library.filter((anime) => anime.watchStatus === status).length,
    }));
  const totalAnime = data.library.length;
  const completedCount =
    statusCounts.find(({ status }) => status === "completed")?.count ?? 0;
  const watchingCount =
    statusCounts.find(({ status }) => status === "watching")?.count ?? 0;
  const planningCount =
    statusCounts.find(({ status }) => status === "planning")?.count ?? 0;
  const favouriteCount = data.library.filter((anime) => anime.favorite).length;
  const completionRate = totalAnime
    ? Math.round((completedCount / totalAnime) * 100)
    : 0;
  const categoriesById = new Map<string, { name: string; count: number }>();
  data.library.forEach((anime) => {
    anime.tags.forEach((tag) => {
      const current = categoriesById.get(tag.id);
      categoriesById.set(tag.id, {
        name: tag.name,
        count: (current?.count ?? 0) + 1,
      });
    });
  });
  const topCategories = Array.from(categoriesById.values())
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 5);
  const largestCategoryCount = Math.max(
    1,
    ...topCategories.map((category) => category.count),
  );
  const ratingGroups = [
    { label: "9–10 分", min: 9, max: 10, color: "#c98119" },
    { label: "7–8 分", min: 7, max: 8, color: "#4f78cd" },
    { label: "5–6 分", min: 5, max: 6, color: "#6f67a7" },
    { label: "1–4 分", min: 1, max: 4, color: "#aeb9ca" },
  ].map((group) => ({
    ...group,
    count: scores.filter(
      (score) => score >= group.min && score <= group.max,
    ).length,
  }));
  const largestRatingGroup = Math.max(
    1,
    ...ratingGroups.map((group) => group.count),
  );
  const statusChartColors: Record<AnimeWatchStatus, string> = {
    planning: "#2d67c7",
    watching: "#21896c",
    completed: "#8062c8",
    paused: "#c98c22",
    dropped: "#c95478",
  };
  const formatPercentage = (count: number) =>
    `${totalAnime ? ((count / totalAnime) * 100).toFixed(1) : "0.0"}%`;
  let donutOffset = 0;
  const donutSegments = statusCounts.map(({ status, count }) => {
    const percentage = totalAnime ? (count / totalAnime) * 100 : 0;
    const segment = { status, count, percentage, offset: donutOffset };
    donutOffset += percentage;
    return segment;
  });
  const selectFromChart = (status: AnimeWatchStatus) => onSelectStatus(status);
  const selectFromChartKey = (
    event: KeyboardEvent<SVGCircleElement>,
    status: AnimeWatchStatus,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectFromChart(status);
  };
  return (
    <div className="anime-stats-dashboard">
      <section className="anime-stats-hero">
        <div className="anime-stats-hero-copy">
          <p className="eyebrow">ANIME LIBRARY INSIGHTS</p>
          <h2>你的觀看輪廓</h2>
          <p>
            從收藏進度、觀看狀態與分類偏好，快速掌握下一部值得打開的作品。
          </p>
        </div>
        <div className="anime-stats-hero-summary">
          <div className="anime-stats-hero-total">
            <span>收藏作品</span>
            <strong>{totalAnime}</strong>
            <small>部</small>
          </div>
          <div className="anime-stats-hero-progress">
            <span>收藏完成度</span>
            <strong>{completionRate}%</strong>
            <i aria-hidden="true">
              <b style={{ width: `${completionRate}%` }} />
            </i>
            <small>已看完 {completedCount} 部</small>
          </div>
        </div>
      </section>

      <div className="anime-stats-grid anime-stats-overview">
        <article>
          <small>總收藏</small>
          <strong>{totalAnime}</strong>
          <span>部動漫</span>
        </article>
        <article>
          <small>正在觀看</small>
          <strong>{watchingCount}</strong>
          <span>持續追番中</span>
        </article>
        <article>
          <small>已看完</small>
          <strong>{completedCount}</strong>
          <span>{completionRate}% 收藏完成</span>
        </article>
        <article>
          <small>想看清單</small>
          <strong>{planningCount}</strong>
          <span>部等待開播</span>
        </article>
        <article>
          <small>平均評分</small>
          <strong>{average}</strong>
          <span>{scores.length ? `${scores.length} 部已評分` : "尚未評分"}</span>
        </article>
      </div>
      <div className="anime-stats-detail-grid">
        <section className="anime-status-summary anime-stats-panel">
          <header className="anime-status-chart-header">
            <div>
              <p className="eyebrow">WATCHING MIX</p>
              <h2>觀看狀態</h2>
              <p>共 {totalAnime} 部作品</p>
            </div>
            <div aria-label="觀看狀態圖表類型" className="anime-chart-tabs">
              <button
                aria-pressed={statusChart === "list"}
                className={statusChart === "list" ? "active" : ""}
                onClick={() => setStatusChart("list")}
                type="button"
              >
                清單
              </button>
              <button
                aria-pressed={statusChart === "bars"}
                className={statusChart === "bars" ? "active" : ""}
                onClick={() => setStatusChart("bars")}
                type="button"
              >
                長條圖
              </button>
              <button
                aria-pressed={statusChart === "donut"}
                className={statusChart === "donut" ? "active" : ""}
                onClick={() => setStatusChart("donut")}
                type="button"
              >
                圓環圖
              </button>
            </div>
          </header>
          {statusChart === "list" ? (
            <div className="anime-status-list anime-status-chart-content">
              {statusCounts.map(({ status, count }) => (
                <button
                  aria-label={`篩選${animeStatusLabels[status]}，${count} 部，${formatPercentage(count)}`}
                  key={status}
                  onClick={() => selectFromChart(status)}
                  type="button"
                >
                  <span className="anime-status-list-label">
                    <Status value={status} />
                  </span>
                  <strong>{count} <small>部</small></strong>
                  <em>{formatPercentage(count)}</em>
                </button>
              ))}
            </div>
          ) : statusChart === "bars" ? (
            <div className="anime-status-bars anime-status-chart-content">
              {statusCounts.map(({ status, count }) => (
                <button
                  aria-label={`篩選${animeStatusLabels[status]}，${count} 部，${formatPercentage(count)}`}
                  className="anime-status-bar"
                  key={status}
                  onClick={() => selectFromChart(status)}
                  type="button"
                >
                  <span className="anime-status-bar-header">
                    <Status value={status} />
                    <strong>{count} 部 <em>{formatPercentage(count)}</em></strong>
                  </span>
                  <span aria-hidden="true" className="anime-status-bar-track">
                    <i
                      style={{
                        background: statusChartColors[status],
                        width: `${totalAnime ? (count / totalAnime) * 100 : 0}%`,
                      }}
                    />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="anime-status-donut-layout anime-status-chart-content">
              <div
                aria-label={`觀看狀態圓環圖，共 ${totalAnime} 部作品。點選扇形可篩選。`}
                className="anime-status-donut"
                role="group"
              >
                <svg viewBox="0 0 120 120">
                  <circle
                    className="anime-status-donut-track"
                    cx="60"
                    cy="60"
                    fill="none"
                    r="42"
                    strokeWidth="16"
                  />
                  {donutSegments.map(({ status, count, percentage, offset }) => (
                    <circle
                      aria-label={`篩選${animeStatusLabels[status]}，${count} 部，${formatPercentage(count)}`}
                      className="anime-status-donut-segment"
                      cx="60"
                      cy="60"
                      fill="none"
                      key={status}
                      onClick={() => selectFromChart(status)}
                      onKeyDown={(event) => selectFromChartKey(event, status)}
                      pathLength="100"
                      r="42"
                      role="button"
                      stroke={statusChartColors[status]}
                      strokeDasharray={`${percentage} ${100 - percentage}`}
                      strokeDashoffset={-offset}
                      strokeWidth="16"
                      tabIndex={0}
                    />
                  ))}
                  <text className="anime-status-donut-total" x="60" y="57">
                    {totalAnime}
                  </text>
                  <text className="anime-status-donut-label" x="60" y="72">
                    部作品
                  </text>
                </svg>
              </div>
              <div className="anime-status-legend">
                {statusCounts.map(({ status, count }) => (
                  <button
                    aria-label={`篩選${animeStatusLabels[status]}，${count} 部，${formatPercentage(count)}`}
                    key={status}
                    onClick={() => selectFromChart(status)}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      style={{ background: statusChartColors[status] }}
                    />
                    <Status value={status} />
                    <strong>{count} 部</strong>
                    <em>{formatPercentage(count)}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="anime-stats-panel anime-insight-panel">
          <header className="anime-insight-header">
            <div>
              <p className="eyebrow">CATEGORY TASTE</p>
              <h2>分類偏好</h2>
            </div>
            <strong>{topCategories.length ? "Top 5" : "尚無資料"}</strong>
          </header>
          {topCategories.length ? (
            <div className="anime-insight-bars">
              {topCategories.map((category) => (
                <div key={category.name}>
                  <span>{category.name}</span>
                  <strong>{category.count} 部</strong>
                  <i aria-hidden="true">
                    <b
                      style={{
                        width: `${(category.count / largestCategoryCount) * 100}%`,
                      }}
                    />
                  </i>
                </div>
              ))}
            </div>
          ) : (
            <p className="anime-insight-empty">替作品加入類別後，這裡會顯示你的收藏偏好。</p>
          )}
        </section>

        <section className="anime-stats-panel anime-insight-panel">
          <header className="anime-insight-header">
            <div>
              <p className="eyebrow">RATING MOOD</p>
              <h2>評分分布</h2>
            </div>
            <strong>{scores.length} 部已評分</strong>
          </header>
          {scores.length ? (
            <div className="anime-rating-bars">
              {ratingGroups.map((group) => (
                <div key={group.label}>
                  <span>{group.label}</span>
                  <i aria-hidden="true">
                    <b
                      style={{
                        background: group.color,
                        width: `${(group.count / largestRatingGroup) * 100}%`,
                      }}
                    />
                  </i>
                  <strong>{group.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="anime-insight-empty">為作品留下評分後，這裡會整理你的喜好分布。</p>
          )}
          <p className="anime-favourite-note">
            {favouriteCount ? `已標記 ${favouriteCount} 部最愛作品。` : "尚未標記最愛作品。"}
          </p>
        </section>
      </div>
    </div>
  );
}

function AnimeDetailDialog({
  anime,
  onClose,
  onEdit,
}: {
  anime: AnimeLibraryItem;
  onClose: () => void;
  onEdit?: () => void;
}) {
  const names = [
    anime.titleJapanese,
    anime.titleEnglish,
    anime.titleChinese,
    anime.originalTitle,
  ].filter(
    (value, index, values): value is string =>
      Boolean(value) && values.indexOf(value) === index,
  );
  const metadata = [
    anime.animeType,
    anime.broadcastStatus,
    anime.releaseYear ? `${anime.releaseYear} 年` : null,
    anime.episodes ? `${anime.episodes} 集` : null,
    anime.publicScore ? `公開評分 ${anime.publicScore}` : null,
  ].filter((value): value is string => Boolean(value));
  return (
    <ModalDialog onClose={onClose} open title="動漫詳細資訊">
      <div className="anime-detail">
        <div className="anime-detail-hero">
          {anime.bannerUrl && <img alt="" src={anime.bannerUrl} />}
          <div>
            <Cover anime={anime} />
            <div>
              <Status value={anime.watchStatus} />
              <h3>{displayTitle(anime)}</h3>
              {names.length > 0 && <p>{names.join(" · ")}</p>}
              <div className="anime-detail-rating">
                <StarRating readonly value={anime.rating} />{" "}
                <span>
                  {anime.rating === null ? "尚未評分" : `${anime.rating} / 10`}
                </span>
              </div>
            </div>
          </div>
        </div>
        {metadata.length > 0 && (
          <div className="anime-detail-metadata">
            {metadata.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        )}
        {anime.tags.length > 0 && (
          <section>
            <h4>類別</h4>
            <div className="anime-tags">
              {anime.tags.map((category) => (
                <span key={category.id}>{category.name}</span>
              ))}
            </div>
          </section>
        )}
        {anime.synopsis && (
          <section>
            <h4>劇情介紹</h4>
            <p>{anime.synopsis}</p>
          </section>
        )}
        {anime.notes && (
          <section>
            <h4>私人備註</h4>
            <p>{anime.notes}</p>
          </section>
        )}
        {anime.sourceUrl && (
          <section className="anime-view-link">
            <h4>觀看連結</h4>
            {anime.isAdult ? (
              <>
                <a
                  className="button compact"
                  href={anime.sourceUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  在新分頁開啟連結
                </a>
                <p className="anime-field-hint">
                  此連結不會收到 Personal Vault 的來源資訊。
                </p>
              </>
            ) : (
              <a
                className="button compact"
                href={anime.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                ▶ 前往觀看
              </a>
            )}
          </section>
        )}
        <div className="dialog-actions anime-detail-view-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            關閉
          </button>
          {onEdit && (
            <button className="button" onClick={onEdit} type="button">
              修改
            </button>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}

function AnimeEditor({
  anime,
  prefill,
  adult = false,
  categories,
  folders,
  defaultFolderId = null,
  onClose,
  onSaved,
  onRemove,
  onOptimisticChange,
}: {
  anime?: AnimeLibraryItem;
  prefill?: ExternalAnime;
  adult?: boolean;
  categories: AnimeTag[];
  folders: AnimeWorkspaceData["folders"];
  defaultFolderId?: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onRemove?: () => void;
  onOptimisticChange?: (next: AnimeLibraryItem) => void;
}) {
  const backgroundSave = useBackgroundSave();
  const [title, setTitle] = useState(
    anime?.title ?? prefill?.titleChinese ?? prefill?.title ?? "",
  );
  const [sourceUrl, setSourceUrl] = useState(anime?.sourceUrl ?? "");
  const [watchStatus, setWatchStatus] = useState<AnimeWatchStatus>(
    anime?.watchStatus === "paused" ? "planning" : anime?.watchStatus ?? "planning",
  );
  const [rating, setRating] = useState<number | null>(anime?.rating ?? null);
  const [notes, setNotes] = useState(anime?.notes ?? "");
  const [categoryIds, setCategoryIds] = useState(
    anime?.tags.map((category) => category.id) ?? [],
  );
  const [folderIds, setFolderIds] = useState<string[]>(
    anime?.folderIds ?? (anime?.folderId ? [anime.folderId] : defaultFolderId ? [defaultFolderId] : []),
  );
  const [cover, setCover] = useState<CoverSelection>(null);
  const pending = false;
  const [message, setMessage] = useState<string | null>(null);
  const isAdult = adult || Boolean(anime?.isAdult) || Boolean(prefill?.isAdult);
  const [contentRating, setContentRating] = useState(
    anime?.contentRating ??
      prefill?.contentRating ??
      (isAdult ? "成人內容" : ""),
  );
  const [adultSource, setAdultSource] = useState(
    anime?.adultSource ?? "manual",
  );
  const save = async () => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      setMessage("請輸入動漫名稱。");
      return;
    }
    setMessage(null);
    const selectedCover = cover;
    let coverTicket: string | null = null;
    const body = {
      ...(anime ? { id: anime.id } : {}),
      title: normalizedTitle,
      sourceUrl: sourceUrl.trim() || null,
      externalUrl: isAdult ? sourceUrl.trim() || null : undefined,
      isAdult,
      contentRating: isAdult ? contentRating.trim() || "成人內容" : null,
      adultSource: isAdult ? adultSource.trim() || "manual" : null,
      coverUrl: !selectedCover && !anime ? (prefill?.coverUrl ?? null) : undefined,
      metadata: !anime && prefill ? prefill : undefined,
      externalId: !anime && prefill ? prefill.id : undefined,
      externalSource: !anime && prefill ? prefill.source : undefined,
      coverTicket,
      watchStatus,
      rating,
      notes,
      folderIds,
      categoryIds,
    };
    if (anime) {
      onOptimisticChange?.({
        ...anime,
        title: normalizedTitle,
        sourceUrl: sourceUrl.trim() || null,
        externalUrl: isAdult ? sourceUrl.trim() || null : anime.externalUrl,
        isAdult,
        contentRating: isAdult ? contentRating.trim() || "成人內容" : null,
        adultSource: isAdult ? adultSource.trim() || "manual" : null,
        watchStatus,
        rating,
        notes: notes || null,
        folderId: folderIds[0] ?? null,
        folderIds,
        tags: categories.filter((category) => categoryIds.includes(category.id)),
        updatedAt: new Date().toISOString(),
      });
    }
    const callbacks = {
      onSuccess: () => onSaved(),
      onError: (cause: Error) => setMessage(cause.message || "無法儲存動漫。"),
      rollback: () => { if (anime) onOptimisticChange?.(anime); },
    };
    const common = {
      type: isAdult ? "anime-adult" : "anime",
      title: `${anime ? "更新" : "新增"}動漫：${normalizedTitle}`,
      description: selectedCover ? "包含自訂封面" : animeStatusLabels[watchStatus],
      operation: anime ? "修改動漫" : "新增動漫",
      page: "/anime",
      entityKey: anime ? `anime:${anime.id}` : undefined,
      mergeKey: anime ? `anime:${anime.id}` : undefined,
      persist: false,
      maxRetries: 2,
      ...callbacks,
    };
    if (selectedCover) {
      backgroundSave.enqueue({
        ...common,
        execute: async ({ signal, reportProgress }) => {
          if (!coverTicket) {
            reportProgress(undefined, "正在上傳封面");
            coverTicket = await uploadCover(selectedCover);
            if (!coverTicket) throw new Error("封面上傳沒有回傳有效結果，請重試。");
          }
          reportProgress(undefined, "正在同步動漫資料");
          return api("/api/anime/library", { method: anime ? "PATCH" : "POST", body: JSON.stringify({ ...body, coverTicket }), signal });
        },
      });
    } else {
      backgroundSave.enqueue({
        ...common,
        request: { url: "/api/anime/library", method: anime ? "PATCH" : "POST", body },
      });
    }
    onClose();
  };
  const currentCover = anime ? coverUrl(anime) : (prefill?.coverUrl ?? null);
  return (
    <CreateItemModal
      onClose={onClose}
      open
      pending={pending}
      title={anime ? "修改動漫" : "新增動漫"}
    >
      <div className="anime-dialog">
        <label>
          動漫名稱
          <input
            autoFocus
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：葬送的芙莉蓮"
            value={title}
          />
        </label>
        <CoverImageField
          cropSize={{ width: 720, height: 1040 }}
          initialUrl={currentCover}
          onChange={setCover}
        />
        <label>
          {isAdult ? "外部作品／觀看連結（選填）" : "觀看連結（選填）"}
          <input
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://..."
            type="url"
            value={sourceUrl}
          />
        </label>
        {isAdult && (
          <div className="anime-adult-editor-fields">
            <label>
              內容分級
              <input
                onChange={(event) => setContentRating(event.target.value)}
                placeholder="例如：18+ 成人內容"
                value={contentRating}
              />
            </label>
            <label>
              成人內容來源
              <input
                onChange={(event) => setAdultSource(event.target.value)}
                placeholder="例如：manual"
                value={adultSource}
              />
            </label>
          </div>
        )}
        <label>
          觀看狀態
          <select
            onChange={(event) =>
              setWatchStatus(event.target.value as AnimeWatchStatus)
            }
            value={watchStatus}
          >
            {statuses.map((status) => (
              <option key={status} value={status}>
                {animeStatusLabels[status]}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>我的評分（10 星）</legend>
          <StarRating onChange={setRating} value={rating} />
          <small className="anime-rating-help">
            {rating === null ? "尚未評分" : `${rating} / 10`}
          </small>
        </fieldset>
        <TaxonomyMultiSelect
          categories={categories.map((category) => ({ id: category.id, name: categoryLabelInFolderSelection(category, folders, folderIds), folder_id: category.folderId }))}
          categoryIds={categoryIds}
          disabled={pending}
          folderIds={folderIds}
          folders={folders.map((folder) => ({ id: folder.id, name: folder.name, is_visible: folder.isVisible }))}
          onCategoryIdsChange={setCategoryIds}
          onFolderIdsChange={setFolderIds}
          showUnassignedCategoriesWithFolders={false}
        />
        {!folders.length && <p className="anime-field-hint">尚未建立資料夾；不勾選代表未整理。</p>}
        <p className="anime-field-hint">可同時加入多個資料夾；未勾選代表未整理。</p>
        <label>
          私人備註
          <textarea
            onChange={(event) => setNotes(event.target.value)}
            placeholder="記錄心得、進度或提醒…"
            rows={4}
            value={notes}
          />
        </label>
        {message && <p className="notice error">{message}</p>}
        {anime ? (<div className="anime-editor-actions">
          <div>
            {anime && onRemove && (
              <button
                className="danger-button"
                disabled={pending}
                onClick={onRemove}
                type="button"
              >
                移至垃圾桶
              </button>
            )}
          </div>
          <div>
            <button
              className="secondary-button"
              disabled={pending}
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="button"
              disabled={pending}
              onClick={() => void save()}
              type="button"
            >
              {pending ? "儲存中…" : anime ? "儲存修改" : "新增動漫"}
            </button>
          </div>
        </div>) : <CreateFormActions pending={pending} label="新增動漫" pendingLabel="儲存中…" onSave={() => void save()} onCancel={onClose} />}
      </div>
    </CreateItemModal>
  );
}

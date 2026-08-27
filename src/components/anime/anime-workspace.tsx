"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CoverImageField,
  type CoverSelection,
  uploadCover,
} from "@/components/content/cover-image-field";
import { AnimeDiscovery } from "@/components/anime/anime-discovery";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog, OperationStatus } from "@/components/ui/modal-dialog";
import { PinPad } from "@/components/security/pin-pad";
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

type Tab = "discover" | "library" | "stats" | "adult";
type AdultView = "library" | "discover";
type CategoryScope = "standard" | "adult";
type Filter = "all" | AnimeWatchStatus;
const statuses: AnimeWatchStatus[] = [
  "planning",
  "watching",
  "completed",
  "paused",
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
};
// `title` is the user's editable display name.  Provider names remain in the
// detail view, but must never override a name the user has changed.
const displayTitle = (
  anime: Pick<AnimeLibraryItem, "title" | "titleChinese" | "titleJapanese">,
) => anime.title || anime.titleChinese || anime.titleJapanese || "未命名動漫";
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
  selectedId,
  inline = false,
  trashCount = 0,
  trashSelected = false,
}: {
  folders: AnimeWorkspaceData["folders"];
  onChange: (folderId: string | null) => void;
  onFoldersChange: (folders: AnimeWorkspaceData["folders"]) => void;
  onTrash?: () => void;
  scope: CategoryScope;
  selectedId: string | null;
  inline?: boolean;
  trashCount?: number;
  trashSelected?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = folders.filter((folder) => folder.isVisible);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      const result = await api<{
        folder: AnimeWorkspaceData["folders"][number];
      }>("/api/anime/folders", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), scope }),
      });
      onFoldersChange(
        [...folders, result.folder].sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setName("");
      setAdding(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法新增資料夾。");
    } finally {
      setPending(false);
    }
  };
  const update = async (
    folder: AnimeWorkspaceData["folders"][number],
    changes: Record<string, unknown>,
  ) => {
    setPending(true);
    setError(null);
    try {
      const result = await api<{
        folder: AnimeWorkspaceData["folders"][number];
      }>("/api/anime/folders", {
        method: "PATCH",
        body: JSON.stringify({ id: folder.id, ...changes }),
      });
      onFoldersChange(
        folders.map((item) => (item.id === folder.id ? result.folder : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法修改資料夾。");
    } finally {
      setPending(false);
    }
  };
  const remove = async (folder: AnimeWorkspaceData["folders"][number]) => {
    if (!window.confirm(`移除「${folder.name}」？其中的動漫會取消資料夾指定。`))
      return;
    setPending(true);
    setError(null);
    try {
      await api("/api/anime/folders", {
        method: "DELETE",
        body: JSON.stringify({ id: folder.id }),
      });
      onFoldersChange(folders.filter((item) => item.id !== folder.id));
      if (selectedId === folder.id) onChange(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法移除資料夾。");
    } finally {
      setPending(false);
    }
  };
  return (
    <section
      className={inline ? "anime-folder-bar anime-folder-bar-inline" : "anime-folder-bar"}
      aria-label="動漫資料夾"
    >
      <div className="anime-category-scroll">
        <button
          aria-label="修改資料夾"
          className="anime-category-utility"
          onClick={() => setManaging(true)}
          type="button"
        >
          🔧
        </button>
        <button
          aria-label="新增資料夾"
          className="anime-category-utility anime-category-add-button"
          onClick={() => setAdding(true)}
          type="button"
        >
          ＋
        </button>
        <button
          aria-label="管理資料夾"
          className="anime-category-utility"
          onClick={() => setManaging(true)}
          type="button"
        >
          更多
        </button>
        {onTrash && (
          <button
            aria-label="動漫垃圾桶"
            aria-pressed={trashSelected}
            className={trashSelected ? "anime-category-utility active" : "anime-category-utility"}
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
        {visible.map((folder) => (
          <button
            className={selectedId === folder.id ? "active" : ""}
            key={folder.id}
            onClick={() => onChange(folder.id)}
            type="button"
          >
            {folder.name}
          </button>
        ))}
      </div>
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
        onClose={() => setManaging(false)}
        open={managing}
        pending={pending}
        title="管理動漫資料夾"
      >
        <div className="anime-category-manager-list">
          {folders.length ? (
            folders.map((folder) => (
              <div className="anime-folder-manager-row" key={folder.id}>
                <button
                  onClick={() => {
                    onChange(folder.id);
                    setManaging(false);
                  }}
                  type="button"
                >
                  {folder.name}
                  {folder.isVisible ? "" : "（已隱藏）"}
                </button>
                <div>
                  <button
                    className="secondary-button compact"
                    disabled={pending}
                    onClick={() => {
                      const next = window
                        .prompt("資料夾名稱", folder.name)
                        ?.trim();
                      if (next && next !== folder.name)
                        void update(folder, { name: next });
                    }}
                    type="button"
                  >
                    修改
                  </button>
                  <button
                    className="secondary-button compact"
                    disabled={pending}
                    onClick={() =>
                      void update(folder, { isVisible: !folder.isVisible })
                    }
                    type="button"
                  >
                    {folder.isVisible ? "隱藏" : "顯示"}
                  </button>
                  <button
                    className="delete-button compact"
                    disabled={pending}
                    onClick={() => void remove(folder)}
                    type="button"
                  >
                    移除
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="anime-field-hint">尚未建立資料夾。</p>
          )}
        </div>
        {error && <p className="notice error">{error}</p>}
      </ModalDialog>
    </section>
  );
}

function AnimeCollectionList({
  adult = false,
  blur = false,
  categories,
  folders,
  items,
  onMutated,
  onOpen,
  scope,
  trashed = false,
}: {
  adult?: boolean;
  blur?: boolean;
  categories: AnimeTag[];
  folders: AnimeWorkspaceData["folders"];
  items: AnimeLibraryItem[];
  onMutated: () => Promise<void>;
  onOpen: (anime: AnimeLibraryItem) => void;
  scope: CategoryScope;
  trashed?: boolean;
}) {
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [folderId, setFolderId] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [confirmPermanent, setConfirmPermanent] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selected = new Set(selectedIds);
  const allSelected = items.length > 0 && selectedIds.length === items.length;
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
    setPending(true);
    setMessage(null);
    try {
      await api("/api/anime/library", {
        method: "PATCH",
        body: JSON.stringify({
          action,
          ids: selectedIds,
          scope,
          ...(action === "organize"
            ? { folderId: folderId || null, categoryIds }
            : {}),
        }),
      });
      await onMutated();
      setSelectedIds([]);
      setSelecting(false);
      setOrganizeOpen(false);
      setConfirmPermanent(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "無法完成批量操作。");
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      {pending && <OperationStatus label="正在處理選取的動漫…" />}
      <div className="anime-bulk-toolbar">
        <button
          className="secondary-button compact"
          onClick={() => {
            setSelecting((value) => !value);
            setSelectedIds([]);
          }}
          type="button"
        >
          {selecting ? "取消選取" : "選取"}
        </button>
        {selecting && (
          <>
            <strong>已選 {selectedIds.length} 筆</strong>
            <button
              className="secondary-button compact"
              onClick={() =>
                setSelectedIds(
                  allSelected ? [] : items.map((anime) => anime.id),
                )
              }
              type="button"
            >
              {allSelected ? "取消全選" : "全選"}
            </button>
            {trashed ? (
              <>
                <button
                  className="button compact"
                  disabled={!selectedIds.length || pending}
                  onClick={() => void run("restore")}
                  type="button"
                >
                  還原
                </button>
                <button
                  className="danger-button compact"
                  disabled={!selectedIds.length || pending}
                  onClick={() => setConfirmPermanent(true)}
                  type="button"
                >
                  永久刪除
                </button>
              </>
            ) : (
              <>
                <button
                  className="secondary-button compact"
                  disabled={!selectedIds.length || pending}
                  onClick={() => setOrganizeOpen(true)}
                  type="button"
                >
                  整理
                </button>
                <button
                  className="danger-button compact"
                  disabled={!selectedIds.length || pending}
                  onClick={() => void run("trash")}
                  type="button"
                >
                  移至垃圾桶
                </button>
              </>
            )}
          </>
        )}
      </div>
      {message && <p className="notice error">{message}</p>}
      <div className="anime-grid">
        {items.map((anime) => (
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
                  <div className="anime-card-link">
                    {anime.sourceUrl ? "已設定觀看連結" : "尚未設定觀看連結"}
                  </div>
                )}
              </div>
            </button>
          </article>
        ))}
      </div>
      <ModalDialog
        className="mobile-sheet-dialog"
        onClose={() => setOrganizeOpen(false)}
        open={organizeOpen}
        pending={pending}
        title="批量整理動漫"
      >
        <div className="anime-category-dialog">
          <label>
            移至資料夾
            <select
              onChange={(event) => {
                setFolderId(event.target.value);
                setCategoryIds([]);
              }}
              value={folderId}
            >
              <option value="">不指定資料夾</option>
              {folders
                .filter((folder) => folder.isVisible || folder.id === folderId)
                .map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
            </select>
          </label>
          <fieldset>
            <legend>類別（可複選）</legend>
            <div className="anime-tag-picker">
              {categories.filter(
                (category) => category.folderId === (folderId || null),
              ).length ? (
                categories
                  .filter(
                    (category) => category.folderId === (folderId || null),
                  )
                  .map((category) => (
                    <label key={category.id}>
                      <input
                        checked={categoryIds.includes(category.id)}
                        onChange={() =>
                          setCategoryIds((ids) =>
                            ids.includes(category.id)
                              ? ids.filter((id) => id !== category.id)
                              : [...ids, category.id],
                          )
                        }
                        type="checkbox"
                      />{" "}
                      {category.name}
                    </label>
                  ))
              ) : (
                <p className="anime-field-hint">此資料夾尚未建立類別。</p>
              )}
            </div>
          </fieldset>
          <div className="dialog-actions">
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
}: {
  initialData?: AnimeWorkspaceData;
}) {
  const [data, setData] = useState(initialData ?? empty);
  const [loaded, setLoaded] = useState(Boolean(initialData));
  const [tab, setTab] = useState<Tab>("library");
  const [filter, setFilter] = useState<Filter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [adultCategoryFilter, setAdultCategoryFilter] = useState<string | null>(
    null,
  );
  const [adultFolderFilter, setAdultFolderFilter] = useState<string | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [adultQuery, setAdultQuery] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<AnimeLibraryItem | null>(null);
  const [selectedReadOnly, setSelectedReadOnly] = useState(false);
  const [editing, setEditing] = useState<AnimeLibraryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AnimeLibraryItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoryAddOpen, setCategoryAddOpen] = useState(false);
  const [categoryMoreOpen, setCategoryMoreOpen] = useState(false);
  const [categoryManageScope, setCategoryManageScope] =
    useState<CategoryScope | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null,
  );
  const [categoryDraft, setCategoryDraft] = useState("");
  const [removingCategory, setRemovingCategory] = useState<AnimeTag | null>(
    null,
  );
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
  const [adultPin, setAdultPin] = useState("");
  const [adultPinError, setAdultPinError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState(
    initialData?.preferences ?? defaultPreferences,
  );
  const [libraryPage, setLibraryPage] = useState(1);
  const libraryPageSize = 12;

  useEffect(() => {
    let active = true;
    const cached = readClientResource<AnimeWorkspaceData>("anime:standard");
    if (cached) {
      setData(cached);
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
    writeClientResource("anime:standard", next);
  };
  const refreshAdult = async () => {
    const next = await api<AnimeWorkspaceData>(
      "/api/anime/library?scope=adult",
    );
    if (document.visibilityState === "visible") setAdultData(next);
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
    setPending("trash");
    // Clear stale client state first.  This makes the trash view an explicit
    // read-only view rather than reusing the active library list while a
    // request is in flight.
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
    } finally {
      setPending(null);
    }
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
      setAdultPin("");
      setAdultPinError(null);
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
  const unlockAdultWithPin = async (value = adultPin) => {
    const length = preferences.adultAccessMode === "pin6" ? 6 : 4;
    if (!new RegExp(`^\\d{${length}}$`).test(value)) {
      setAdultPinError(`請輸入 ${length} 位數 PIN。`);
      return;
    }
    setPending("adult-access");
    setAdultPinError(null);
    try {
      await api("/api/anime/preferences/pin", {
        method: "POST",
        body: JSON.stringify({ action: "verify", pin: value }),
      });
      setAdultPinPrompt(false);
      await loadAdult();
    } catch (cause) {
      setAdultPinError(
        cause instanceof Error ? cause.message : "PIN 驗證失敗。",
      );
    } finally {
      setPending(null);
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
          !folderFilter || anime.folderId === folderFilter;
        const matchesCategory =
          !categoryFilter ||
          anime.tags.some((category) => category.id === categoryFilter);
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
    [categoryFilter, data.library, filter, folderFilter, query],
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
    setLibraryPage(1);
  }, [filter, categoryFilter, folderFilter, query]);

  const createCategory = async (scope: CategoryScope) => {
    const name = categoryName.trim();
    if (!name) return;
    setPending("category");
    try {
      const folderId = scope === "adult" ? adultFolderFilter : folderFilter;
      const answer = await api<{ tag: AnimeTag }>("/api/anime/tags", {
        method: "POST",
        body: JSON.stringify({ name, scope, folderId }),
      });
      const putTag = (current: AnimeWorkspaceData) =>
        current.tags.some((category) => category.id === answer.tag.id)
          ? current
          : {
              ...current,
              tags: [...current.tags, answer.tag].sort((a, b) =>
                a.name.localeCompare(b.name, "zh-TW"),
              ),
            };
      if (scope === "adult")
        setAdultData((current) => (current ? putTag(current) : current));
      else setData(putTag);
      setCategoryName("");
      setCategoryAddOpen(false);
      setNotice("已新增類別。");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "無法新增類別。");
    } finally {
      setPending(null);
    }
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
  const saveCategoryName = async () => {
    if (!categoryManageScope || !editingCategoryId || !categoryDraft.trim())
      return;
    setPending("category-manage");
    try {
      const result = await api<{ tag: AnimeTag }>("/api/anime/tags", {
        method: "PATCH",
        body: JSON.stringify({
          id: editingCategoryId,
          name: categoryDraft.trim(),
        }),
      });
      replaceScopeTags(categoryManageScope, (tags) =>
        tags.map((tag) => (tag.id === result.tag.id ? result.tag : tag)),
      );
      setEditingCategoryId(null);
      setCategoryDraft("");
      setNotice("已修改類別。");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "無法修改類別。");
    } finally {
      setPending(null);
    }
  };
  const deleteCategory = async () => {
    if (!categoryManageScope || !removingCategory) return;
    setPending("category-manage");
    try {
      await api("/api/anime/tags", {
        method: "DELETE",
        body: JSON.stringify({ id: removingCategory.id }),
      });
      const removedId = removingCategory.id;
      replaceScopeTags(categoryManageScope, (tags) =>
        tags.filter((tag) => tag.id !== removedId),
      );
      if (categoryManageScope === "adult") {
        if (adultCategoryFilter === removedId) setAdultCategoryFilter(null);
      } else if (categoryFilter === removedId) setCategoryFilter(null);
      setRemovingCategory(null);
      setNotice("已移除類別。該類別的動漫會改為未分類。");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "無法移除類別。");
    } finally {
      setPending(null);
    }
  };
  const remove = async () => {
    if (!removing) return;
    setPending("remove");
    try {
      await api("/api/anime/library", {
        method: "DELETE",
        body: JSON.stringify({ id: removing.id }),
      });
      if (removing.isAdult)
        setAdultData((current) =>
          current
            ? {
                ...current,
                library: current.library.filter(
                  (anime) => anime.id !== removing.id,
                ),
              }
            : current,
        );
      else
        setData((current) => ({
          ...current,
          library: current.library.filter((anime) => anime.id !== removing.id),
        }));
      await refreshTrash(removing.isAdult ? "adult" : "standard");
      setSelected(null);
      setRemoving(null);
      setNotice("已移至垃圾桶。");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "無法移除動漫。");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="anime-workspace">
      {pending && (
        <OperationStatus
          label={
            pending === "category"
              ? "正在新增類別…"
              : pending === "adult-access"
                ? "正在驗證成人內容存取權…"
                : pending === "adult-settings"
                  ? "正在儲存成人內容設定…"
                  : "正在儲存動漫資料…"
          }
        />
      )}
      <div className="anime-toolbar">
        <div className="anime-tabs" role="tablist" aria-label="動漫功能">
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => setTab("library")}
            type="button"
          >
            我的動漫
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
          {preferences.adultModeEnabled && (
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
          {tab !== "adult" && (
            <button
              className="button compact"
              onClick={() => setAdding(true)}
              type="button"
            >
              ＋ 新增動漫
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
      {tab === "discover" && (
        <AnimeDiscovery library={data.library} onAdd={setPrefill} />
      )}
      {tab === "adult" && adultUnlocked && adultData && (
        <section className="anime-adult-workspace">
          <div className="anime-adult-heading">
            <div>
              <p className="eyebrow">成人內容</p>
              <h2>我的成人動漫</h2>
              <p>類別與一般動漫完全分開；離開 App 時此區會立即重新隱藏。</p>
            </div>
            <button
              className="button compact"
              onClick={() => setAdding(true)}
              type="button"
            >
              ＋ 新增成人作品
            </button>
          </div>
          <div className="anime-tabs" role="tablist" aria-label="成人內容功能">
            <button
              className={adultView === "library" ? "active" : ""}
              onClick={() => setAdultView("library")}
              type="button"
            >
              我的動漫
            </button>
            <button
              className={adultView === "discover" ? "active" : ""}
              onClick={() => setAdultView("discover")}
              type="button"
            >
              搜尋／探索
            </button>
          </div>
          {adultView === "library" ? (
            <>
              <div className="anime-filter-bar anime-adult-filter-bar">
                <div className="anime-filter-scroll">
                  <AnimeFolderNavigation
                    folders={adultData.folders}
                    inline
                    onChange={(folderId) => {
                      setAdultLibraryView("library");
                      setAdultFolderFilter(folderId);
                      setAdultCategoryFilter(null);
                    }}
                    onFoldersChange={(folders) =>
                      setAdultData((current) =>
                        current ? { ...current, folders } : current,
                      )
                    }
                    onTrash={() => void openTrash("adult")}
                    scope="adult"
                    selectedId={adultFolderFilter}
                    trashCount={adultTrashData?.library.length ?? 0}
                    trashSelected={adultLibraryView === "trash"}
                  />
                </div>
                <input
                  aria-label="搜尋成人動漫"
                  onChange={(event) => setAdultQuery(event.target.value)}
                  placeholder="搜尋成人動漫"
                  value={adultQuery}
                />
              </div>
              {adultLibraryView === "trash" && (
                <div className="anime-bulk-toolbar">
                  <button
                    className="secondary-button compact"
                    onClick={() => setAdultLibraryView("library")}
                    type="button"
                  >
                    返回我的動漫
                  </button>
                </div>
              )}
              {adultLibraryView === "library" ? (
                <>
                  <section
                    className="anime-category-bar anime-adult-category-bar"
                    aria-label="成人動漫類別"
                  >
                    <div className="anime-category-scroll">
                      <button
                        className={!adultCategoryFilter ? "active" : ""}
                        onClick={() => setAdultCategoryFilter(null)}
                        type="button"
                      >
                        所有類別
                      </button>
                      {adultData.tags
                        .filter(
                          (category) =>
                            !adultFolderFilter ||
                            category.folderId === adultFolderFilter,
                        )
                        .map((category) => (
                          <button
                            className={
                              adultCategoryFilter === category.id
                                ? "active"
                                : ""
                            }
                            key={category.id}
                            onClick={() => setAdultCategoryFilter(category.id)}
                            type="button"
                          >
                            {category.name}{" "}
                            <small>
                              {
                                adultData.library.filter((anime) =>
                                  anime.tags.some(
                                    (item) => item.id === category.id,
                                  ),
                                ).length
                              }
                            </small>
                          </button>
                        ))}
                      <button
                        aria-label="查看更多成人動漫類別"
                        className="anime-category-utility"
                        onClick={() => setCategoryMoreOpen(true)}
                        type="button"
                      >
                        更多
                      </button>
                      <button
                        aria-label="修改成人動漫類別"
                        className="anime-category-utility"
                        onClick={() => setCategoryManageScope("adult")}
                        type="button"
                      >
                        🔧
                      </button>
                      <button
                        aria-label="新增成人動漫類別"
                        className="anime-category-utility anime-category-add-button"
                        onClick={() => setCategoryAddOpen(true)}
                        type="button"
                      >
                        ＋
                      </button>
                    </div>
                  </section>
                  <AnimeCollectionList
                    adult
                    blur={preferences.blurAdultCovers}
                    categories={adultData.tags}
                    folders={adultData.folders}
                    items={adultData.library.filter(
                      (anime) =>
                        (!adultFolderFilter ||
                          anime.folderId === adultFolderFilter) &&
                        (!adultCategoryFilter ||
                          anime.tags.some(
                            (category) => category.id === adultCategoryFilter,
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
              onAdd={setAdultPrefill}
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
                  className={!adultCategoryFilter ? "active" : ""}
                  onClick={() => {
                    setAdultCategoryFilter(null);
                    setCategoryMoreOpen(false);
                  }}
                  type="button"
                >
                  所有類別
                </button>
                {adultData.tags
                  .filter(
                    (item) =>
                      (!adultFolderFilter ||
                        item.folderId === adultFolderFilter) &&
                      item.name
                        .toLocaleLowerCase()
                        .includes(categoryQuery.trim().toLocaleLowerCase()),
                  )
                  .map((item) => (
                    <button
                      className={
                        adultCategoryFilter === item.id ? "active" : ""
                      }
                      key={item.id}
                      onClick={() => {
                        setAdultCategoryFilter(item.id);
                        setCategoryMoreOpen(false);
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
            <div className="anime-filter-scroll">
              {visibleFilters.map((value) => (
                <button
                  className={filter === value ? "active" : ""}
                  key={value}
                  onClick={() => setFilter(value)}
                  type="button"
                >
                  {value === "all" ? "全部" : animeStatusLabels[value]}
                </button>
              ))}
              <AnimeFolderNavigation
                folders={data.folders}
                inline
                onChange={(folderId) => {
                  setLibraryView("library");
                  setFolderFilter(folderId);
                  setCategoryFilter(null);
                }}
                onFoldersChange={(folders) =>
                  setData((current) => ({ ...current, folders }))
                }
                onTrash={() => void openTrash("standard")}
                scope="standard"
                selectedId={folderFilter}
                trashCount={trashData?.library.length ?? 0}
                trashSelected={libraryView === "trash"}
              />
            </div>
            <input
              aria-label="搜尋自己的動漫"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋名稱、類別或備註"
              value={query}
            />
            <button
              aria-expanded={filterOpen}
              className="secondary-button compact anime-mobile-filter"
              onClick={() => setFilterOpen(true)}
              type="button"
            >
              篩選{filter === "all" ? "" : `：${animeStatusLabels[filter]}`}
            </button>
          </div>
          {libraryView === "trash" && (
            <div className="anime-bulk-toolbar">
              <button
                className="secondary-button compact"
                onClick={() => setLibraryView("library")}
                type="button"
              >
                返回我的動漫
              </button>
            </div>
          )}
          {libraryView === "library" ? (
            <>
              <section className="anime-category-bar" aria-label="動漫類別">
                <div className="anime-category-scroll">
                  <button
                    className={!categoryFilter ? "active" : ""}
                    onClick={() => setCategoryFilter(null)}
                    type="button"
                  >
                    所有類別
                  </button>
                  {data.tags
                    .filter(
                      (category) =>
                        !folderFilter || category.folderId === folderFilter,
                    )
                    .map((category) => (
                      <button
                        className={
                          categoryFilter === category.id ? "active" : ""
                        }
                        key={category.id}
                        onClick={() => setCategoryFilter(category.id)}
                        type="button"
                      >
                        {category.name}{" "}
                        <small>
                          {
                            data.library.filter((anime) =>
                              anime.tags.some(
                                (item) => item.id === category.id,
                              ),
                            ).length
                          }
                        </small>
                      </button>
                    ))}
                  <button
                    aria-label="查看更多類別"
                    className="anime-category-utility"
                    onClick={() => setCategoryMoreOpen(true)}
                    type="button"
                  >
                    更多
                  </button>
                  <button
                    aria-label="修改動漫類別"
                    className="anime-category-utility"
                    onClick={() => setCategoryManageScope("standard")}
                    type="button"
                  >
                    🔧
                  </button>
                  <button
                    aria-label="新增類別"
                    className="anime-category-utility anime-category-add-button"
                    onClick={() => setCategoryAddOpen(true)}
                    type="button"
                  >
                    ＋
                  </button>
                </div>
              </section>
              {!loaded ? (
                <AnimeGridSkeleton />
              ) : (
                <AnimeCollectionList
                  categories={data.tags}
                  folders={data.folders}
                  items={pagedLibrary}
                  onMutated={async () => {
                    await Promise.all([refresh(), refreshTrash("standard")]);
                  }}
                  onOpen={(anime) => {
                    setSelectedReadOnly(false);
                    setSelected(anime);
                  }}
                  scope="standard"
                />
              )}
              {library.length > libraryPageSize && (
                <nav aria-label="我的動漫分頁" className="anime-pagination">
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
              <p>觀看狀態</p>
              <div>
                {visibleFilters.map((value) => (
                  <button
                    className={filter === value ? "active" : ""}
                    key={value}
                    onClick={() => {
                      setFilter(value);
                      setFilterOpen(false);
                    }}
                    type="button"
                  >
                    {value === "all" ? "全部" : animeStatusLabels[value]}
                  </button>
                ))}
              </div>
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
                  className={!categoryFilter ? "active" : ""}
                  onClick={() => {
                    setCategoryFilter(null);
                    setCategoryMoreOpen(false);
                  }}
                  type="button"
                >
                  所有類別
                </button>
                {data.tags
                  .filter(
                    (item) =>
                      (!folderFilter || item.folderId === folderFilter) &&
                      item.name
                        .toLocaleLowerCase()
                        .includes(categoryQuery.trim().toLocaleLowerCase()),
                  )
                  .map((item) => (
                    <button
                      className={categoryFilter === item.id ? "active" : ""}
                      key={item.id}
                      onClick={() => {
                        setCategoryFilter(item.id);
                        setCategoryMoreOpen(false);
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
      {tab === "stats" && <AnimeStats data={data} />}
      {adding && (
        <AnimeEditor
          adult={tab === "adult"}
          categories={tab === "adult" ? (adultData?.tags ?? []) : data.tags}
          defaultFolderId={tab === "adult" ? adultFolderFilter : folderFilter}
          folders={tab === "adult" ? (adultData?.folders ?? []) : data.folders}
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            setPending("refresh");
            try {
              if (tab === "adult") await refreshAdult();
              else {
                await refresh();
                setTab("library");
              }
              setNotice(tab === "adult" ? "已新增成人作品。" : "已新增動漫。");
            } finally {
              setPending(null);
            }
          }}
        />
      )}
      {prefill && (
        <AnimeEditor
          categories={data.tags}
          defaultFolderId={folderFilter}
          folders={data.folders}
          prefill={prefill}
          onClose={() => setPrefill(null)}
          onSaved={async () => {
            setPrefill(null);
            setPending("refresh");
            try {
              await refresh();
              setTab("library");
              setNotice("已新增動漫。");
            } finally {
              setPending(null);
            }
          }}
        />
      )}
      {adultPrefill && (
        <AnimeEditor
          adult
          categories={adultData?.tags ?? []}
          defaultFolderId={adultFolderFilter}
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
          onSaved={async () => {
            const wasAdult = editing.isAdult;
            setPending("refresh");
            try {
              if (wasAdult) {
                await refreshAdult();
                setAdultView("library");
                setTab("adult");
              } else await refresh();
              setEditing(null);
              setNotice("已儲存動漫資料。");
            } finally {
              setPending(null);
            }
          }}
        />
      )}
      <ModalDialog
        className="mobile-sheet-dialog"
        onClose={() => {
          if (!pending) {
            setCategoryManageScope(null);
            setEditingCategoryId(null);
            setCategoryDraft("");
          }
        }}
        open={Boolean(categoryManageScope)}
        pending={pending === "category-manage"}
        title={categoryManageScope === "adult" ? "修改成人動漫類別" : "修改動漫類別"}
      >
        <div className="anime-category-dialog">
          <p>類別只會影響目前資料夾與目前動漫清單；移除後，原有作品會保留並顯示為未分類。</p>
          <div className="anime-category-manager-list anime-category-edit-list">
            {(categoryManageScope === "adult" ? (adultData?.tags ?? []) : data.tags)
              .filter((tag) =>
                categoryManageScope === "adult"
                  ? !adultFolderFilter || tag.folderId === adultFolderFilter
                  : !folderFilter || tag.folderId === folderFilter,
              )
              .map((tag) => (
                <div className="anime-category-edit-row" key={tag.id}>
                  {editingCategoryId === tag.id ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveCategoryName();
                      }}
                    >
                      <label className="sr-only" htmlFor={`anime-category-${tag.id}`}>類別名稱</label>
                      <input
                        autoFocus
                        id={`anime-category-${tag.id}`}
                        maxLength={50}
                        onChange={(event) => setCategoryDraft(event.target.value)}
                        value={categoryDraft}
                      />
                      <button className="button compact" disabled={!categoryDraft.trim() || Boolean(pending)} type="submit">儲存</button>
                      <button className="secondary-button compact" disabled={Boolean(pending)} onClick={() => { setEditingCategoryId(null); setCategoryDraft(""); }} type="button">取消</button>
                    </form>
                  ) : (
                    <>
                      <strong>{tag.name}</strong>
                      <div>
                        <button className="secondary-button compact" disabled={Boolean(pending)} onClick={() => { setEditingCategoryId(tag.id); setCategoryDraft(tag.name); }} type="button">修改</button>
                        <button aria-label={`移除類別 ${tag.name}`} className="anime-category-remove" disabled={Boolean(pending)} onClick={() => setRemovingCategory(tag)} type="button">×</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
          </div>
          {!(categoryManageScope === "adult" ? (adultData?.tags ?? []) : data.tags).filter((tag) => categoryManageScope === "adult" ? !adultFolderFilter || tag.folderId === adultFolderFilter : !folderFilter || tag.folderId === folderFilter).length && <p className="anime-field-hint">目前資料夾尚未建立類別。</p>}
        </div>
      </ModalDialog>
      <ConfirmDialog
        confirmLabel="移除類別"
        description={removingCategory ? `確定要移除「${removingCategory.name}」嗎？已套用此類別的動漫會改為未分類。` : ""}
        onCancel={() => setRemovingCategory(null)}
        onConfirm={() => void deleteCategory()}
        open={Boolean(removingCategory)}
        pending={pending === "category-manage"}
        title="移除動漫類別？"
      />
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
        className="mobile-sheet-dialog"
        onClose={() => {
          if (!pending) setAdultPinPrompt(false);
        }}
        open={adultPinPrompt}
        pending={pending === "adult-access"}
        title="解鎖成人內容"
      >
        <div className="anime-category-dialog">
          <p>
            請輸入獨立的 {preferences.adultAccessMode === "pin6" ? "6" : "4"}{" "}
            位數成人區 PIN。
          </p>
          <PinPad
            disabled={pending === "adult-access"}
            label={
              preferences.adultAccessMode === "pin6"
                ? "輸入 6 位數成人區 PIN"
                : "輸入 4 位數成人區 PIN"
            }
            length={preferences.adultAccessMode === "pin6" ? 6 : 4}
            onChange={(value) => {
              setAdultPin(value);
              setAdultPinError(null);
            }}
            onComplete={(value) => void unlockAdultWithPin(value)}
            value={adultPin}
          />
          {adultPinError && (
            <p className="notice error" role="alert">
              {adultPinError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={pending === "adult-access"}
              onClick={() => setAdultPinPrompt(false)}
              type="button"
            >
              取消
            </button>
          </div>
        </div>
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

function AnimeStats({ data }: { data: AnimeWorkspaceData }) {
  const watched = data.library.reduce(
    (total, anime) => total + anime.watchedEpisodes,
    0,
  );
  const scores = data.library.flatMap((anime) =>
    anime.rating === null ? [] : [anime.rating],
  );
  const average = scores.length
    ? (
        scores.reduce((total, score) => total + score, 0) / scores.length
      ).toFixed(1)
    : "—";
  const date = (value: string) =>
    new Intl.DateTimeFormat("zh-TW", { month: "short", day: "numeric" }).format(
      new Date(value),
    );
  return (
    <>
      <div className="anime-stats-grid">
        <article>
          <small>總收藏</small>
          <strong>{data.library.length}</strong>
          <span>部動漫</span>
        </article>
        <article>
          <small>已觀看集數</small>
          <strong>{watched}</strong>
          <span>集</span>
        </article>
        <article>
          <small>正在觀看</small>
          <strong>
            {
              data.library.filter((anime) => anime.watchStatus === "watching")
                .length
            }
          </strong>
          <span>部</span>
        </article>
        <article>
          <small>平均評分</small>
          <strong>{average}</strong>
          <span>/ 10</span>
        </article>
      </div>
      <section className="anime-status-summary">
        <h2>觀看狀態</h2>
        {statuses.map((status) => (
          <div key={status}>
            <span>
              <Status value={status} />
            </span>
            <strong>
              {
                data.library.filter((anime) => anime.watchStatus === status)
                  .length
              }{" "}
              部
            </strong>
          </div>
        ))}
      </section>
      <section className="anime-history">
        <h2>最近觀看</h2>
        {data.logs.length ? (
          data.logs.slice(0, 8).map((log) => (
            <div key={log.id}>
              <span>{date(log.watchedAt)}</span>
              <strong>
                {data.library.find((anime) => anime.id === log.animeId)
                  ?.title ?? "已移除的動漫"}
              </strong>
              <small>
                第 {log.fromEpisode} 集 → 第 {log.toEpisode} 集
              </small>
            </div>
          ))
        ) : (
          <p className="anime-field-hint">還沒有觀看紀錄。</p>
        )}
      </section>
    </>
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
}) {
  const [title, setTitle] = useState(
    anime?.title ?? prefill?.titleChinese ?? prefill?.title ?? "",
  );
  const [sourceUrl, setSourceUrl] = useState(anime?.sourceUrl ?? "");
  const [watchStatus, setWatchStatus] = useState<AnimeWatchStatus>(
    anime?.watchStatus ?? "planning",
  );
  const [rating, setRating] = useState<number | null>(anime?.rating ?? null);
  const [notes, setNotes] = useState(anime?.notes ?? "");
  const [categoryIds, setCategoryIds] = useState(
    anime?.tags.map((category) => category.id) ?? [],
  );
  const [folderId, setFolderId] = useState<string | null>(
    anime?.folderId ?? defaultFolderId,
  );
  const [cover, setCover] = useState<CoverSelection>(null);
  const [pending, setPending] = useState(false);
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
    if (!title.trim()) {
      setMessage("請輸入動漫名稱。");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const coverTicket = await uploadCover(cover);
      const body = {
        ...(anime ? { id: anime.id } : {}),
        title,
        sourceUrl: sourceUrl.trim() || null,
        externalUrl: isAdult ? sourceUrl.trim() || null : undefined,
        isAdult,
        contentRating: isAdult ? contentRating.trim() || "成人內容" : null,
        adultSource: isAdult ? adultSource.trim() || "manual" : null,
        coverUrl: !cover && !anime ? (prefill?.coverUrl ?? null) : undefined,
        metadata: !anime && prefill ? prefill : undefined,
        coverTicket,
        watchStatus,
        rating,
        notes,
        folderId,
        categoryIds,
      };
      await api("/api/anime/library", {
        method: anime ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      await onSaved();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "無法儲存動漫。");
    } finally {
      setPending(false);
    }
  };
  const currentCover = anime ? coverUrl(anime) : (prefill?.coverUrl ?? null);
  return (
    <ModalDialog
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
        <label>
          資料夾
          <select
            onChange={(event) => {
              setFolderId(event.target.value || null);
              setCategoryIds([]);
            }}
            value={folderId ?? ""}
          >
            <option value="">不指定資料夾</option>
            {folders
              .filter((folder) => folder.isVisible || folder.id === folderId)
              .map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
          </select>
        </label>
        <fieldset>
          <legend>類別（可複選）</legend>
          <div className="anime-tag-picker">
            {categories.filter((category) => category.folderId === folderId)
              .length ? (
              categories
                .filter((category) => category.folderId === folderId)
                .map((category) => (
                  <label key={category.id}>
                    <input
                      checked={categoryIds.includes(category.id)}
                      onChange={() =>
                        setCategoryIds((ids) =>
                          ids.includes(category.id)
                            ? ids.filter((id) => id !== category.id)
                            : [...ids, category.id],
                        )
                      }
                      type="checkbox"
                    />{" "}
                    {category.name}
                  </label>
                ))
            ) : (
              <p className="anime-field-hint">
                先在這個資料夾的類別列按 ＋ 新增類別後即可選取。
              </p>
            )}
          </div>
        </fieldset>
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
        <div className="anime-editor-actions">
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
        </div>
      </div>
    </ModalDialog>
  );
}

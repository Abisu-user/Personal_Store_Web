"use client";
import { useCreateFlow, useCreatedItemRefresh } from "@/components/ui/create-item-modal";
import { CreateFormActions } from "@/components/ui/create-form-actions";

import {
  CSSProperties,
  FormEvent,
  PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog, OperationStatus } from "@/components/ui/modal-dialog";
import { ResponsiveChipOverflow } from "@/components/ui/responsive-chip-overflow";
import { MobilePageHeader } from "@/components/ui/mobile-layout";
import { AppIcon } from "@/components/ui/app-icon";
import { MobileSectionActions } from "@/components/ui/mobile-section-actions";
import { CreateItemButton } from "@/components/layout/create-item-provider";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { FolderUnlockDialog } from "@/components/content/folder-unlock-dialog";
import { BulkOrganizeDialog, type BulkOrganizeChange } from "@/components/content/bulk-organize-dialog";
import { TaxonomyMultiSelect } from "@/components/content/taxonomy-multi-select";
import {
  CoverUploadError,
  CoverImageField,
  type CoverSelection,
  uploadCover,
} from "@/components/content/cover-image-field";
import { BookmarkDisplay, readAppearance } from "@/lib/appearance/preferences";
import { resolveBookmarkCover } from "@/lib/bookmarks/cover";
import type { Bookmark, BookmarksWorkspaceData } from "@/lib/bookmarks/types";
import styles from "./bookmarks-mobile.module.css";

type SystemView = "all" | "favorite" | "pinned" | "archived" | "trash";
type View = SystemView | `folder:${string}`;
type Preview = {
  hostname: string;
  title: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
};
type Confirmation = {
  title: string;
  description: string;
  confirmLabel?: string;
  action: () => Promise<void>;
};
type RenameTarget =
  | { type: "category"; id: string; value: string }
  | { type: "folder"; id: SystemView; value: string }
  | { type: "bookmark_folder"; id: string; value: string };
const labels: Record<SystemView, string> = {
  all: "未整理",
  favorite: "我的最愛",
  pinned: "置頂",
  archived: "封存",
  trash: "垃圾桶",
};
const folderStorageKey = "personal-vault:bookmark-system-folders:v1";
const quickFolderStorageKey = "personal-vault:bookmark-quick-folders:v1";
type FolderSettings = Record<SystemView, { label: string; visible: boolean }>;
const defaultFolderSettings: FolderSettings = {
  all: { label: "未整理", visible: true },
  favorite: { label: "我的最愛", visible: true },
  pinned: { label: "置頂", visible: true },
  archived: { label: "封存", visible: true },
  trash: { label: "垃圾桶", visible: true },
};
const emptyBookmarks: BookmarksWorkspaceData = {
  bookmarks: [],
  categories: [],
  folders: [],
  tags: [],
};

function readFolderSettings(): FolderSettings {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(folderStorageKey) ?? "{}",
    ) as Partial<FolderSettings>;
    return (Object.keys(defaultFolderSettings) as SystemView[]).reduce(
      (next, key) => ({
        ...next,
        [key]: {
          label:
            key === "all"
              ? "未整理"
              : typeof value[key]?.label === "string" && value[key].label.trim()
                ? value[key].label.trim().slice(0, 20)
                : labels[key],
          visible:
            key === "all"
              ? true
              : typeof value[key]?.visible === "boolean"
                ? value[key].visible
                : true,
        },
      }),
      {} as FolderSettings,
    );
  } catch {
    return defaultFolderSettings;
  }
}
function readQuickFolderIds() {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(quickFolderStorageKey) ?? "[]",
    );
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function bookmarkHostname(item: Bookmark) {
  try {
    return item.detail?.url
      ? new URL(item.detail.url).hostname.replace(/^www\./, "")
      : "網站連結";
  } catch {
    return "網站連結";
  }
}

function BookmarkCoverImage({ item }: { item: Bookmark }) {
  const resolved = resolveBookmarkCover(item);
  const [source, setSource] = useState(resolved.primary);
  useEffect(() => setSource(resolved.primary), [resolved.primary]);
  if (!source) return null;
  return (
    <img
      alt=""
      loading="lazy"
      onError={() => setSource((current) => current === resolved.primary ? resolved.fallback : null)}
      referrerPolicy="no-referrer"
      src={source}
    />
  );
}

function WebsiteMark({ item }: { item: Bookmark }) {
  const hostname = bookmarkHostname(item);
  const cover = resolveBookmarkCover(item);
  return (
    <span className={styles.websiteMark}>
      <span aria-hidden="true">{hostname.slice(0, 1).toUpperCase()}</span>
      {cover.primary && <BookmarkCoverImage item={item} />}
    </span>
  );
}

function formatOpenedAt(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function WebsitePreview({ item, onOpen }: { item: Bookmark; onOpen: (item: Bookmark) => void }) {
  const url = item.detail?.url;
  let hostname = "網站連結";
  try {
    if (url) hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* Existing records can be malformed. */
  }
  const cover = resolveBookmarkCover(item);
  return (
    <a
      className={cover.primary ? "bookmark-preview has-image" : "bookmark-preview"}
      href={url}
      rel="noreferrer noopener"
      target="_blank"
      onClick={() => onOpen(item)}
    >
      <span className="bookmark-preview-fallback">
        {hostname.slice(0, 1).toUpperCase()}
      </span>
      {cover.primary && <BookmarkCoverImage item={item} />}
      <span>{hostname}</span>
    </a>
  );
}

function expiry(value: string) {
  const days = Math.ceil(
    Math.max(0, new Date(value).getTime() + 30 * 86_400_000 - Date.now()) /
      86_400_000,
  );
  return {
    urgent: days <= 3,
    text: days ? `剩餘 ${days} 天後自動刪除` : "即將自動刪除",
  };
}

type BookmarkCoverStatus = "idle" | "selected" | "uploading" | "uploaded" | "error";

function BookmarkCoverField({
  initialUrl,
  onChange,
  onError,
  status,
  error,
}: {
  initialUrl?: string | null;
  onChange: (selection: CoverSelection) => void;
  onError: (message: string) => void;
  status: BookmarkCoverStatus;
  error?: string | null;
}) {
  return (
    <div className="bookmark-custom-cover">
      <CoverImageField
        initialUrl={initialUrl}
        onChange={onChange}
        onError={onError}
      />
      {status === "selected" && <p className="hint" role="status">已選擇圖片；按下儲存後會開始上傳。</p>}
      {status === "uploading" && <p className="hint" role="status">封面上傳中…</p>}
      {status === "uploaded" && <p className="hint" role="status">封面上傳完成，正在儲存網站收藏…</p>}
      {status === "error" && error && <p className="notice error" role="alert">{error}</p>}
      {status === "idle" && (
        <p className="hint">
          未上傳時會使用網站自動封面；若網站沒有圖片則顯示預設封面。
        </p>
      )}
    </div>
  );
}

function BookmarkCollectionSettings({
  categories = [],
  folders,
  favorite = false,
  pinned = false,
  archived = false,
  folderId = "",
  categoryId = "",
  coverImageUrl,
  onCoverChange,
  onCoverError,
  coverStatus = "idle",
  coverError,
  compact = false,
}: {
  categories?: BookmarksWorkspaceData["categories"];
  folders: BookmarksWorkspaceData["folders"];
  favorite?: boolean;
  pinned?: boolean;
  archived?: boolean;
  folderId?: string;
  categoryId?: string;
  coverImageUrl?: string | null;
  onCoverChange: (selection: CoverSelection) => void;
  onCoverError: (message: string) => void;
  coverStatus?: BookmarkCoverStatus;
  coverError?: string | null;
  compact?: boolean;
}) {
  const organizationFields = (
    <div className={compact ? "bookmark-organization-fields" : "collection-settings-menu"}>
      {!compact && <>
        <label><input defaultChecked={favorite} name="favorite" type="checkbox" /> 我的最愛</label>
        <label><input defaultChecked={pinned} name="pinned" type="checkbox" /> 置頂</label>
        <label><input defaultChecked={archived} name="archived" type="checkbox" /> 封存</label>
        <div className="collection-settings-divider" />
      </>}
      {compact && <>
        <input name="favorite" type="hidden" value={favorite ? "on" : ""} />
        <input name="pinned" type="hidden" value={pinned ? "on" : ""} />
        <input name="archived" type="hidden" value={archived ? "on" : ""} />
      </>}
      <TaxonomyMultiSelect categories={categories} defaultCategoryIds={categoryId ? [categoryId] : []} defaultFolderIds={folderId ? [folderId] : []} folders={folders} />
    </div>
  );
  return (
    <>
      {compact ? organizationFields : <details className="collection-settings">
        <summary>
          網站收藏設定 <small>可複選</small>
        </summary>
        {organizationFields}
      </details>}
      <BookmarkCoverField error={coverError} initialUrl={coverImageUrl} onChange={onCoverChange} onError={onCoverError} status={coverStatus} />
    </>
  );
}

function BookmarkFolderLockGate({
  folders,
  onOpen,
  onRefresh,
}: {
  folders: BookmarksWorkspaceData["folders"];
  onOpen: (folderId: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [lockedFolder, setLockedFolder] = useState<
    BookmarksWorkspaceData["folders"][number] | null
  >(null);
  useEffect(() => {
    const intercept = (event: MouseEvent) => {
      const button = (
        event.target as HTMLElement | null
      )?.closest<HTMLButtonElement>("[data-bookmark-folder-id]");
      if (!button) return;
      const folder = folders.find(
        (candidate) => candidate.is_locked && button.dataset.bookmarkFolderId === candidate.id,
      );
      if (!folder) return;
      event.preventDefault();
      event.stopPropagation();
      setLockedFolder(folder);
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [folders]);
  return (
    <FolderUnlockDialog
      folder={lockedFolder}
      kind="bookmark"
      onClose={() => setLockedFolder(null)}
      onUnlocked={async () => {
        const folderId = lockedFolder?.id;
        await onRefresh();
        if (folderId) onOpen(folderId);
      }}
    />
  );
}

function BookmarkResultCard({
  item,
  selected,
  onSelect,
  onOpen,
  onWebsiteOpen,
}: {
  item: Bookmark;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onWebsiteOpen: (item: Bookmark) => void;
}) {
  return (
    <article
      className="bookmark-card"
      data-pinned={item.pinned ? "true" : undefined}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("a, input, button"))
          onOpen();
      }}
    >
      <label className="item-select">
        <input
          aria-label={`選擇 ${item.title}`}
          checked={selected}
          onChange={onSelect}
          type="checkbox"
        />
      </label>
      <WebsitePreview item={item} onOpen={onWebsiteOpen} />
      <button
        aria-label={`查看 ${item.title} 的詳細資訊`}
        className="bookmark-card-content library-open"
        onClick={onOpen}
        type="button"
      >
        <p className="bookmark-meta">
          {item.categories.map((category) => category.name).join("、") || "未分類"}
          {item.folders.length > 0 && ` · ${item.folders.map((folder) => folder.name).join("、")}`}
        </p>
        <h3 className="bookmark-title">{item.title}</h3>
        {item.description && (
          <p className="bookmark-description">{item.description}</p>
        )}
        <div className="bookmark-status">
          {item.favorite && <span>★ 我的最愛</span>}
          {item.pinned && <span>⌖ 置頂</span>}
          {item.archived && <span>封存</span>}
        </div>
        {item.deletedAt && (
          <p
            className={
              expiry(item.deletedAt).urgent
                ? "trash-expiry urgent"
                : "trash-expiry"
            }
          >
            {expiry(item.deletedAt).text}
          </p>
        )}
      </button>
    </article>
  );
}

function BookmarkListSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        <article
          aria-hidden="true"
          className="bookmark-card bookmark-card-skeleton"
          key={index}
        >
          <span className="skeleton-block skeleton-checkbox" />
          <span className="skeleton-block skeleton-bookmark-cover" />
          <div className="bookmark-card-content">
            <span className="skeleton-block skeleton-line short" />
            <span className="skeleton-block skeleton-line" />
            <span className="skeleton-block skeleton-line medium" />
          </div>
        </article>
      ))}
    </>
  );
}

export function BookmarksWorkspace({
  initialData,
  createMode = false,
}: {
  initialData?: BookmarksWorkspaceData;
  createMode?: boolean;
}) {
  const router = useRouter();
  const createFlow = useCreateFlow();
  const previewRequest = useRef<AbortController | null>(null);
  const [data, setData] = useState(initialData ?? emptyBookmarks);
  const [loaded, setLoaded] = useState(Boolean(initialData));
  const [freshData, setFreshData] = useState(Boolean(initialData));
  const [mobileView, setMobileView] = useState<"overview" | "library">("overview");
  const [showAllBookmarks, setShowAllBookmarks] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [shortcutManagerOpen, setShortcutManagerOpen] = useState(false);
  const [shortcutDraftIds, setShortcutDraftIds] = useState<string[]>([]);
  const [view, setView] = useState<View>("all");
  const [category, setCategory] = useState<string[]>([]);
  const [folderFilters, setFolderFilters] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [createCover, setCreateCover] = useState<CoverSelection>(null);
  const [createCoverTicket, setCreateCoverTicket] = useState<string | null>(null);
  const [createCoverStatus, setCreateCoverStatus] = useState<BookmarkCoverStatus>("idle");
  const [createCoverError, setCreateCoverError] = useState<string | null>(null);
  const [editCover, setEditCover] = useState<CoverSelection>(null);
  const [editCoverTicket, setEditCoverTicket] = useState<string | null>(null);
  const [editCoverStatus, setEditCoverStatus] = useState<BookmarkCoverStatus>("idle");
  const [editCoverError, setEditCoverError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [draftUrl, setDraftUrl] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [detailItem, setDetailItem] = useState<Bookmark | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [newBookmarkFolder, setNewBookmarkFolder] = useState("");
  const [folders, setFolders] = useState<FolderSettings>(defaultFolderSettings);
  const [quickFolderIds, setQuickFolderIds] = useState<string[]>([]);
  const [bookmarkDisplay, setBookmarkDisplay] =
    useState<BookmarkDisplay>("list");
  const [bookmarkGridColumns, setBookmarkGridColumns] = useState(2);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [renaming, setRenaming] = useState<RenameTarget | null>(null);
  const [categoryAddOpen, setCategoryAddOpen] = useState(false);
  const [categoryMoreOpen, setCategoryMoreOpen] = useState(false);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [folderAddOpen, setFolderAddOpen] = useState(false);
  const [folderMoreOpen, setFolderMoreOpen] = useState(false);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [folderQuery, setFolderQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState<{
    kind: "category" | "folder";
    id: string;
  } | null>(null);
  const [managedCategories, setManagedCategories] = useState<
    BookmarksWorkspaceData["categories"]
  >([]);
  const [managedFolders, setManagedFolders] = useState<
    BookmarksWorkspaceData["folders"]
  >([]);
  const [removedCategoryIds, setRemovedCategoryIds] = useState<string[]>([]);
  const [removedFolderIds, setRemovedFolderIds] = useState<string[]>([]);
  const dragTimer = useRef<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFolders(readFolderSettings());
      setQuickFolderIds(readQuickFolderIds());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const syncDisplay = () => {
      const appearance = readAppearance();
      setBookmarkDisplay(appearance.bookmarkDisplay);
      setBookmarkGridColumns(appearance.bookmarkGridColumns);
    };
    syncDisplay();
    window.addEventListener("personal-vault:appearance", syncDisplay);
    return () =>
      window.removeEventListener("personal-vault:appearance", syncDisplay);
  }, []);
  useEffect(() => () => previewRequest.current?.abort(), []);
  useEffect(() => {
    setEditCover(null);
    setEditCoverTicket(null);
    setEditCoverStatus("idle");
    setEditCoverError(null);
  }, [editing?.id]);
  useEffect(() => {
    if (!createMode) router.prefetch("/bookmarks");
  }, [createMode, router]);
  const load = useCallback(async () => {
    const response = await fetch("/api/bookmarks", { cache: "no-store" });
    if (!response.ok) {
      setError("目前無法讀取網站收藏。");
      return;
    }
    const next = (await response.json()) as BookmarksWorkspaceData;
    setData(next);
    setLoaded(true);
    setFreshData(true);
  }, []);
  useCreatedItemRefresh("bookmark", load);
  useEffect(() => { if (createMode) void load(); }, [createMode, load]);
  useEffect(() => {
    if (createMode) return;
    let active = true;
    const loadInitial = async () => {
      try {
        const response = await fetch("/api/bookmarks", { cache: "no-store" });
        if (!response.ok) throw new Error("目前無法讀取網站收藏。");
        const next = (await response.json()) as BookmarksWorkspaceData;
        if (!active) return;
        setData(next);
        setLoaded(true);
        setFreshData(true);
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "目前無法讀取網站收藏。",
          );
      }
    };
    void loadInitial();
    return () => {
      active = false;
    };
  }, [createMode]);
  useEffect(() => {
    if (mobileView === "library" && mobileSearchOpen) searchInputRef.current?.focus();
  }, [mobileSearchOpen, mobileView]);
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 3000);
    return () => window.clearTimeout(timer);
  }, [success]);
  useEffect(() => {
    const showOverview = () => {
      setMobileView("overview");
      setMobileSearchOpen(false);
      setQuery("");
      setChosen(new Set());
    };
    window.addEventListener("personal-vault:bookmarks-overview", showOverview);
    return () => window.removeEventListener("personal-vault:bookmarks-overview", showOverview);
  }, []);
  const activeFolderId = folderFilters[0] ?? null;
  const scopedCategories = useMemo(
    () =>
      data.categories.filter(
        (item) => item.folder_id === null || folderFilters.includes(item.folder_id),
      ),
    [data.categories, folderFilters],
  );
  const list = useMemo(
    () =>
      data.bookmarks.filter((item) => {
        if (view === "trash" ? !item.deletedAt : item.deletedAt) return false;
        if (view === "all" && !showAllBookmarks && !folderFilters.length && (item.archived || item.folders.length)) return false;
        if (showAllBookmarks && (item.archived || item.deletedAt)) return false;
        if (view === "favorite" && (!item.favorite || item.archived))
          return false;
        if (view === "pinned" && (!item.pinned || item.archived)) return false;
        if (view === "archived" && !item.archived) return false;
        if (folderFilters.length && (item.archived || !item.folders.some((folder) => folderFilters.includes(folder.id)))) return false;
        const search =
          `${item.title} ${item.description ?? ""} ${item.detail?.url ?? ""}`.toLowerCase();
        const inCategory = !category.length || (category.includes("unclassified") ? !item.categories.length : item.categories.some((value) => category.includes(value.id)));
        return (
          inCategory &&
          search.includes(query.toLowerCase())
        );
      }),
    [category, data.bookmarks, folderFilters, query, showAllBookmarks, view],
  );
  const counts = useMemo(
    () =>
      data.bookmarks.reduce<Record<SystemView, number>>(
        (total, item) => {
          if (item.deletedAt) total.trash += 1;
          else if (item.archived) total.archived += 1;
          else {
            if (!item.folders.length) total.all += 1;
            if (item.favorite) total.favorite += 1;
            if (item.pinned) total.pinned += 1;
          }
          return total;
        },
        { all: 0, favorite: 0, pinned: 0, archived: 0, trash: 0 },
      ),
    [data.bookmarks],
  );
  const selected = list.filter((item) => chosen.has(item.id));
  const visibleBookmarkFolders = data.folders
    .filter((item) => item.is_visible)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.name.localeCompare(right.name, "zh-Hant"),
    );
  async function onPreview() {
    const url = draftUrl.trim();
    previewRequest.current?.abort();
    setPreviewError(null);
    if (!url) {
      setPreview(null);
      return;
    }
    const controller = new AbortController();
    previewRequest.current = controller;
    try {
      const response = await fetch("/api/bookmarks/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const value = (await response.json().catch(() => null)) as Preview | null;
      if (controller.signal.aborted) return;
      if (!response.ok || !value) {
        setPreview(null);
        setPreviewError("暫時無法取得預覽，仍可自行填寫標題後儲存。");
        return;
      }
      setPreview(value);
      setDraftTitle((current) =>
        current.trim() ? current : (value.title ?? value.hostname),
      );
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setPreview(null);
        setPreviewError("暫時無法取得預覽，仍可自行填寫標題後儲存。");
      }
    } finally {
      if (previewRequest.current === controller) previewRequest.current = null;
    }
  }
  async function prepareBookmarkCover(
    selection: CoverSelection,
    currentTicket: string | null,
    setTicket: (value: string | null) => void,
    setStatus: (value: BookmarkCoverStatus) => void,
    setCoverError: (value: string | null) => void,
  ) {
    if (!selection) return null;
    if (currentTicket) return currentTicket;
    setStatus("uploading");
    setCoverError(null);
    try {
      const ticket = await uploadCover(selection);
      if (!ticket) throw new CoverUploadError("upload", "封面上傳沒有回傳有效結果，請重試。");
      setTicket(ticket);
      setStatus("uploaded");
      return ticket;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "圖片讀取成功，但上傳失敗，請稍後再試。";
      setStatus("error");
      setCoverError(message);
      throw cause;
    }
  }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setSuccess(null);
    let submittedCoverTicket = createCoverTicket;
    try {
    submittedCoverTicket = await prepareBookmarkCover(createCover, createCoverTicket, setCreateCoverTicket, setCreateCoverStatus, setCreateCoverError);
    const response = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: draftUrl,
        title: draftTitle,
        description: draftDescription,
        categoryIds: form.getAll("categoryIds").map(String),
        folderIds: form.getAll("folderIds").map(String),
        coverTicket: submittedCoverTicket,
        favorite: form.get("favorite") === "on",
        pinned: form.get("pinned") === "on",
        archived: form.get("archived") === "on",
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "無法儲存網站收藏。");
    }
    setSuccess("網站收藏已儲存，正在開啟網站收藏清單…");
    setCreateCover(null);
    setCreateCoverTicket(null);
    setCreateCoverStatus("idle");
    setCreateCoverError(null);
    if (createFlow) { createFlow.complete(); return; }
    router.replace("/bookmarks");
    router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "無法儲存網站收藏。";
      setError(submittedCoverTicket && !(cause instanceof CoverUploadError) ? `圖片已上傳，但網站收藏資料儲存失敗：${message}` : message);
    } finally { setPending(false); }
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setSuccess(null);
    const url = String(form.get("url") ?? "");
    const title = String(form.get("title") ?? "");
    const description = String(form.get("description") ?? "");
    const categoryIds = form.getAll("categoryIds").map(String);
    const folderIds = form.getAll("folderIds").map(String);
    const favorite = form.get("favorite") === "on";
    const archived = form.get("archived") === "on";
    const pinned = form.get("pinned") === "on" && !archived;
    let submittedCoverTicket = editCoverTicket;
    try {
    submittedCoverTicket = await prepareBookmarkCover(editCover, editCoverTicket, setEditCoverTicket, setEditCoverStatus, setEditCoverError);
    const response = await fetch("/api/bookmarks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        url,
        title,
        description,
        categoryIds,
        folderIds,
        coverTicket: submittedCoverTicket,
        favorite,
        pinned,
        archived,
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? "無法儲存修改。");
    }
    await load();
    setEditing(null);
    setSuccess("網站收藏已更新。");
    } catch (cause) {
      const message = cause instanceof Error && cause.message !== "Failed to fetch" ? cause.message : "目前無法連線並儲存修改，請稍後再試。";
      setError(submittedCoverTicket && !(cause instanceof CoverUploadError) ? `圖片已上傳，但網站收藏資料儲存失敗：${message}` : message);
    } finally { setPending(false); }
  }
  async function update(id: string, action: "trash" | "restore") {
    setPending(true);
    setError(null);
    const response = await fetch("/api/bookmarks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setPending(false);
    if (!response.ok) {
      setError("無法更新網站收藏。");
      return;
    }
    setData((current) => ({
      ...current,
      bookmarks: current.bookmarks.map((item) =>
        item.id !== id
          ? item
          : {
              ...item,
              deletedAt: action === "trash" ? new Date().toISOString() : null,
              pinned: action === "trash" ? false : item.pinned,
              archived: action === "restore" ? false : item.archived,
            },
      ),
    }));
    setSuccess(action === "trash" ? "已移至垃圾桶。" : "網站收藏已還原。");
    setConfirmation(null);
  }
  async function permanentlyRemove(id: string) {
    setPending(true);
    setError(null);
    const response = await fetch("/api/bookmarks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPending(false);
    if (!response.ok) {
      setError("無法永久刪除網站收藏。");
      return;
    }
    setData((current) => ({
      ...current,
      bookmarks: current.bookmarks.filter((item) => item.id !== id),
    }));
    setSuccess("網站收藏已永久刪除。");
    setConfirmation(null);
  }
  async function trashSelected() {
    if (!selected.length) return;
    const ids = selected.map((item) => item.id);
    setPending(true);
    setError(null);
    const response = await fetch("/api/bookmarks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "trash" }),
    });
    setPending(false);
    if (!response.ok) {
      setError("無法批量移至垃圾桶。");
      return;
    }
    setChosen(new Set());
    setData((current) => ({
      ...current,
      bookmarks: current.bookmarks.map((item) =>
        ids.includes(item.id)
          ? { ...item, deletedAt: new Date().toISOString(), pinned: false }
          : item,
      ),
    }));
    setSuccess(`已將 ${ids.length} 筆網站收藏移至垃圾桶。`);
    setConfirmation(null);
  }
  async function permanentlyRemoveSelected() {
    if (!selected.length) return;
    const ids = selected.map((item) => item.id);
    setPending(true);
    setError(null);
    const response = await fetch("/api/bookmarks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, action: "permanent" }),
    });
    setPending(false);
    if (!response.ok) {
      setError("無法批量永久刪除網站收藏。");
      return;
    }
    setChosen(new Set());
    setData((current) => ({
      ...current,
      bookmarks: current.bookmarks.filter((item) => !ids.includes(item.id)),
    }));
    setSuccess(`已永久刪除 ${ids.length} 筆網站收藏。`);
    setConfirmation(null);
  }
  async function organizeSelected(change: BulkOrganizeChange) {
    if (!selected.length) return;
    const count = selected.length;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/bookmarks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected.map((item) => item.id), action: "organize", categoryIds: change.categoryIds, folderIds: change.folderIds, relationMode: change.mode }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "無法整理選取的網站收藏。");
      setChosen(new Set());
      setOrganizeOpen(false);
      await load();
      setSuccess(`已整理 ${count} 筆網站收藏。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法整理選取的網站收藏。");
    } finally { setPending(false); }
  }
  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/taxonomy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "category",
        name,
        contentKind: "bookmark",
        folderId: activeFolderId,
      }),
    });
    const payload = (await response.json().catch(() => null)) as {
      item?: BookmarksWorkspaceData["categories"][number];
    } | null;
    setPending(false);
    if (!response.ok || !payload?.item) {
      setError("無法新增類別，名稱可能已存在。");
      return;
    }
    setData((current) => ({
      ...current,
      categories: [...current.categories, payload.item!].sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.name.localeCompare(right.name, "zh-Hant"),
      ),
    }));
    setNewCategory("");
    setCategoryAddOpen(false);
    setSuccess("類別已新增。 ");
  }
  async function addBookmarkFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newBookmarkFolder.trim();
    if (!name) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/taxonomy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "bookmark_folder", name }),
    });
    const payload = (await response.json().catch(() => null)) as {
      item?: BookmarksWorkspaceData["folders"][number];
    } | null;
    setPending(false);
    if (!response.ok || !payload?.item) {
      setError("無法新增網站收藏資料夾，名稱可能已存在。");
      return;
    }
    setData((current) => ({
      ...current,
      folders: [...current.folders, payload.item!].sort(
        (left, right) =>
          left.sort_order - right.sort_order ||
          left.name.localeCompare(right.name, "zh-Hant"),
      ),
    }));
    setNewBookmarkFolder("");
    setSuccess("網站收藏資料夾已新增。");
  }
  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renaming || !renaming.value.trim()) return;
    if (renaming.type === "folder") {
      saveFolders({
        ...folders,
        [renaming.id]: {
          ...folders[renaming.id],
          label: renaming.value.trim().slice(0, 20),
        },
      });
      setRenaming(null);
      setSuccess("智慧資料夾名稱已更新，網站收藏設定已同步。 ");
      return;
    }
    const name = renaming.value.trim();
    const kind = renaming.type;
    setPending(true);
    setError(null);
    const response = await fetch("/api/taxonomy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id: renaming.id, name }),
    });
    setPending(false);
    if (!response.ok) {
      setError("無法修改資料夾。");
      return;
    }
    setData((current) =>
      kind === "category"
        ? {
            ...current,
            categories: current.categories.map((item) =>
              item.id === renaming.id ? { ...item, name } : item,
            ),
            bookmarks: current.bookmarks.map((item) => ({
              ...item,
              categories: item.categories.map((category) => category.id === renaming.id ? { ...category, name } : category),
              category: item.category?.id === renaming.id ? { ...item.category, name } : item.category,
            })),
          }
        : {
            ...current,
            folders: current.folders.map((item) =>
              item.id === renaming.id ? { ...item, name } : item,
            ),
            bookmarks: current.bookmarks.map((item) => ({
              ...item,
              folders: item.folders.map((folder) => folder.id === renaming.id ? { ...folder, name } : folder),
              folder: item.folder?.id === renaming.id ? { ...item.folder, name } : item.folder,
            })),
          },
    );
    if (kind === "category")
      setManagedCategories((current) =>
        current.map((item) =>
          item.id === renaming.id ? { ...item, name } : item,
        ),
      );
    else
      setManagedFolders((current) =>
        current.map((item) =>
          item.id === renaming.id ? { ...item, name } : item,
        ),
      );
    setRenaming(null);
    setSuccess("資料夾已更新。");
  }
  async function setBookmarkFolderVisibility(id: string, visible: boolean) {
    setPending(true);
    setError(null);
    const response = await fetch("/api/taxonomy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "bookmark_folder", id, visible }),
    });
    setPending(false);
    if (!response.ok) {
      setError("無法更新網站收藏資料夾。 ");
      return;
    }
    setData((current) => ({
      ...current,
      folders: current.folders.map((item) =>
        item.id === id ? { ...item, is_visible: visible } : item,
      ),
    }));
    setSuccess(visible ? "網站收藏資料夾已顯示。" : "網站收藏資料夾已隱藏。");
  }
  async function deleteBookmarkFolder(id: string) {
    setPending(true);
    setError(null);
    const response = await fetch("/api/taxonomy", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "bookmark_folder", id }),
    });
    setPending(false);
    if (!response.ok) {
      setError("無法刪除網站收藏資料夾。 ");
      return;
    }
    setData((current) => ({
      ...current,
      folders: current.folders.filter((item) => item.id !== id),
      bookmarks: current.bookmarks.map((item) => {
        const folders = item.folders.filter((folder) => folder.id !== id);
        return {
          ...item,
          folders,
          folder: item.folder?.id === id ? (folders[0] ?? null) : item.folder,
        };
      }),
    }));
    setFolderFilters((current) => current.filter((folderId) => folderId !== id));
    setSuccess("網站收藏資料夾已刪除，原有網站收藏已移出資料夾。");
    setConfirmation(null);
  }
  async function deleteCategory(id: string) {
    setPending(true);
    setError(null);
    const response = await fetch("/api/taxonomy", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "category", id }),
    });
    setPending(false);
    if (!response.ok) {
      setError("無法刪除資料夾。");
      return;
    }
    saveQuickFolders(quickFolderIds.filter((current) => current !== id));
    setData((current) => ({
      ...current,
      categories: current.categories.filter((item) => item.id !== id),
      bookmarks: current.bookmarks.map((item) => {
        const categories = item.categories.filter((itemCategory) => itemCategory.id !== id);
        return {
          ...item,
          categories,
          category: item.category?.id === id ? (categories[0] ?? null) : item.category,
        };
      }),
    }));
    setCategory((current) => current.filter((categoryId) => categoryId !== id));
    setSuccess("資料夾已刪除，原有網站收藏已改為未分類。");
    setConfirmation(null);
    await load();
    router.refresh();
  }
  function openManager(kind: "category" | "folder") {
    setError(null);
    setDragging(null);
    if (kind === "category") {
      setManagedCategories(scopedCategories);
      setRemovedCategoryIds([]);
      setCategoryManagerOpen(true);
    } else {
      setManagedFolders(
        [...data.folders].sort(
          (left, right) => left.sort_order - right.sort_order,
        ),
      );
      setRemovedFolderIds([]);
      setFolderManagerOpen(true);
    }
  }
  function reorder(
    kind: "category" | "bookmark_folder",
    fromId: string,
    toId: string,
  ) {
    if (fromId === toId) return;
    const move = <T extends { id: string }>(current: T[]) => {
      const from = current.findIndex((item) => item.id === fromId);
      const to = current.findIndex((item) => item.id === toId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moving] = next.splice(from, 1);
      next.splice(to, 0, moving);
      return next;
    };
    if (kind === "category") setManagedCategories(move);
    else setManagedFolders(move);
  }
  async function commitManager(kind: "category" | "bookmark_folder") {
    if (kind === "category") {
      const source = scopedCategories;
      const draft = managedCategories;
      const changed =
        removedCategoryIds.length ||
        source.length !== draft.length ||
        source.some((item, index) => item.id !== draft[index]?.id);
      if (!changed) {
        setCategoryManagerOpen(false);
        return;
      }
      setPending(true);
      setError(null);
      try {
        for (const [sortOrder, item] of draft.entries()) {
          if (
            source.findIndex((candidate) => candidate.id === item.id) !==
            sortOrder
          ) {
            const response = await fetch("/api/taxonomy", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind,
                id: item.id,
                sortOrder,
                contentKind: "bookmark",
              }),
            });
            if (!response.ok) throw new Error("無法更新排序。");
          }
        }
        for (const id of removedCategoryIds) {
          const response = await fetch("/api/taxonomy", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, id, contentKind: "bookmark" }),
          });
          if (!response.ok) throw new Error("無法移除項目。");
        }
        setData((current) => ({
          ...current,
          categories: [
            ...current.categories.filter(
              (item) => (item.folder_id ?? null) !== activeFolderId,
            ),
            ...draft.map((item, sort_order) => ({ ...item, sort_order })),
          ],
        }));
        setCategory((current) =>
          current.filter((categoryId) => !removedCategoryIds.includes(categoryId)),
        );
        setCategoryManagerOpen(false);
        setSuccess("整理結果已儲存。 ");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "無法儲存整理結果。");
      } finally {
        setPending(false);
        setDragging(null);
      }
      return;
    }
    const source = data.folders;
    const draft = managedFolders;
    const changed =
      removedFolderIds.length ||
      source.length !== draft.length ||
      source.some((item, index) => item.id !== draft[index]?.id);
    if (!changed) {
      setFolderManagerOpen(false);
      return;
    }
    setPending(true);
    setError(null);
    try {
      for (const [sortOrder, item] of draft.entries()) {
        if (
          source.findIndex((candidate) => candidate.id === item.id) !==
          sortOrder
        ) {
          const response = await fetch("/api/taxonomy", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, id: item.id, sortOrder }),
          });
          if (!response.ok) throw new Error("無法更新排序。");
        }
      }
      for (const id of removedFolderIds) {
        const response = await fetch("/api/taxonomy", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, id }),
        });
        if (!response.ok) throw new Error("無法移除項目。");
      }
      setData((current) => ({
        ...current,
        folders: draft.map((item, sort_order) => ({ ...item, sort_order })),
        bookmarks: current.bookmarks.map((item) => {
          const folders = item.folders.filter((folder) => !removedFolderIds.includes(folder.id));
          return { ...item, folders, folder: item.folder && removedFolderIds.includes(item.folder.id) ? (folders[0] ?? null) : item.folder };
        }),
      }));
      setFolderManagerOpen(false);
      setSuccess("整理結果已儲存。 ");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法儲存整理結果。");
    } finally {
      setPending(false);
      setDragging(null);
    }
  }
  function beginLongPress(
    kind: "category" | "folder",
    id: string,
    pointerType: string,
  ) {
    if (pointerType === "mouse") return;
    if (dragTimer.current) window.clearTimeout(dragTimer.current);
    dragTimer.current = window.setTimeout(() => {
      setDragging({ kind, id });
    }, 420);
  }
  function endLongPress() {
    if (dragTimer.current) window.clearTimeout(dragTimer.current);
    dragTimer.current = null;
    setDragging(null);
  }
  function moveFromPoint(
    kind: "category" | "folder",
    event: PointerEvent<HTMLElement>,
  ) {
    if (dragging?.kind !== kind) return;
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-bookmark-manager-kind]");
    if (
      target?.dataset.bookmarkManagerKind === kind &&
      target.dataset.bookmarkManagerId
    )
      reorder(
        kind === "folder" ? "bookmark_folder" : "category",
        dragging.id,
        target.dataset.bookmarkManagerId,
      );
  }
  function saveFolders(next: FolderSettings) {
    setFolders(next);
    window.localStorage.setItem(folderStorageKey, JSON.stringify(next));
    if (!view.startsWith("folder:") && !next[view as SystemView].visible)
      setView("all");
  }
  function toggleFolder(key: Exclude<SystemView, "all">) {
    saveFolders({
      ...folders,
      [key]: { ...folders[key], visible: !folders[key].visible },
    });
  }
  function saveQuickFolders(ids: string[]) {
    const unique = [...new Set(ids)];
    setQuickFolderIds(unique);
    window.localStorage.setItem(quickFolderStorageKey, JSON.stringify(unique));
  }
  const dialog = (
    <>
      <BookmarkFolderLockGate
        folders={data.folders}
        onOpen={(folderId) => {
          setFolderFilters([folderId]);
          setShowAllBookmarks(false);
          setView(`folder:${folderId}`);
          setMobileView("library");
          setFolderMoreOpen(false);
        }}
        onRefresh={load}
      />
      <ConfirmDialog
        {...(confirmation ?? {
          title: "",
          description: "",
          action: async () => undefined,
        })}
        error={error}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          void confirmation?.action();
        }}
        open={Boolean(confirmation)}
        pending={pending}
      />
    </>
  );
  const form = (
    <form className="bookmark-form" onSubmit={create}>
      <h2>新增網站收藏</h2>
      <label>
        網址
        <input
          aria-describedby={previewError ? "bookmark-preview-error" : undefined}
          aria-label="網址"
          name="url"
          onBlur={() => void onPreview()}
          onChange={(event) => setDraftUrl(event.target.value)}
          placeholder="貼上網址後自動帶入標題與預覽圖"
          required
          type="url"
          value={draftUrl}
        />
      </label>
      {preview && (
        <div className="bookmark-draft-preview">
          {(preview.imageUrl ?? preview.faviconUrl) && (
            <img
              alt=""
              referrerPolicy="no-referrer"
              src={preview.imageUrl ?? preview.faviconUrl ?? undefined}
            />
          )}
          <strong>{preview.title ?? preview.hostname}</strong>
        </div>
      )}
      {previewError && (
        <p className="notice" id="bookmark-preview-error" role="status">
          {previewError}
        </p>
      )}
      <label>
        標題
        <input
          aria-label="標題"
          name="title"
          onChange={(event) => setDraftTitle(event.target.value)}
          placeholder="標題會自動帶入，也可自行改寫"
          value={draftTitle}
        />
      </label>
      <label>
        備註
        <textarea
          aria-label="備註"
          name="description"
          onChange={(event) => setDraftDescription(event.target.value)}
          placeholder="備註（選填）"
          rows={2}
          value={draftDescription}
        />
      </label>
      <BookmarkCollectionSettings
        categories={data.categories}
        coverError={createCoverError}
        coverStatus={createCoverStatus}
        folders={data.folders}
        onCoverChange={(selection) => {
          setCreateCover(selection);
          setCreateCoverTicket(null);
          setCreateCoverError(null);
          setCreateCoverStatus(selection ? "selected" : "idle");
        }}
        onCoverError={(message) => {
          setCreateCoverError(message);
          setCreateCoverStatus("error");
        }}
      />
      <CreateFormActions pending={pending} returnHref="/bookmarks" label="儲存" pendingLabel="儲存中…" />
    </form>
  );
  const renameDialog = renaming && (
    <section
      aria-labelledby="rename-folder-title"
      aria-modal="true"
      className="inline-dialog edit-dialog rename-dialog"
      role="dialog"
    >
      <form onSubmit={saveRename}>
        <p className="eyebrow">RENAME FOLDER</p>
        <h2 id="rename-folder-title">
          修改
          {renaming.type === "folder"
            ? "智慧資料夾"
            : renaming.type === "category"
              ? "網站收藏類別"
              : "網站收藏資料夾"}
        </h2>
        <label htmlFor="rename-folder-input">資料夾名稱</label>
        <input
          autoFocus
          id="rename-folder-input"
          maxLength={80}
          onChange={(event) =>
            setRenaming((current) =>
              current ? { ...current, value: event.target.value } : current,
            )
          }
          required
          value={renaming.value}
        />
        <p className="hint">修改後會立刻同步到網站收藏清單與新增網站收藏的選項。</p>
        <div className="dialog-actions">
          <button className="button compact" disabled={pending} type="submit">
            {pending ? "儲存中…" : "儲存名稱"}
          </button>
          <button
            className="secondary-button compact"
            disabled={pending}
            onClick={() => setRenaming(null)}
            type="button"
          >
            取消
          </button>
        </div>
      </form>
    </section>
  );
  if (createMode)
    return (
      <section className="bookmarks-workspace create-only">
        {pending && <OperationStatus label="正在更新網站收藏設定…" />}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="collection-operation-toast" role="status">
            {success}
          </p>
        )}
        {form}
        <section
          aria-labelledby="bookmark-folders-title"
          className="category-manager create-category-manager"
        >
          <header className="manager-heading">
            <div>
              <p className="eyebrow">BOOKMARK ORGANIZATION</p>
              <h2 id="bookmark-folders-title">管理網站收藏／類別</h2>
              <p>
                類別用於整理內容；「未分類」會永久保留。只有選擇「置於上方」的類別，才會顯示在網站收藏頁頂端。
              </p>
            </div>
          </header>
          <form className="category-create-row" onSubmit={addCategory}>
            <label className="sr-only" htmlFor="new-category">
              新類別名稱
            </label>
            <input
              id="new-category"
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="例如：動畫、工作、稍後閱讀"
              value={newCategory}
            />
            <button className="button compact" disabled={pending} type="submit">
              ＋ 新增類別
            </button>
          </form>
          <div className="category-list">
            <article className="category-row system-folder">
              <div>
                <strong>未分類</strong>
                <small>固定保留：未指定類別的網站收藏會顯示在此</small>
              </div>
              <span>固定保留</span>
            </article>
            {data.categories.length ? (
              data.categories.map((item) => (
                <article className="category-row" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {quickFolderIds.includes(item.id)
                        ? "已顯示於上方"
                        : "目前隱藏於上方"}
                    </small>
                  </div>
                  <div className="manager-actions">
                    <button
                      className="secondary-button compact"
                      onClick={() =>
                        saveQuickFolders(
                          quickFolderIds.includes(item.id)
                            ? quickFolderIds.filter((id) => id !== item.id)
                            : [...quickFolderIds, item.id],
                        )
                      }
                      type="button"
                    >
                      {quickFolderIds.includes(item.id)
                        ? "隱藏於上方"
                        : "置於上方"}
                    </button>
                    <button
                      className="secondary-button compact"
                      onClick={() =>
                        setRenaming({
                          type: "category",
                          id: item.id,
                          value: item.name,
                        })
                      }
                      type="button"
                    >
                      修改
                    </button>
                    <button
                      className="delete-button compact"
                      onClick={() =>
                        setConfirmation({
                          title: "移除網站收藏類別？",
                          description: `「${item.name}」的網站收藏會改為未分類；此操作無法復原。`,
                          action: () => deleteCategory(item.id),
                        })
                      }
                      type="button"
                    >
                      移除
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="manager-empty">尚未建立自訂類別。</p>
            )}
          </div>
          <section
            aria-labelledby="bookmark-folder-manager-title"
            className="folder-settings"
          >
            <div className="folder-heading">
              <div>
                <p className="eyebrow">BOOKMARK FOLDERS</p>
                <h3 id="bookmark-folder-manager-title">管理網站收藏資料夾</h3>
                <p>
                  資料夾和類別分開管理；隱藏資料夾不會出現在新增網站收藏的選單或網站收藏頁。
                </p>
              </div>
            </div>
            <form className="category-create-row" onSubmit={addBookmarkFolder}>
              <label className="sr-only" htmlFor="new-bookmark-folder">
                新網站收藏資料夾名稱
              </label>
              <input
                id="new-bookmark-folder"
                onChange={(event) => setNewBookmarkFolder(event.target.value)}
                placeholder="例如：待閱讀、專案 A、旅遊"
                value={newBookmarkFolder}
              />
              <button
                className="button compact"
                disabled={pending}
                type="submit"
              >
                ＋ 新增資料夾
              </button>
            </form>
            <div className="folder-list">
              {data.folders.length ? (
                data.folders.map((item) => (
                  <article className="folder-row" key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.is_visible
                          ? "目前顯示於網站收藏頁與新增選單"
                          : "目前已隱藏"}
                      </small>
                    </div>
                    <div className="manager-actions">
                      <button
                        className="secondary-button compact"
                        onClick={() =>
                          void setBookmarkFolderVisibility(
                            item.id,
                            !item.is_visible,
                          )
                        }
                        type="button"
                      >
                        {item.is_visible ? "隱藏" : "顯示"}
                      </button>
                      <button
                        className="secondary-button compact"
                        onClick={() =>
                          setRenaming({
                            type: "bookmark_folder",
                            id: item.id,
                            value: item.name,
                          })
                        }
                        type="button"
                      >
                        修改
                      </button>
                      <button
                        className="delete-button compact"
                        onClick={() =>
                          setConfirmation({
                            title: "移除網站收藏資料夾？",
                            description: `「${item.name}」中的網站收藏不會被刪除，只會移出這個資料夾。`,
                            action: () => deleteBookmarkFolder(item.id),
                          })
                        }
                        type="button"
                      >
                        移除
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className="manager-empty">尚未建立網站收藏資料夾。</p>
              )}
            </div>
          </section>
          <section className="folder-settings">
            <div className="folder-heading">
              <div>
                <p className="eyebrow">SMART FOLDERS</p>
                <h3>智慧資料夾</h3>
                <p>「全部」固定保留；其他智慧資料夾可改名、隱藏或再次恢復。</p>
              </div>
              <button
                className="secondary-button compact"
                onClick={() => saveFolders(defaultFolderSettings)}
                type="button"
              >
                還原預設
              </button>
            </div>
            <div className="folder-list">
              {(
                ["favorite", "pinned", "archived", "trash"] as Exclude<
                  SystemView,
                  "all"
                >[]
              ).map((key) => (
                <article className="folder-row" key={key}>
                  <div>
                    <strong>{folders[key].label}</strong>
                    <small>
                      {folders[key].visible
                        ? "目前顯示於網站收藏頁"
                        : "目前已隱藏（可恢復）"}
                    </small>
                  </div>
                  <div className="manager-actions">
                    <button
                      className="secondary-button compact"
                      onClick={() =>
                        setRenaming({
                          type: "folder",
                          id: key,
                          value: folders[key].label,
                        })
                      }
                      type="button"
                    >
                      修改
                    </button>
                    <button
                      className={
                        folders[key].visible
                          ? "delete-button compact"
                          : "secondary-button compact"
                      }
                      onClick={() => toggleFolder(key)}
                      type="button"
                    >
                      {folders[key].visible ? "隱藏" : "恢復"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
        {renameDialog}
        {dialog}
      </section>
    );
  const toggleAll = () =>
    setChosen((current) => {
      const next = new Set(current);
      const all = selected.length === list.length && list.length > 0;
      list.forEach((item) => {
        if (all) next.delete(item.id);
        else next.add(item.id);
      });
      return next;
    });
  const quickCount = (id: string) => data.folders.find((folder) => folder.id === id)?.item_count
    ?? data.bookmarks.filter((item) => !item.deletedAt && !item.archived && item.folders.some((folder) => folder.id === id)).length;
  const shortcutBookmarks = (freshData ? data.bookmarks : [])
    .filter((item) => !item.deletedAt && !item.archived && item.shortcutOrder !== null && item.detail?.url)
    .sort((left, right) => (left.shortcutOrder ?? Number.MAX_SAFE_INTEGER) - (right.shortcutOrder ?? Number.MAX_SAFE_INTEGER));
  const shortcutCandidates = (freshData ? data.bookmarks : [])
    .filter((item) => !item.deletedAt && !item.archived && item.detail?.url)
    .sort((left, right) => left.title.localeCompare(right.title, "zh-Hant"));
  const shortcutManagerBookmarks = [...shortcutCandidates].sort((left, right) => {
    const leftIndex = shortcutDraftIds.indexOf(left.id);
    const rightIndex = shortcutDraftIds.indexOf(right.id);
    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex;
    if (leftIndex >= 0) return -1;
    if (rightIndex >= 0) return 1;
    return left.title.localeCompare(right.title, "zh-Hant");
  });
  const recentBookmarks = (freshData ? data.bookmarks : [])
    .filter((item) => !item.deletedAt && !item.archived && item.lastOpenedAt && item.detail?.url)
    .sort((left, right) => new Date(right.lastOpenedAt ?? 0).getTime() - new Date(left.lastOpenedAt ?? 0).getTime())
    .slice(0, 5);
  const activeBookmarkCount = data.bookmarks.filter((item) => !item.deletedAt && !item.archived).length;
  const hasAnyBookmark = activeBookmarkCount > 0 || counts.all > 0 || data.folders.some((folder) => (folder.item_count ?? 0) > 0);
  const openLibrary = ({ all = false, focusSearch = false }: { all?: boolean; focusSearch?: boolean } = {}) => {
    setMobileView("library");
    setMobileSearchOpen(focusSearch);
    setShowAllBookmarks(all);
    setFolderFilters([]);
    setCategory([]);
    setView("all");
  };
  const openFolder = (folderId: string | null) => {
    setMobileSearchOpen(false);
    setQuery("");
    setShowAllBookmarks(false);
    setCategory([]);
    setFolderFilters(folderId ? [folderId] : []);
    setView(folderId ? `folder:${folderId}` : "all");
    setMobileView("library");
  };
  const openShortcutManager = () => {
    setShortcutDraftIds(shortcutBookmarks.map((item) => item.id));
    setShortcutManagerOpen(true);
  };
  const toggleShortcut = (id: string) => {
    setShortcutDraftIds((current) => current.includes(id)
      ? current.filter((entryId) => entryId !== id)
      : [...current, id]);
  };
  const moveShortcut = (id: string, direction: -1 | 1) => {
    setShortcutDraftIds((current) => {
      const index = current.indexOf(id);
      const destination = index + direction;
      if (index < 0 || destination < 0 || destination >= current.length) return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  };
  const saveShortcuts = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/bookmarks/shortcuts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds: shortcutDraftIds }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "目前無法儲存常用網站。");
      const orderById = new Map(shortcutDraftIds.map((id, index) => [id, index]));
      setData((current) => ({
        ...current,
        bookmarks: current.bookmarks.map((bookmark) => ({
          ...bookmark,
          shortcutOrder: orderById.get(bookmark.id) ?? null,
        })),
      }));
      setShortcutManagerOpen(false);
      setSuccess("常用網站已更新。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "目前無法儲存常用網站。");
    } finally {
      setPending(false);
    }
  };
  const recordOpen = async (id: string) => {
    const openedAt = new Date().toISOString();
    try {
      const response = await fetch("/api/bookmarks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "open" }),
        keepalive: true,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setData((current) => ({
        ...current,
        bookmarks: current.bookmarks.map((item) => item.id === id
          ? { ...item, lastOpenedAt: openedAt, openedCount: (item.openedCount ?? 0) + 1 }
          : item),
      }));
    } catch (cause) {
      console.warn("[bookmarks] opening activity could not be recorded", cause);
    }
  };
  const selectBookmarkFolder = (folderId: string | null) => {
    setShowAllBookmarks(false);
    if (!folderId) { setFolderFilters([]); setView("all"); return; }
    setFolderFilters((current) => {
      const next = current.includes(folderId) ? current.filter((id) => id !== folderId) : [...current, folderId];
      setView(next.length ? `folder:${next[0]}` : "all");
      return next;
    });
  };
  const selectBookmarkCategory = (next: string) => {
    if (next === "all") { setCategory([]); return; }
    if (next === "unclassified") { setCategory((current) => current.includes(next) ? [] : [next]); return; }
    setCategory((current) => current.includes(next) ? current.filter((id) => id !== next) : [...current.filter((id) => id !== "unclassified"), next]);
  };
  return (
    <section className="bookmarks-workspace">
      {pending && <OperationStatus label="正在處理網站收藏資料…" />}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="collection-operation-toast" role="status">
          {success}
        </p>
      )}
      <section className={styles.mobileOverview} data-active={mobileView === "overview"}>
        <MobilePageHeader
          eyebrow="BOOKMARKS"
          title="網站收藏"
          actions={<>
            <button aria-label="搜尋網站收藏" className="mobile-icon-button" onClick={() => openLibrary({ all: true, focusSearch: true })} type="button">
              <AppIcon name="search" />
            </button>
            <CreateItemButton className={styles.overviewAddButton} kind="bookmark">
              <AppIcon name="plus" />
              <span>新增</span>
            </CreateItemButton>
          </>}
        />
        <div className={styles.overviewChips} data-chip-overflow-container>
          <ResponsiveChipOverflow
            activeIds={[]}
            className="bookmark-view-tabs"
            leadingCount={2}
            items={visibleBookmarkFolders}
            itemId={(item) => item.id}
            itemMeasureKey={(item) => `${item.name}|${item.is_locked}|${quickCount(item.id)}`}
            leading={<>
              <button onClick={() => openLibrary({ all: true })} type="button">全部</button>
              <button onClick={() => openFolder(null)} type="button">未整理</button>
            </>}
            renderItem={(item) => (
              <button data-bookmark-folder-id={item.id} key={`overview-folder-${item.id}`} onClick={() => openFolder(item.id)} type="button">
                {item.is_locked ? <AppIcon name="lock" /> : null}
                {item.name}
              </button>
            )}
            renderMore={(hasHiddenActive) => (
              <button className={hasHiddenActive ? "active" : ""} onClick={() => setFolderMoreOpen(true)} type="button">更多</button>
            )}
            rowClassName="bookmark-view-tabs-scroll"
          />
        </div>

        <section className={styles.overviewSection}>
          <header>
            <h2>常用網站</h2>
            <button className={styles.sectionLink} onClick={openShortcutManager} type="button">管理</button>
          </header>
          {!freshData ? (
            <p className={styles.compactEmpty}>正在載入常用網站…</p>
          ) : shortcutBookmarks.length ? (
            <div className={styles.shortcutRail}>
              {shortcutBookmarks.map((item) => (
                <a aria-label={`開啟 ${item.title}`} href={item.detail?.url ?? "#"} key={item.id} onClick={() => void recordOpen(item.id)} rel="noreferrer noopener" target="_blank" title={item.title}>
                  <WebsiteMark item={item} />
                </a>
              ))}
            </div>
          ) : (
            <button className={`${styles.compactEmpty} ${styles.shortcutEmpty}`} onClick={openShortcutManager} type="button">尚未設定常用網站，點此選擇。</button>
          )}
        </section>

        <section className={styles.overviewSection}>
          <header><h2>最近開啟</h2></header>
          {!freshData ? (
            <p className={styles.compactEmpty}>正在載入最近開啟紀錄…</p>
          ) : recentBookmarks.length ? (
            <div className={styles.recentList}>
              {recentBookmarks.map((item) => (
                <a href={item.detail?.url ?? "#"} key={item.id} onClick={() => void recordOpen(item.id)} rel="noreferrer noopener" target="_blank">
                  <WebsiteMark item={item} />
                  <span className={styles.recentCopy}><strong>{item.title}</strong><small>{bookmarkHostname(item)}</small></span>
                  <time dateTime={item.lastOpenedAt ?? undefined}>{item.lastOpenedAt ? formatOpenedAt(item.lastOpenedAt) : ""}</time>
                  <span aria-hidden="true" className={styles.chevron}>›</span>
                </a>
              ))}
            </div>
          ) : (
            <p className={styles.compactEmpty}>{freshData ? "尚無最近開啟紀錄" : "正在載入最近開啟…"}</p>
          )}
        </section>

        <section className={styles.overviewSection}>
          <header>
            <h2>資料夾</h2>
            <button className={styles.sectionLink} onClick={() => openLibrary({ all: true })} type="button">查看全部 <span aria-hidden="true">›</span></button>
          </header>
          <div className={styles.folderGrid}>
            <button onClick={() => openFolder(null)} type="button">
              <span className={styles.folderIcon}><AppIcon name="folder" /></span>
              <strong>未整理</strong>
              <small>{counts.all} 個項目</small>
            </button>
            {visibleBookmarkFolders.map((item) => (
              <button data-bookmark-folder-id={item.id} key={`overview-card-${item.id}`} onClick={() => openFolder(item.id)} type="button">
                <span className={styles.folderIcon}><AppIcon name={item.is_locked ? "lock" : "folder"} /></span>
                <strong>{item.name}</strong>
                <small>{quickCount(item.id)} 個項目</small>
              </button>
            ))}
          </div>
          {!visibleBookmarkFolders.length && <p className={styles.compactEmpty}>還沒有自訂資料夾</p>}
        </section>

        {freshData && loaded && !hasAnyBookmark && (
          <section className={styles.overviewEmpty}>
            <AppIcon name="bookmark" />
            <strong>還沒有網站收藏</strong>
            <p>收藏第一個常用網站，下次就能快速找到。</p>
            <CreateItemButton className="button" kind="bookmark">＋ 新增網站</CreateItemButton>
          </section>
        )}
      </section>
      <div className={styles.managementView} data-active={mobileView === "library"}>
        <MobilePageHeader
          eyebrow="BOOKMARK LIBRARY"
          title="全部網站"
          leading={<button aria-label="返回網站收藏首頁" className="mobile-icon-button" onClick={() => { setMobileView("overview"); setMobileSearchOpen(false); setQuery(""); }} type="button"><span aria-hidden="true">‹</span></button>}
          actions={<>
            <button
              aria-expanded={mobileSearchOpen}
              aria-label={mobileSearchOpen ? "聚焦網站收藏搜尋" : "搜尋網站收藏"}
              className="mobile-icon-button"
              onClick={() => {
                setMobileSearchOpen(true);
                window.requestAnimationFrame(() => searchInputRef.current?.focus());
              }}
              type="button"
            >
              <AppIcon name="search" />
            </button>
            <CreateItemButton className="mobile-header-create-button" kind="bookmark"><AppIcon name="plus" /><span className="sr-only">新增網站收藏</span></CreateItemButton>
          </>}
        />
      <section aria-label="資料夾" className="collection-navigation-section" data-chip-overflow-container>
        <header>
          <strong>資料夾</strong>
          <div className="collection-navigation-desktop-actions" data-chip-overflow-actions>
            <button
              className="collection-navigation-action"
              onClick={() => openManager("folder")}
              type="button"
            >
              管理
            </button>
            <button
              className="collection-navigation-action primary"
              onClick={() => setFolderAddOpen(true)}
              type="button"
            >
              ＋ 新增
            </button>
          </div>
          <MobileSectionActions
            actions={[
              {
                label: "管理資料夾",
                description: "重新命名、排序或刪除",
                onSelect: () => openManager("folder"),
              },
              {
                label: "新增資料夾",
                description: "建立新的整理空間",
                onSelect: () => setFolderAddOpen(true),
              },
            ]}
            label="資料夾操作"
            title="資料夾操作"
          />
        </header>
        <ResponsiveChipOverflow
          activeIds={folderFilters}
          className="bookmark-view-tabs"
          leadingCount={1}
          items={visibleBookmarkFolders}
          itemId={(item) => item.id}
          itemMeasureKey={(item) => `${item.name}|${item.is_locked}|${quickCount(item.id)}`}
          leading={<button aria-selected={!showAllBookmarks && !folderFilters.length} className={!showAllBookmarks && !folderFilters.length ? "active" : ""} onClick={() => selectBookmarkFolder(null)} role="tab" type="button">未整理 <span>{counts.all}</span></button>}
          renderItem={(item) => <button aria-selected={folderFilters.includes(item.id)} className={folderFilters.includes(item.id) ? "active" : ""} data-bookmark-folder-id={item.id} key={`folder-${item.id}`} onClick={() => selectBookmarkFolder(item.id)} role="tab" type="button">{item.is_locked ? "🔒 " : ""}{item.name} <span>{quickCount(item.id)}</span></button>}
          renderMore={(hasHiddenActive) => <button aria-label="查看更多網站收藏資料夾" className={hasHiddenActive ? "collection-category-utility active" : "collection-category-utility"} onClick={() => setFolderMoreOpen(true)} type="button">更多</button>}
          rowClassName="bookmark-view-tabs-scroll"
          trailing={folders.trash.visible ? <button aria-selected={view === "trash"} className={view === "trash" ? "active trash-tab" : "trash-tab"} onClick={() => { setShowAllBookmarks(false); setView("trash"); setFolderFilters([]); setCategory([]); }} role="tab" type="button">{folders.trash.label} <span>{counts.trash}</span></button> : null}
          trailingCount={folders.trash.visible ? 1 : 0}
        />
      </section>
      <section aria-label="類別" className="collection-navigation-section" data-chip-overflow-container>
        <header>
          <strong>類別</strong>
          <div className="collection-navigation-desktop-actions" data-chip-overflow-actions>
            <button
              className="collection-navigation-action"
              onClick={() => openManager("category")}
              type="button"
            >
              管理
            </button>
            <button
              className="collection-navigation-action primary"
              onClick={() => setCategoryAddOpen(true)}
              type="button"
            >
              ＋ 新增
            </button>
          </div>
          <MobileSectionActions
            actions={[
              {
                label: "管理類別",
                description: "重新命名、排序或刪除",
                onSelect: () => openManager("category"),
              },
              {
                label: "新增類別",
                description: "建立新的分類方式",
                onSelect: () => setCategoryAddOpen(true),
              },
            ]}
            label="類別操作"
            title="類別操作"
          />
        </header>
        <ResponsiveChipOverflow
          activeIds={category.filter((categoryId) => categoryId !== "unclassified")}
          className="category-strip collection-category-strip"
          leadingCount={2}
          items={scopedCategories}
          itemId={(item) => item.id}
          itemMeasureKey={(item) => item.name}
          leading={<><button className={!category.length ? "active" : ""} onClick={() => selectBookmarkCategory("all")} type="button">所有類別</button><button className={category.includes("unclassified") ? "active" : ""} onClick={() => selectBookmarkCategory("unclassified")} type="button">未分類</button></>}
          renderItem={(item) => <button className={category.includes(item.id) ? "active" : ""} key={item.id} onClick={() => selectBookmarkCategory(item.id)} type="button">{item.name}</button>}
          renderMore={(hasHiddenActive) => <button aria-label="查看更多網站收藏類別" className={hasHiddenActive ? "collection-category-utility active" : "collection-category-utility"} onClick={() => setCategoryMoreOpen(true)} type="button">更多</button>}
          rowClassName="bookmark-view-tabs-scroll"
        />
      </section>
      <div className={`bookmark-toolbar ${styles.librarySearch}`} data-open={mobileSearchOpen || Boolean(query)}>
        <input
          aria-label="搜尋網站收藏"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            setQuery("");
            setMobileSearchOpen(false);
            event.currentTarget.blur();
          }}
          placeholder="搜尋標題或網址"
          ref={searchInputRef}
          value={query}
        />
        <button
          aria-label="清除並收合搜尋"
          className={styles.searchClose}
          onClick={() => {
            setQuery("");
            setMobileSearchOpen(false);
          }}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="bulk-toolbar">
        <label>
          <input
            checked={list.length > 0 && selected.length === list.length}
            onChange={toggleAll}
            type="checkbox"
          />{" "}
          全選目前清單
        </label>
      </div>
      <BatchActionBar count={selected.length} onCancel={() => setChosen(new Set())}>
        {view === "trash" ? (
          <button className="delete-button" disabled={pending} onClick={() => setConfirmation({ title: `永久刪除 ${selected.length} 筆網站收藏？`, description: "這些網站收藏將無法還原。", action: permanentlyRemoveSelected })} type="button">永久刪除</button>
        ) : (<>
          <button className="secondary-button" disabled={pending} onClick={() => setOrganizeOpen(true)} type="button">整理</button>
          <button className="delete-button" disabled={pending} onClick={() => setConfirmation({ title: `移除 ${selected.length} 筆網站收藏？`, description: "這些網站收藏將移至垃圾桶，30 天內仍可還原。", confirmLabel: "移至垃圾桶", action: trashSelected })} type="button">刪除</button>
        </>)}
      </BatchActionBar>
      <div
        className={`bookmark-list bookmark-list-${bookmarkDisplay}`}
        style={
          bookmarkDisplay === "grid"
            ? ({
                "--bookmark-grid-columns": bookmarkGridColumns,
              } as CSSProperties)
            : undefined
        }
      >
        {!loaded ? (
          <BookmarkListSkeleton />
        ) : (
          <>
            {list.map((item) => (
              <BookmarkResultCard
                item={item}
                key={item.id}
                onOpen={() => setDetailItem(item)}
                onWebsiteOpen={(bookmark) => void recordOpen(bookmark.id)}
                onSelect={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  })
                }
                selected={chosen.has(item.id)}
              />
            ))}
            {list.length === 0 && <p className="lead">尚無符合條件的網站收藏。</p>}
          </>
        )}
      </div>
      </div>
      <ModalDialog
        className={`mobile-sheet-dialog ${styles.shortcutDialog}`}
        footer={(
          <div className={styles.shortcutFooter}>
            <button className="secondary-button" disabled={pending} onClick={() => setShortcutManagerOpen(false)} type="button">取消</button>
            <button className="button" disabled={pending} onClick={() => void saveShortcuts()} type="button">{pending ? "儲存中…" : "儲存"}</button>
          </div>
        )}
        onClose={() => setShortcutManagerOpen(false)}
        open={shortcutManagerOpen}
        pending={pending}
        title="管理常用網站"
      >
        <div className={styles.shortcutManager}>
          <p>選擇要顯示在首頁的網站；已鎖定資料夾中的內容不會在此處或首頁曝光。</p>
          <div className={styles.shortcutOptions}>
            {shortcutManagerBookmarks.map((item) => {
              const selectedIndex = shortcutDraftIds.indexOf(item.id);
              const selectedShortcut = selectedIndex >= 0;
              return (
                <article data-selected={selectedShortcut} key={`shortcut-option-${item.id}`}>
                  <button
                    aria-pressed={selectedShortcut}
                    className={styles.shortcutChoice}
                    onClick={() => toggleShortcut(item.id)}
                    type="button"
                  >
                    <span aria-hidden="true" className={styles.shortcutCheck}>{selectedShortcut ? "✓" : ""}</span>
                    <WebsiteMark item={item} />
                    <span className={styles.shortcutChoiceCopy}>
                      <strong>{item.title}</strong>
                      <small>{bookmarkHostname(item)}</small>
                    </span>
                  </button>
                  {selectedShortcut && (
                    <div className={styles.shortcutOrderActions}>
                      <button aria-label={`將 ${item.title} 往前移`} disabled={selectedIndex === 0} onClick={() => moveShortcut(item.id, -1)} type="button">↑</button>
                      <button aria-label={`將 ${item.title} 往後移`} disabled={selectedIndex === shortcutDraftIds.length - 1} onClick={() => moveShortcut(item.id, 1)} type="button">↓</button>
                    </div>
                  )}
                </article>
              );
            })}
            {!shortcutManagerBookmarks.length && <p className={styles.compactEmpty}>目前沒有可加入的網站收藏。</p>}
          </div>
        </div>
      </ModalDialog>
      <ModalDialog
        className="mobile-sheet-dialog"
        onClose={() => setFolderAddOpen(false)}
        open={folderAddOpen}
        pending={pending}
        title="新增網站收藏資料夾"
      >
        <form
          className="collection-category-dialog"
          onSubmit={(event) => void addBookmarkFolder(event)}
        >
          <label>
            資料夾名稱
            <input
              autoFocus
              maxLength={80}
              onChange={(event) => setNewBookmarkFolder(event.target.value)}
              placeholder="例如：待閱讀、專案 A"
              value={newBookmarkFolder}
            />
          </label>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={pending}
              onClick={() => setFolderAddOpen(false)}
              type="button"
            >
              取消
            </button>
            <button
              className="button"
              disabled={pending || !newBookmarkFolder.trim()}
              type="submit"
            >
              新增資料夾
            </button>
          </div>
        </form>
      </ModalDialog>
      <ModalDialog
        className="mobile-sheet-dialog"
        onClose={() => {
          setFolderMoreOpen(false);
          setFolderQuery("");
        }}
        open={folderMoreOpen}
        title="更多網站收藏資料夾"
      >
        <div className="collection-category-dialog collection-category-manager">
          <p>此處僅用來選擇資料夾；新增、修改、排序與刪除請使用資料夾列的「管理」。</p>
          <input
            aria-label="搜尋網站收藏資料夾"
            onChange={(event) => setFolderQuery(event.target.value)}
            placeholder="搜尋資料夾"
            value={folderQuery}
          />
          <div className="collection-category-manager-list bookmark-folder-more-list">
            <button
              className={!folderFilters.length ? "active" : ""}
              onClick={() => {
                if (mobileView === "overview") openFolder(null);
                else selectBookmarkFolder(null);
                setFolderMoreOpen(false);
                setFolderQuery("");
              }}
              type="button"
            >
              未整理 <span>{counts.all}</span>
            </button>
            {visibleBookmarkFolders
              .filter((item) =>
                item.name
                  .toLocaleLowerCase()
                  .includes(folderQuery.trim().toLocaleLowerCase()),
              )
              .map((item) => (
                <button
                  className={folderFilters.includes(item.id) ? "active" : ""}
                  data-bookmark-folder-id={item.id}
                  key={item.id}
                  onClick={() => {
                    if (mobileView === "overview") {
                      openFolder(item.id);
                      setFolderMoreOpen(false);
                      setFolderQuery("");
                    } else selectBookmarkFolder(item.id);
                  }}
                  type="button"
                >
                  {item.is_locked ? "🔒 " : ""}
                  {item.name} <span>{quickCount(item.id)}</span>
                </button>
              ))}
          </div>
        </div>
      </ModalDialog>
      <ModalDialog
        className="mobile-sheet-dialog"
        onClose={() => {
          endLongPress();
          void commitManager("bookmark_folder");
        }}
        open={folderManagerOpen}
        pending={pending}
        title="管理網站收藏資料夾"
      >
        <div className="collection-category-dialog">
          <p>
            電腦以滑鼠左鍵拖曳、手機以手指長按拖曳調整順序；放開後固定。×
            會先在畫面移除，關閉時再一次儲存。
          </p>
          <div className="taxonomy-manager-list">
            {managedFolders.map((item) => (
              <article
                aria-grabbed={
                  dragging?.kind === "folder" && dragging.id === item.id
                }
                className={
                  dragging?.kind === "folder" && dragging.id === item.id
                    ? "taxonomy-manager-item dragging"
                    : "taxonomy-manager-item"
                }
                data-bookmark-manager-id={item.id}
                data-bookmark-manager-kind="folder"
                draggable
                key={item.id}
                onDragEnd={endLongPress}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragging?.kind === "folder")
                    reorder("bookmark_folder", dragging.id, item.id);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.id);
                  setDragging({ kind: "folder", id: item.id });
                }}
                onPointerDown={(event) =>
                  beginLongPress("folder", item.id, event.pointerType)
                }
                onPointerMove={(event) => moveFromPoint("folder", event)}
                onPointerUp={endLongPress}
              >
                <button
                  className="taxonomy-item-name"
                  onClick={() =>
                    setRenaming({
                      type: "bookmark_folder",
                      id: item.id,
                      value: item.name,
                    })
                  }
                  type="button"
                >
                  {item.is_locked ? "🔒 " : ""}
                  {item.name}
                </button>
                <button
                  aria-label={`刪除 ${item.name}`}
                  className="taxonomy-delete"
                  onClick={() => {
                    setManagedFolders((current) =>
                      current.filter((folder) => folder.id !== item.id),
                    );
                    setRemovedFolderIds((current) => [...current, item.id]);
                  }}
                  type="button"
                >
                  ×
                </button>
              </article>
            ))}
            {!managedFolders.length && (
              <p className="manager-empty">尚未建立網站收藏資料夾。</p>
            )}
          </div>
        </div>
      </ModalDialog>
      <ModalDialog
        className="mobile-sheet-dialog"
        onClose={() => {
          endLongPress();
          void commitManager("category");
        }}
        open={categoryManagerOpen}
        pending={pending}
        title="修改網站收藏類別"
      >
        <div className="collection-category-dialog">
          <p>
            目前資料夾的類別。電腦以滑鼠左鍵拖曳、手機以手指長按拖曳調整順序；放開後固定。×
            會先在畫面移除，關閉時再一次儲存。
          </p>
          <div className="taxonomy-manager-list">
            {managedCategories.map((item) => (
              <article
                aria-grabbed={
                  dragging?.kind === "category" && dragging.id === item.id
                }
                className={
                  dragging?.kind === "category" && dragging.id === item.id
                    ? "taxonomy-manager-item dragging"
                    : "taxonomy-manager-item"
                }
                data-bookmark-manager-id={item.id}
                data-bookmark-manager-kind="category"
                draggable
                key={item.id}
                onDragEnd={endLongPress}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragging?.kind === "category")
                    reorder("category", dragging.id, item.id);
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", item.id);
                  setDragging({ kind: "category", id: item.id });
                }}
                onPointerDown={(event) =>
                  beginLongPress("category", item.id, event.pointerType)
                }
                onPointerMove={(event) => moveFromPoint("category", event)}
                onPointerUp={endLongPress}
              >
                <button
                  className="taxonomy-item-name"
                  onClick={() =>
                    setRenaming({
                      type: "category",
                      id: item.id,
                      value: item.name,
                    })
                  }
                  type="button"
                >
                  {item.name}
                </button>
                <button
                  aria-label={`刪除 ${item.name}`}
                  className="taxonomy-delete"
                  onClick={() => {
                    setManagedCategories((current) =>
                      current.filter((category) => category.id !== item.id),
                    );
                    setRemovedCategoryIds((current) => [...current, item.id]);
                  }}
                  type="button"
                >
                  ×
                </button>
              </article>
            ))}
            {!managedCategories.length && (
              <p className="manager-empty">此資料夾尚未建立自訂類別。</p>
            )}
          </div>
        </div>
      </ModalDialog>
      <ModalDialog
        className="mobile-sheet-dialog"
        onClose={() => setCategoryAddOpen(false)}
        open={categoryAddOpen}
        pending={pending}
        title="新增網站收藏類別"
      >
        <form
          className="collection-category-dialog"
          onSubmit={(event) => void addCategory(event)}
        >
          <p>新增後會立即出現在網站收藏類別列與新增網站收藏的選項中。</p>
          <label>
            類別名稱
            <input
              autoFocus
              maxLength={80}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="例如：動畫、工作"
              value={newCategory}
            />
          </label>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={pending}
              onClick={() => setCategoryAddOpen(false)}
              type="button"
            >
              取消
            </button>
            <button
              className="button"
              disabled={pending || !newCategory.trim()}
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
        title="網站收藏類別"
      >
        <div className="collection-category-dialog collection-category-manager">
          <p>可快速選擇網站收藏類別；資料夾、鎖定與常駐清單請在管理資料夾調整。</p>
          <input
            aria-label="搜尋網站收藏類別"
            onChange={(event) => setCategoryQuery(event.target.value)}
            placeholder="搜尋類別"
            value={categoryQuery}
          />
          <div className="collection-category-manager-list">
            <button
              className={!category.length ? "active" : ""}
              onClick={() => {
                selectBookmarkCategory("all");
                setCategoryMoreOpen(false);
              }}
              type="button"
            >
              所有類別
            </button>
            <button
              className={category.includes("unclassified") ? "active" : ""}
              onClick={() => {
                selectBookmarkCategory("unclassified");
                setCategoryMoreOpen(false);
              }}
              type="button"
            >
              未分類
            </button>
            {data.categories
              .filter((item) =>
                item.name
                  .toLocaleLowerCase()
                  .includes(categoryQuery.trim().toLocaleLowerCase()),
              )
              .map((item) => (
                <button
                  className={category.includes(item.id) ? "active" : ""}
                  key={item.id}
                  onClick={() => {
                    selectBookmarkCategory(item.id);
                  }}
                  type="button"
                >
                  {item.name}
                </button>
              ))}
          </div>
        </div>
      </ModalDialog>
      {detailItem && (
        <div
          aria-label="關閉詳細資訊"
          className="bookmark-detail-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailItem(null);
          }}
        >
          <section
            aria-modal="true"
            aria-labelledby="bookmark-detail-title"
            className="bookmark-detail-dialog"
            role="dialog"
          >
            <div>
              <button
                aria-label="關閉詳細資訊"
                className="detail-close"
                onClick={() => setDetailItem(null)}
                type="button"
              >
                ×
              </button>
              <p className="eyebrow">BOOKMARK DETAILS</p>
              <h2 id="bookmark-detail-title">{detailItem.title}</h2>
              <a
                className="detail-url"
                href={detailItem.detail?.url}
                onClick={() => void recordOpen(detailItem.id)}
                rel="noreferrer noopener"
                target="_blank"
              >
                {detailItem.detail?.url}
              </a>
              <dl>
                <div>
                  <dt>類別</dt>
                  <dd>{detailItem.categories.map((category) => category.name).join("、") || "未分類"}</dd>
                </div>
                <div>
                  <dt>資料夾</dt>
                  <dd>{detailItem.folders.map((folder) => folder.name).join("、") || "未放入資料夾"}</dd>
                </div>
                <div>
                  <dt>網站收藏設定</dt>
                  <dd>
                    {[
                      detailItem.favorite && "我的最愛",
                      detailItem.pinned && "置頂",
                      detailItem.archived && "封存",
                    ]
                      .filter(Boolean)
                      .join("、") || "一般網站收藏"}
                  </dd>
                </div>
              </dl>
              <h3>備註</h3>
              <p className="detail-content">
                {detailItem.description || "沒有備註。"}
              </p>
              <div className="dialog-actions">
                {detailItem.deletedAt ? (
                  <>
                    <button
                      className="button"
                      onClick={() => {
                        void update(detailItem.id, "restore");
                        setDetailItem(null);
                      }}
                      type="button"
                    >
                      還原
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => {
                        const target = detailItem;
                        setDetailItem(null);
                        setConfirmation({
                          title: "永久刪除網站收藏？",
                          description: `「${target.title}」將無法還原。`,
                          action: () => permanentlyRemove(target.id),
                        });
                      }}
                      type="button"
                    >
                      永久刪除
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setEditing(detailItem);
                        setDetailItem(null);
                      }}
                      type="button"
                    >
                      修改
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => {
                        const target = detailItem;
                        setDetailItem(null);
                        setConfirmation({
                          title: "移至垃圾桶？",
                          description: `「${target.title}」會保留 30 天，期間可隨時還原。`,
                          confirmLabel: "移至垃圾桶",
                          action: async () => {
                            await update(target.id, "trash");
                          },
                        });
                      }}
                      type="button"
                    >
                      刪除
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
      {editing && (
        <section
          aria-modal="true"
          aria-labelledby="edit-bookmark-title"
          className="inline-dialog edit-dialog"
          role="dialog"
        >
          <form onSubmit={saveEdit}>
            <h2 id="edit-bookmark-title">修改網站收藏</h2>
            <label>網址<input aria-label="網址" defaultValue={editing.detail?.url ?? ""} inputMode="url" name="url" required type="url" /></label>
            <label>
              標題
              <input
                aria-label="標題"
                defaultValue={editing.title}
                name="title"
                required
              />
            </label>
            <label>
              備註
              <textarea
                aria-label="備註"
                defaultValue={editing.description ?? ""}
                name="description"
                rows={3}
              />
            </label>
            <BookmarkCollectionSettings
              archived={editing.archived}
              categories={data.categories}
              categoryId={editing.category?.id ?? ""}
              compact
              coverError={editCoverError}
              coverImageUrl={editing.coverImageUrl}
              coverStatus={editCoverStatus}
              favorite={editing.favorite}
              folderId={editing.folder?.id ?? ""}
              folders={data.folders}
              onCoverChange={(selection) => {
                setEditCover(selection);
                setEditCoverTicket(null);
                setEditCoverError(null);
                setEditCoverStatus(selection ? "selected" : "idle");
              }}
              onCoverError={(message) => {
                setEditCoverError(message);
                setEditCoverStatus("error");
              }}
              pinned={editing.pinned}
            />
            <div className="dialog-actions">
              <button className="button" disabled={pending} type="submit">
                {pending ? "儲存中…" : "儲存修改"}
              </button>
              <button
                className="secondary-button"
                onClick={() => setEditing(null)}
                type="button"
              >
                取消
              </button>
            </div>
          </form>
        </section>
      )}
      <BulkOrganizeDialog categories={data.categories} count={selected.length} folders={data.folders} onClose={() => setOrganizeOpen(false)} onSave={organizeSelected} open={organizeOpen} pending={pending} />
      {dialog}
    </section>
  );
}

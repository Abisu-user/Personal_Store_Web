"use client";
import { useCreateFlow, useCreatedItemRefresh } from "@/components/ui/create-item-modal";
import { CreateFormActions } from "@/components/ui/create-form-actions";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateItemButton } from "@/components/layout/create-item-provider";
import { createBrowserStorageManager } from "@/lib/storage/client";
import {
  CollectionCategory,
  CollectionNavigation,
  CollectionView,
} from "@/components/content/collection-navigation";
import { BulkOrganizeDialog, type BulkOrganizeChange } from "@/components/content/bulk-organize-dialog";
import { TaxonomyMultiSelect } from "@/components/content/taxonomy-multi-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog, OperationStatus } from "@/components/ui/modal-dialog";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { AppIcon } from "@/components/ui/app-icon";
import { MobilePageHeader } from "@/components/ui/mobile-layout";
import { FolderUnlockDialog } from "@/components/content/folder-unlock-dialog";
import type { PhotosWorkspaceData, StoredPhoto } from "@/lib/photos/types";
import mobileStyles from "@/components/photos/photos-mobile.module.css";

const maxPhotoBytes = 52_428_800;
const formatBytes = (value: number) =>
  value < 1024 * 1024
    ? `${Math.ceil(value / 1024)} KB`
    : `${(value / (1024 * 1024)).toFixed(1)} MB`;
async function sha256(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function CollectionSettings({
  categories,
  folders,
  photo,
}: {
  categories: PhotosWorkspaceData["categories"];
  folders: PhotosWorkspaceData["folders"];
  photo?: StoredPhoto;
}) {
  return (
    <details className="collection-settings">
      <summary>
        收藏設定 <small>可複選</small>
      </summary>
      <div className="collection-settings-menu">
        <label>
          <input
            defaultChecked={photo?.favorite}
            name="favorite"
            type="checkbox"
          />{" "}
          我的最愛
        </label>
        <label>
          <input defaultChecked={photo?.pinned} name="pinned" type="checkbox" />{" "}
          置頂
        </label>
        <label>
          <input
            defaultChecked={photo?.archived}
            name="archived"
            type="checkbox"
          />{" "}
          封存
        </label>
        <div className="collection-settings-divider" />
        <TaxonomyMultiSelect categories={categories} defaultCategoryIds={photo?.categories.map((item) => item.id) ?? []} defaultFolderIds={photo?.folders.map((item) => item.id) ?? []} folders={folders} />
      </div>
    </details>
  );
}

export function PhotosWorkspace({
  initialData,
  createMode = false,
}: {
  initialData: PhotosWorkspaceData;
  createMode?: boolean;
}) {
  const router = useRouter();
  const createFlow = useCreateFlow();
  const [data, setData] = useState(initialData);
  const [mobileView, setMobileView] = useState<"overview" | "library">("overview");
  const [overviewTab, setOverviewTab] = useState<"all" | "albums">("all");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [showAllPhotos, setShowAllPhotos] = useState(false);
  const [recentMode, setRecentMode] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CollectionView>("all");
  const [category, setCategory] = useState<CollectionCategory>([]);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<StoredPhoto | null>(null);
  const [editing, setEditing] = useState<StoredPhoto | null>(null);
  const [deleting, setDeleting] = useState<StoredPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [overviewLockedFolder, setOverviewLockedFolder] = useState<PhotosWorkspaceData["folders"][number] | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [bulkConfirm, setBulkConfirm] = useState<
    "trash" | "restore" | "permanent" | null
  >(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    const response = await fetch("/api/photos", { cache: "no-store" });
    if (!response.ok) {
      setError("目前無法讀取照片。 ");
      return;
    }
    setData((await response.json()) as PhotosWorkspaceData);
  }, []);
  useCreatedItemRefresh("photo", load);
  useEffect(() => {
    if (!createMode) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [createMode, load]);
  useEffect(() => {
    if (createMode) return;
    const target = window.sessionStorage.getItem("personal-vault:photos:overview-unlock-target");
    if (!target) return;
    window.sessionStorage.removeItem("personal-vault:photos:overview-unlock-target");
    const timer = window.setTimeout(() => {
      setMobileView("library");
      setShowAllPhotos(false);
      setRecentMode(false);
      setFolderIds([target]);
      setView(`folder:${target}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [createMode]);
  useEffect(() => {
    if (mobileView === "library" && mobileSearchOpen) searchInputRef.current?.focus();
  }, [mobileSearchOpen, mobileView]);
  useEffect(() => {
    if (createMode) return;
    const showOverview = () => {
      setMobileView("overview");
      setOverviewTab("all");
      setMobileSearchOpen(false);
      setShowAllPhotos(false);
      setRecentMode(false);
      setQuery("");
      setChosen(new Set());
    };
    window.addEventListener("personal-vault:photos-overview", showOverview);
    return () => window.removeEventListener("personal-vault:photos-overview", showOverview);
  }, [createMode]);
  useEffect(
    () => () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  const photos = useMemo(() => {
      const filtered = data.photos.filter((photo) => {
        if (view === "trash" ? !photo.deletedAt : Boolean(photo.deletedAt))
          return false;
        if (view === "all" && !showAllPhotos && !folderIds.length && (photo.archived || photo.folders.length)) return false;
        if (showAllPhotos && (photo.archived || photo.deletedAt)) return false;
        if (view === "favorite" && (!photo.favorite || photo.archived))
          return false;
        if (view === "pinned" && (!photo.pinned || photo.archived))
          return false;
        if (view === "archived" && !photo.archived) return false;
        if (
          folderIds.length &&
          (photo.archived || !photo.folders.some((folder) => folderIds.includes(folder.id)))
        )
          return false;
        if (category.includes("unclassified") && photo.categories.length) return false;
        if (
          category.length &&
          !category.includes("unclassified") &&
          !photo.categories.some((itemCategory) => category.includes(itemCategory.id))
        )
          return false;
        return `${photo.title} ${photo.description ?? ""} ${photo.originalFilename}`
          .toLowerCase()
          .includes(query.toLowerCase());
      });
      return recentMode
        ? filtered.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        : filtered;
    }, [category, data.photos, folderIds, query, recentMode, showAllPhotos, view]);
  const overviewPhotos = useMemo(
    () => data.photos
      .filter((photo) => !photo.deletedAt && !photo.archived)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()),
    [data.photos],
  );
  const visibleFolders = useMemo(() => data.folders.filter((folder) => folder.is_visible), [data.folders]);
  const unorganizedPhotos = useMemo(() => overviewPhotos.filter((photo) => photo.folders.length === 0), [overviewPhotos]);
  const recentPhotos = overviewPhotos.slice(0, 6);
  const overviewFolderList = overviewTab === "all" ? visibleFolders.slice(0, 4) : visibleFolders;
  const folderPreview = (folderId: string) =>
    overviewPhotos.find((photo) => photo.folders.some((folder) => folder.id === folderId));
  const openLibrary = ({ all = false, focusSearch = false, recent = false, trash = false }: { all?: boolean; focusSearch?: boolean; recent?: boolean; trash?: boolean } = {}) => {
    setMobileView("library");
    setMobileSearchOpen(focusSearch);
    setShowAllPhotos(all || recent);
    setRecentMode(recent);
    setFolderIds([]);
    setCategory([]);
    setView(trash ? "trash" : "all");
    if (!focusSearch) setQuery("");
    setChosen(new Set());
  };
  const openFolder = (folderId: string | null) => {
    const folder = folderId ? data.folders.find((item) => item.id === folderId) : null;
    if (folder?.is_locked && !folder.is_unlocked) {
      setOverviewLockedFolder(folder);
      return;
    }
    setMobileView("library");
    setMobileSearchOpen(false);
    setShowAllPhotos(false);
    setRecentMode(false);
    setQuery("");
    setCategory([]);
    setFolderIds(folderId ? [folderId] : []);
    setView(folderId ? `folder:${folderId}` : "all");
    setChosen(new Set());
  };
  const libraryTitle = view === "trash"
    ? "回收桶"
    : recentMode
      ? "最近上傳"
      : showAllPhotos
        ? "全部照片"
        : folderIds.length
          ? data.folders.find((folder) => folder.id === folderIds[0])?.name ?? "照片"
          : "未整理";
  function pickPreview(file: File | null) {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(file ? URL.createObjectURL(file) : "");
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("photo");
    if (!(file instanceof File) || !file.size) {
      setError("請選擇照片。 ");
      return;
    }
    if (!file.type.startsWith("image/") || file.size > maxPhotoBytes) {
      setError("請選擇 50 MB 以下的 JPG、PNG、WebP、GIF 或 AVIF 圖片。 ");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const hash = await sha256(file);
      const ticketResponse = await fetch("/api/photos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalFilename: file.name,
          mimeType: file.type,
          byteSize: file.size,
          sha256: hash,
        }),
      });
      const ticket = await ticketResponse.json();
      if (!ticketResponse.ok)
        throw new Error(ticket.error ?? "無法準備照片上傳。");
      const { error: uploadError } = await createBrowserStorageManager()
        .uploadToSignedUrl("vault-files", ticket.storagePath, ticket.token, file, {
          contentType: file.type,
        });
      if (uploadError) throw uploadError;
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: ticket.ticket,
          title: String(form.get("title") || file.name),
          description: String(form.get("description") || ""),
          categoryIds: form.getAll("categoryIds").map(String),
          folderIds: form.getAll("folderIds").map(String),
          favorite: form.get("favorite") === "on",
          pinned: form.get("pinned") === "on",
          archived: form.get("archived") === "on",
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "無法儲存照片。");
      if (createMode) {
        if (createFlow) { createFlow.complete(); return; }
        router.replace("/photos");
        router.refresh();
      } else {
        formElement.reset();
        pickPreview(null);
        await load();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法上傳照片。");
    } finally {
      setPending(false);
    }
  }
  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          title: form.get("title"),
          description: form.get("description"),
          categoryIds: form.getAll("categoryIds").map(String),
          folderIds: form.getAll("folderIds").map(String),
          favorite: form.get("favorite") === "on",
          pinned: form.get("pinned") === "on",
          archived: form.get("archived") === "on",
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "無法儲存照片資訊。");
      setEditing(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法儲存照片資訊。");
    } finally {
      setPending(false);
    }
  }
  async function action(photo: StoredPhoto, actionName: "trash" | "restore") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: photo.id, action: actionName }),
      });
      if (!response.ok) throw new Error();
      setSelected(null);
      await load();
    } catch {
      setError("無法更新照片狀態。 ");
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleting.id }),
      });
      if (!response.ok) throw new Error();
      setDeleting(null);
      setSelected(null);
      await load();
    } catch {
      setError("無法永久刪除照片。 ");
    } finally {
      setPending(false);
    }
  }
  const chosenPhotos = photos.filter((photo) => chosen.has(photo.id));
  const toggleAll = () =>
    setChosen(
      chosenPhotos.length === photos.length && photos.length > 0
        ? new Set()
        : new Set(photos.map((photo) => photo.id)),
    );
  async function organizeSelection(change: BulkOrganizeChange) {
    if (!chosenPhotos.length) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/photos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: chosenPhotos.map((photo) => photo.id),
          action: "organize",
          folderIds: change.folderIds,
          categoryIds: change.categoryIds,
          relationMode: change.mode,
        }),
      });
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.error ?? "無法整理照片。",
        );
      setChosen(new Set());
      setOrganizeOpen(false);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法整理照片。");
    } finally {
      setPending(false);
    }
  }
  async function runBulk() {
    if (!bulkConfirm || !chosenPhotos.length) return;
    const ids = chosenPhotos.map((photo) => photo.id);
    setPending(true);
    setError(null);
    try {
      const responses = await Promise.all(
        ids.map((id) =>
          bulkConfirm === "permanent"
            ? fetch("/api/photos", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
              })
            : fetch("/api/photos", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, action: bulkConfirm }),
              }),
        ),
      );
      if (responses.some((response) => !response.ok)) throw new Error();
      setChosen(new Set());
      setBulkConfirm(null);
      await load();
    } catch {
      setError("無法完成批量操作。請稍後再試。");
    } finally {
      setPending(false);
    }
  }
  const form = (
    <form className="file-upload-form photo-upload-form" onSubmit={upload}>
      <div>
        <p className="eyebrow">PRIVATE PHOTO STORAGE</p>
        <h2>上傳照片</h2>
        <p>照片存放於私有空間，只有你登入後才能查看，單張最大 50 MB。</p>
      </div>
      <input
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        aria-label="選擇照片"
        name="photo"
        onChange={(event) => pickPreview(event.target.files?.[0] ?? null)}
        required
        type="file"
      />
      {previewUrl && (
        <img
          alt="待上傳照片預覽"
          className="photo-upload-preview"
          src={previewUrl}
        />
      )}
      <input
        aria-label="照片標題"
        name="title"
        placeholder="照片標題（未填則使用檔名）"
      />
      <textarea
        aria-label="照片說明"
        name="description"
        placeholder="說明（選填）"
        rows={2}
      />
      <CollectionSettings categories={data.categories} folders={data.folders} />
      <CreateFormActions pending={pending} returnHref="/photos" label="儲存" pendingLabel="上傳中…" />
    </form>
  );
  if (createMode)
    return (
      <section className="files-workspace create-only">
        {pending && <OperationStatus label="正在上傳照片…" />}
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {form}
      </section>
    );
  return (
    <section className={`library-workspace ${mobileStyles.photosWorkspace}`}>
      {pending && <OperationStatus label="正在處理照片…" />}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <section className={mobileStyles.mobileOverview} data-active={mobileView === "overview"}>
        <MobilePageHeader
          eyebrow="PHOTOS"
          title="照片儲存"
          actions={<>
            <button aria-label="搜尋照片" className="mobile-icon-button" onClick={() => openLibrary({ all: true, focusSearch: true })} type="button">
              <AppIcon name="search" />
            </button>
            <CreateItemButton className={mobileStyles.overviewAddButton} kind="photo">
              <AppIcon name="plus" />
              <span>上傳</span>
            </CreateItemButton>
          </>}
        />
        <nav aria-label="照片首頁檢視" className={mobileStyles.overviewTabs}>
          <button aria-current={overviewTab === "all" ? "page" : undefined} className={overviewTab === "all" ? mobileStyles.active : ""} onClick={() => setOverviewTab("all")} type="button">全部</button>
          <button aria-current={overviewTab === "albums" ? "page" : undefined} className={overviewTab === "albums" ? mobileStyles.active : ""} onClick={() => setOverviewTab("albums")} type="button">相簿</button>
          <button onClick={() => openLibrary({ recent: true })} type="button">最近</button>
          <button onClick={() => openLibrary({ trash: true })} type="button">回收桶</button>
        </nav>

        <section className={mobileStyles.overviewSection}>
          <header>
            <h2>照片資料夾</h2>
            {overviewTab === "all" && visibleFolders.length > overviewFolderList.length ? (
              <button className={mobileStyles.sectionLink} onClick={() => setOverviewTab("albums")} type="button">查看全部 <span aria-hidden="true">›</span></button>
            ) : null}
          </header>
          <div className={mobileStyles.folderGrid}>
            <button onClick={() => openLibrary({ all: true })} type="button">
              <span className={mobileStyles.folderCover}>
                {overviewPhotos[0] ? <img alt="" src={overviewPhotos[0].imageUrl} /> : <AppIcon name="photo" />}
              </span>
              <strong>全部照片</strong>
              <small>{overviewPhotos.length} 張照片</small>
            </button>
            <button onClick={() => openFolder(null)} type="button">
              <span className={mobileStyles.folderCover}>
                {unorganizedPhotos[0] ? <img alt="" src={unorganizedPhotos[0].imageUrl} /> : <AppIcon name="folder" />}
              </span>
              <strong>未整理</strong>
              <small>{unorganizedPhotos.length} 張照片</small>
            </button>
            {overviewFolderList.map((folder) => {
              const preview = !folder.is_locked || folder.is_unlocked ? folderPreview(folder.id) : undefined;
              return (
                <button key={folder.id} onClick={() => openFolder(folder.id)} type="button">
                  <span className={mobileStyles.folderCover} data-locked={folder.is_locked && !folder.is_unlocked ? "true" : undefined}>
                    {preview ? <img alt="" src={preview.imageUrl} /> : <AppIcon name={folder.is_locked && !folder.is_unlocked ? "lock" : "folder"} />}
                  </span>
                  <strong>{folder.name}</strong>
                  <small>{folder.item_count ?? 0} 張照片</small>
                </button>
              );
            })}
          </div>
          {overviewTab === "albums" && !visibleFolders.length ? <p className={mobileStyles.compactEmpty}>還沒有自訂照片資料夾</p> : null}
        </section>

        {overviewTab === "all" ? (
          <section className={mobileStyles.overviewSection}>
            <header>
              <h2>最近上傳</h2>
              {recentPhotos.length ? <button className={mobileStyles.sectionLink} onClick={() => openLibrary({ recent: true })} type="button">查看全部 <span aria-hidden="true">›</span></button> : null}
            </header>
            {recentPhotos.length ? (
              <div className={mobileStyles.recentGrid}>
                {recentPhotos.map((photo) => (
                  <button aria-label={`預覽 ${photo.title}`} key={photo.id} onClick={() => setSelected(photo)} type="button">
                    <img alt={photo.title} src={photo.imageUrl} />
                  </button>
                ))}
              </div>
            ) : <p className={mobileStyles.compactEmpty}>尚未上傳照片</p>}
          </section>
        ) : null}
      </section>
      <div className={mobileStyles.managementView} data-active={mobileView === "library"}>
      <MobilePageHeader
        eyebrow="PHOTO LIBRARY"
        title={libraryTitle}
        leading={<button aria-label="返回照片首頁" className="mobile-icon-button" onClick={() => { setMobileView("overview"); setMobileSearchOpen(false); setQuery(""); setChosen(new Set()); }} type="button"><span aria-hidden="true">‹</span></button>}
        actions={<>
          <button aria-expanded={mobileSearchOpen} aria-label="搜尋照片" className="mobile-icon-button" onClick={() => { setMobileSearchOpen(true); window.requestAnimationFrame(() => searchInputRef.current?.focus()); }} type="button">
            <AppIcon name="search" />
          </button>
          <CreateItemButton className="mobile-header-create-button" kind="photo"><AppIcon name="plus" /><span className="sr-only">上傳照片</span></CreateItemButton>
        </>}
      />
      <div className="library-heading">
        <div>
          <p className="eyebrow">PRIVATE PHOTOS</p>
          <h2>照片</h2>
        </div>
      </div>
      <CollectionNavigation
        categories={data.categories}
        category={category}
        folderIds={folderIds}
        folders={data.folders}
        items={data.photos}
        mobileAppActions
        setCategory={setCategory}
        setFolderIds={(value) => { setShowAllPhotos(false); setRecentMode(false); setFolderIds(value); }}
        setView={(value) => { setShowAllPhotos(false); setRecentMode(false); setView(value); }}
        storageKey="personal-vault:photo-system-folders:v1"
        view={view}
      />
      <div className={mobileStyles.librarySearch} data-open={mobileSearchOpen}>
        <input
          aria-label="搜尋照片"
          className="note-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋照片標題或說明"
          ref={searchInputRef}
          value={query}
        />
        <button aria-label="關閉搜尋" className={mobileStyles.searchClose} onClick={() => { setQuery(""); setMobileSearchOpen(false); }} type="button">×</button>
      </div>
      <div className="bulk-toolbar">
        <label>
          <input
            checked={photos.length > 0 && chosenPhotos.length === photos.length}
            onChange={toggleAll}
            type="checkbox"
          />{" "}
          全選目前清單
        </label>
      </div>
      <BatchActionBar count={chosenPhotos.length} onCancel={() => setChosen(new Set())}>
        {view === "trash" ? (<>
          <button className="button" disabled={pending} onClick={() => setBulkConfirm("restore")} type="button">還原</button>
          <button className="delete-button" disabled={pending} onClick={() => setBulkConfirm("permanent")} type="button">永久刪除</button>
        </>) : (<>
          <button className="secondary-button" disabled={pending} onClick={() => setOrganizeOpen(true)} type="button">整理</button>
          <button className="delete-button" disabled={pending} onClick={() => setBulkConfirm("trash")} type="button">刪除</button>
        </>)}
      </BatchActionBar>
      <div className={mobileStyles.mobileGridHeading}>
        <strong>{view === "trash" ? "垃圾桶" : query.trim() ? "搜尋結果" : "全部照片"}</strong>
        <span>{photos.length} 張</span>
      </div>
      <div className={`photo-grid ${mobileStyles.photoGrid}`}>
        {photos.map((photo) => (
          <div className={`photo-card-wrap ${mobileStyles.photoCardWrap}`} key={photo.id}>
            <label className="item-select">
              <input
                aria-label="選擇照片"
                checked={chosen.has(photo.id)}
                onChange={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    if (next.has(photo.id)) next.delete(photo.id);
                    else next.add(photo.id);
                    return next;
                  })
                }
                type="checkbox"
              />
            </label>
            <button
              className="photo-card"
              onClick={() => setSelected(photo)}
              type="button"
            >
              <img alt={photo.title} src={photo.imageUrl} />
              <span>
                <small>
                  {photo.categories.map((category) => category.name).join("、") || "未分類"}
                  {photo.folders.length > 0 && ` · ${photo.folders.map((folder) => folder.name).join("、")}`}
                </small>
                <strong>{photo.title}</strong>
                {photo.description && <em>{photo.description}</em>}
              </span>
            </button>
          </div>
        ))}
        {photos.length === 0 && <p className="lead">此清單尚無照片。</p>}
      </div>
      </div>
      <BulkOrganizeDialog categories={data.categories} count={chosenPhotos.length} folders={data.folders} onClose={() => setOrganizeOpen(false)} onSave={organizeSelection} open={organizeOpen} pending={pending} />
      <ModalDialog
        onClose={() => setSelected(null)}
        open={Boolean(selected)}
        pending={pending}
        title={selected?.title ?? "照片資訊"}
      >
        {selected && (
          <>
            <img
              alt={selected.title}
              className="photo-detail-image"
              src={selected.imageUrl}
            />
            <p className="detail-content">
              {selected.description || "沒有說明。"}
            </p>
            <p className="bookmark-meta">
              {selected.originalFilename} · {formatBytes(selected.byteSize)}
            </p>
            <div className="dialog-actions">
              <a className="secondary-button" download={selected.originalFilename} href={`/api/photos?download=${encodeURIComponent(selected.id)}`} rel="noreferrer" target="_blank">
                <AppIcon name="download" />
                下載原圖
              </a>
              {selected.deletedAt ? (
                <>
                  <button
                    className="button"
                    onClick={() => void action(selected, "restore")}
                    type="button"
                  >
                    還原
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => setDeleting(selected)}
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
                      setEditing(selected);
                      setSelected(null);
                    }}
                    type="button"
                  >
                    修改
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => void action(selected, "trash")}
                    type="button"
                  >
                    刪除
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </ModalDialog>
      <ModalDialog
        onClose={() => setEditing(null)}
        open={Boolean(editing)}
        pending={pending}
        title="修改照片資訊"
      >
        {editing && (
          <form className="note-editor" onSubmit={saveEdit}>
            <label>
              標題
              <input defaultValue={editing.title} name="title" required />
            </label>
            <label>
              說明
              <textarea
                defaultValue={editing.description ?? ""}
                name="description"
                rows={3}
              />
            </label>
            <CollectionSettings categories={data.categories} folders={data.folders} photo={editing} />
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
        )}
      </ModalDialog>
      <ConfirmDialog
        description={`「${deleting?.title ?? ""}」將永久刪除，無法還原。`}
        error={error}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
        open={Boolean(deleting)}
        pending={pending}
        title="永久刪除照片？"
      />
      <ConfirmDialog
        confirmLabel={
          bulkConfirm === "permanent"
            ? "永久刪除"
            : bulkConfirm === "restore"
              ? "還原"
              : "移至垃圾桶"
        }
        description={
          bulkConfirm === "permanent"
            ? `確定要永久刪除選取的 ${chosenPhotos.length} 張照片嗎？此操作無法復原。`
            : bulkConfirm === "restore"
              ? `確定要還原選取的 ${chosenPhotos.length} 張照片嗎？`
              : `確定要將選取的 ${chosenPhotos.length} 張照片移至垃圾桶嗎？`
        }
        error={error}
        onCancel={() => setBulkConfirm(null)}
        onConfirm={() => void runBulk()}
        open={Boolean(bulkConfirm)}
        pending={pending}
        title={
          bulkConfirm === "permanent"
            ? "永久刪除照片？"
            : bulkConfirm === "restore"
              ? "批量還原照片？"
              : "批量移至垃圾桶？"
        }
      />
      <FolderUnlockDialog
        folder={overviewLockedFolder}
        kind="photo"
        onClose={() => setOverviewLockedFolder(null)}
        onUnlocked={() => {
          if (!overviewLockedFolder) return;
          window.sessionStorage.setItem("personal-vault:photos:overview-unlock-target", overviewLockedFolder.id);
          window.location.reload();
        }}
      />
    </section>
  );
}

"use client";
import { useCreateFlow, useCreatedItemRefresh } from "@/components/ui/create-item-modal";
import { CreateFormActions } from "@/components/ui/create-form-actions";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordDashboardOpen } from "@/lib/dashboard/record-open";
import { createBrowserStorageManager } from "@/lib/storage/client";
import {
  CollectionCategory,
  CollectionNavigation,
  CollectionView,
} from "@/components/content/collection-navigation";
import {
  CoverImageField,
  type CoverSelection,
  uploadCover,
} from "@/components/content/cover-image-field";
import { BulkOrganizeDialog, type BulkOrganizeChange } from "@/components/content/bulk-organize-dialog";
import { TaxonomyMultiSelect } from "@/components/content/taxonomy-multi-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { useBackgroundSave } from "@/components/background-save/background-save-provider";
import type { FilesWorkspaceData } from "@/lib/files/types";

const maxFileBytes = 52_428_800;
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

export function FilesWorkspace({
  initialData,
  createMode = false,
}: {
  initialData: FilesWorkspaceData;
  createMode?: boolean;
}) {
  const router = useRouter();
  const createFlow = useCreateFlow();
  const backgroundJobs = useBackgroundSave();
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const pending = false;
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [view, setView] = useState<CollectionView>("all");
  const [category, setCategory] = useState<CollectionCategory>([]);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [cover, setCover] = useState<CoverSelection>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { if (selectedId) recordDashboardOpen(selectedId); }, [selectedId]);
  const dashboardTargetHandled = useRef(false);
  useEffect(() => {
    if (createMode || dashboardTargetHandled.current) return;
    const target = new URLSearchParams(window.location.search).get("item");
    if (!target || !data.files.some((entry) => entry.id === target)) return;
    dashboardTargetHandled.current = true;
    queueMicrotask(() => setSelectedId(target));
  }, [createMode, data.files]);
  const [bulkConfirm, setBulkConfirm] = useState<
    "trash" | "restore" | "permanent" | null
  >(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const load = useCallback(async () => {
    const response = await fetch("/api/files", { cache: "no-store" });
    if (!response.ok) {
      setError("目前無法讀取檔案。");
      return;
    }
    setData((await response.json()) as FilesWorkspaceData);
  }, []);
  useCreatedItemRefresh("file", load);
  useEffect(() => {
    if (createMode) void load();
  }, [createMode, load]);
  const files = useMemo(
    () =>
      data.files.filter((file) => {
        if (view === "trash" ? !file.deletedAt : Boolean(file.deletedAt))
          return false;
        if (view === "all" && !folderIds.length && (file.archived || file.folders.length)) return false;
        if (view === "favorite" && (!file.favorite || file.archived))
          return false;
        if (view === "pinned" && (!file.pinned || file.archived)) return false;
        if (view === "archived" && !file.archived) return false;
        if (
          folderIds.length &&
          (file.archived || !file.folders.some((folder) => folderIds.includes(folder.id)))
        )
          return false;
        if (category.includes("unclassified") && file.categories.length) return false;
        if (
          category.length &&
          !category.includes("unclassified") &&
          !file.categories.some((itemCategory) => category.includes(itemCategory.id))
        )
          return false;
        return `${file.title} ${file.description ?? ""} ${file.originalFilename}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [category, data.files, folderIds, query, view],
  );
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("請選擇檔案。");
      return;
    }
    if (file.size > maxFileBytes) {
      setError("單一檔案上限為 50 MB。");
      return;
    }
    setError(null);
    const uploadCoverSelection = cover;
    const metadata = {
      title: String(form.get("title") || file.name),
      description: String(form.get("description") || ""),
      categoryIds: form.getAll("categoryIds").map(String),
      folderIds: form.getAll("folderIds").map(String),
      favorite: form.get("favorite") === "on",
      pinned: form.get("pinned") === "on",
      archived: form.get("archived") === "on",
      tags: [] as string[],
    };
    backgroundJobs.enqueue({
      type: "file-upload",
      title: "上傳檔案",
      description: file.name,
      operation: "上傳檔案",
      page: "/files",
      persist: false,
      execute: async ({ signal, reportProgress }) => {
      reportProgress(undefined, "正在計算檔案雜湊");
      const hash = await sha256(file);
      reportProgress(undefined, "正在準備上傳");
      const ticketResponse = await fetch("/api/files/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalFilename: file.name,
          mimeType: file.type || "application/octet-stream",
          byteSize: file.size,
          sha256: hash,
        }),
        signal,
      });
      const ticket = await ticketResponse.json();
      if (!ticketResponse.ok) throw new Error(ticket.error ?? "無法準備上傳。");
      reportProgress(undefined, "正在上傳檔案");
      const { error: uploadError } = await createBrowserStorageManager()
        .uploadToSignedUrl("vault-files", ticket.storagePath, ticket.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) throw uploadError;
      reportProgress(undefined, uploadCoverSelection ? "正在上傳封面" : "正在完成檔案資料");
      const coverTicket = await uploadCover(uploadCoverSelection);
      const completeResponse = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: ticket.ticket,
          ...metadata,
          coverTicket,
        }),
        signal,
      });
      const completed = await completeResponse.json();
      if (!completeResponse.ok)
        throw new Error(completed.error ?? "無法完成上傳。");
      reportProgress(100, "上傳完成");
      return completed;
      },
      onSuccess: () => load(),
      onError: (cause) => setError(cause.message || "無法上傳檔案。"),
    });
    formElement.reset();
    setCover(null);
    if (createMode) {
      if (createFlow) createFlow.complete();
      else router.replace("/files");
    }
  }
  async function download(id: string) {
    setError(null);
    const response = await fetch(
      `/api/files?download=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.url) {
      setError(result?.error ?? "無法準備下載。");
      return;
    }
    window.location.assign(result.url);
  }
  async function remove() {
    if (!deletingId) return;
    setError(null);
    const removed = data.files.find((item) => item.id === deletingId);
    if (!removed) return;
    setData((current) => ({ ...current, files: current.files.filter((item) => item.id !== removed.id) }));
    setDeletingId(null);
    setSelectedId(null);
    backgroundJobs.enqueue({
      type: "file",
      title: "永久刪除檔案",
      operation: "永久刪除",
      page: "/files",
      entityKey: `file:${removed.id}`,
      request: { url: "/api/files", method: "DELETE", body: { id: removed.id } },
      rollback: () => setData((current) => ({ ...current, files: current.files.some((item) => item.id === removed.id) ? current.files : [removed, ...current.files] })),
      onError: () => setError("無法永久刪除檔案，項目已恢復。"),
    });
  }
  async function action(id: string, actionName: "trash" | "restore") {
    setError(null);
    const previous = data.files.find((item) => item.id === id);
    if (!previous) return;
    const optimistic = { ...previous, deletedAt: actionName === "trash" ? new Date().toISOString() : null };
    setData((current) => ({ ...current, files: current.files.map((item) => item.id === id ? optimistic : item) }));
    setSelectedId(null);
    backgroundJobs.enqueue({
      type: "file",
      title: actionName === "trash" ? "刪除檔案" : "還原檔案",
      operation: actionName === "trash" ? "移至垃圾桶" : "還原檔案",
      page: "/files",
      entityKey: `file:${id}`,
      request: { url: "/api/files", method: "PATCH", body: { id, action: actionName } },
      rollback: () => setData((current) => ({ ...current, files: current.files.map((item) => item.id === id ? previous : item) })),
      onSuccess: () => load(),
      onError: () => setError("無法更新檔案狀態，項目已恢復。"),
    });
  }
  const chosenFiles = files.filter((file) => chosen.has(file.id));
  const toggleAll = () =>
    setChosen(
      chosenFiles.length === files.length && files.length > 0
        ? new Set()
        : new Set(files.map((file) => file.id)),
    );
  async function organizeSelection(change: BulkOrganizeChange) {
    if (!chosenFiles.length) return;
    setError(null);
    const ids = chosenFiles.map((file) => file.id);
    const previous = data.files;
    setChosen(new Set());
    setOrganizeOpen(false);
    backgroundJobs.enqueue({
      type: "file-batch",
      title: `批量整理 ${ids.length} 個檔案`,
      operation: "批量整理",
      page: "/files",
      request: { url: "/api/files", method: "PATCH", body: { ids, action: "organize", folderIds: change.folderIds, categoryIds: change.categoryIds, relationMode: change.mode } },
      rollback: () => setData((current) => ({ ...current, files: previous })),
      onSuccess: () => load(),
      onError: (cause) => setError(cause.message || "無法整理檔案。"),
    });
  }
  async function runBulk() {
    if (!bulkConfirm || !chosenFiles.length) return;
    const ids = chosenFiles.map((file) => file.id);
    setError(null);
    const previous = data.files;
    const operation = bulkConfirm;
    setData((current) => ({ ...current, files: operation === "permanent" ? current.files.filter((item) => !ids.includes(item.id)) : current.files.map((item) => ids.includes(item.id) ? { ...item, deletedAt: operation === "trash" ? new Date().toISOString() : null } : item) }));
    setChosen(new Set());
    setBulkConfirm(null);
    backgroundJobs.enqueue({
      type: "file-batch",
      title: `${operation === "permanent" ? "永久刪除" : operation === "restore" ? "還原" : "刪除"} ${ids.length} 個檔案`,
      operation: operation === "permanent" ? "批量永久刪除" : operation === "restore" ? "批量還原" : "批量移至垃圾桶",
      page: "/files",
      execute: async ({ reportProgress }) => {
        reportProgress(undefined, `0 / ${ids.length}`);
        const responses = await Promise.all(
        ids.map((id) =>
          operation === "permanent"
            ? fetch("/api/files", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
              })
            : fetch("/api/files", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, action: operation }),
              }),
        ),
      );
      if (responses.some((response) => !response.ok)) throw new Error();
        reportProgress(100, `${ids.length} / ${ids.length}`);
        return { ok: true };
      },
      rollback: () => setData((current) => ({ ...current, files: previous })),
      onSuccess: () => load(),
      onError: () => setError("無法完成批量操作，清單已恢復。"),
    });
  }
  const uploadForm = (
    <form className="file-upload-form" onSubmit={upload}>
      <div>
        <p className="eyebrow">PRIVATE FILE STORAGE</p>
        <h2>上傳檔案</h2>
        <p>檔案直接傳至私有儲存空間，最大 50 MB。</p>
      </div>
      <input aria-label="選擇檔案" name="file" required type="file" />
      <input
        aria-label="檔案標題"
        name="title"
        placeholder="檔案標題（未填則使用檔名）"
      />
      <textarea
        aria-label="檔案說明"
        name="description"
        placeholder="說明（選填）"
        rows={2}
      />
      <details className="collection-settings">
        <summary>
          收藏設定 <small>可複選</small>
        </summary>
        <div className="collection-settings-menu">
          <label>
            <input name="favorite" type="checkbox" /> 我的最愛
          </label>
          <label>
            <input name="pinned" type="checkbox" /> 置頂
          </label>
          <label>
            <input name="archived" type="checkbox" /> 封存
          </label>
          <div className="collection-settings-divider" />
          <TaxonomyMultiSelect categories={data.categories} folders={data.folders} />
        </div>
      </details>
      <CoverImageField onChange={setCover} />
      <CreateFormActions pending={pending} returnHref="/files" label="儲存" pendingLabel="上傳中…" />
    </form>
  );
  if (createMode)
    return (
      <section className="files-workspace create-only">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {uploadForm}
      </section>
    );
  const selected = data.files.find((item) => item.id === selectedId) ?? null;
  return (
    <section className="library-workspace">
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="library-heading">
        <div>
          <p className="eyebrow">SECURE FILES</p>
          <h2>檔案保管</h2>
        </div>
      </div>
      <CollectionNavigation
        categories={data.categories}
        category={category}
        folderIds={folderIds}
        folders={data.folders}
        items={data.files}
        setCategory={setCategory}
        setFolderIds={setFolderIds}
        setView={setView}
        storageKey="personal-vault:file-system-folders:v1"
        view={view}
      />
      <input
        aria-label="搜尋檔案"
        className="note-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜尋檔案名稱或說明"
        value={query}
      />
      <div className="bulk-toolbar">
        <label>
          <input
            checked={files.length > 0 && chosenFiles.length === files.length}
            onChange={toggleAll}
            type="checkbox"
          />{" "}
          全選目前清單
        </label>
      </div>
      <BatchActionBar count={chosenFiles.length} onCancel={() => setChosen(new Set())}>
        {view === "trash" ? (<>
          <button className="button" disabled={pending} onClick={() => setBulkConfirm("restore")} type="button">還原</button>
          <button className="delete-button" disabled={pending} onClick={() => setBulkConfirm("permanent")} type="button">永久刪除</button>
        </>) : (<>
          <button className="secondary-button" disabled={pending} onClick={() => setOrganizeOpen(true)} type="button">整理</button>
          <button className="delete-button" disabled={pending} onClick={() => setBulkConfirm("trash")} type="button">刪除</button>
        </>)}
      </BatchActionBar>
      <div className="content-item-list">
        {files.map((file) => (
          <article className="content-item-card" key={file.id}>
            <label className="item-select">
              <input
                aria-label="選擇檔案"
                checked={chosen.has(file.id)}
                onChange={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    next.has(file.id)
                      ? next.delete(file.id)
                      : next.add(file.id);
                    return next;
                  })
                }
                type="checkbox"
              />
            </label>
            <button
              className="content-item-open"
              onClick={() => setSelectedId(file.id)}
              type="button"
            >
              {file.coverImageUrl ? (
                <img alt="" src={file.coverImageUrl} />
              ) : (
                <span className="content-cover-placeholder">檔案</span>
              )}
              <div>
                <p className="bookmark-meta">
                  {file.categories.map((category) => category.name).join("、") || "未分類"}
                  {file.folders.length > 0 && ` · ${file.folders.map((folder) => folder.name).join("、")}`}
                </p>
                <h3>{file.title}</h3>
                <p>
                  {file.description ||
                    `${file.originalFilename} · ${formatBytes(file.byteSize)}`}
                </p>
              </div>
            </button>
          </article>
        ))}
        {files.length === 0 && <p className="lead">此清單尚未找到檔案。</p>}
      </div>
      <BulkOrganizeDialog categories={data.categories} count={chosenFiles.length} folders={data.folders} onClose={() => setOrganizeOpen(false)} onSave={organizeSelection} open={organizeOpen} pending={pending} />
      <ModalDialog
        onClose={() => setSelectedId(null)}
        open={Boolean(selected)}
        pending={pending}
        title={selected?.title ?? "檔案資訊"}
      >
        {selected && (
          <>
            <p className="detail-content">
              {selected.description || "沒有說明。"}
            </p>
            <p className="bookmark-meta">
              {selected.originalFilename} · {formatBytes(selected.byteSize)}
            </p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={() => void download(selected.id)}
                type="button"
              >
                下載
              </button>
              {selected.deletedAt ? (
                <>
                  <button
                    className="button"
                    onClick={() => void action(selected.id, "restore")}
                    type="button"
                  >
                    還原
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => setDeletingId(selected.id)}
                    type="button"
                  >
                    永久刪除
                  </button>
                </>
              ) : (
                <button
                  className="delete-button"
                  onClick={() => void action(selected.id, "trash")}
                  type="button"
                >
                  刪除
                </button>
              )}
            </div>
          </>
        )}
      </ModalDialog>
      <ConfirmDialog
        description="此檔案將從私有儲存空間永久刪除，無法還原。"
        error={error}
        onCancel={() => setDeletingId(null)}
        onConfirm={() => {
          void remove();
        }}
        open={Boolean(deletingId)}
        pending={pending}
        title="永久刪除檔案？"
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
            ? `確定要永久刪除選取的 ${chosenFiles.length} 筆檔案嗎？此操作無法復原。`
            : bulkConfirm === "restore"
              ? `確定要還原選取的 ${chosenFiles.length} 筆檔案嗎？`
              : `確定要將選取的 ${chosenFiles.length} 筆檔案移至垃圾桶嗎？`
        }
        error={error}
        onCancel={() => setBulkConfirm(null)}
        onConfirm={() => void runBulk()}
        open={Boolean(bulkConfirm)}
        pending={pending}
        title={
          bulkConfirm === "permanent"
            ? "永久刪除檔案？"
            : bulkConfirm === "restore"
              ? "批量還原檔案？"
              : "批量移至垃圾桶？"
        }
      />
    </section>
  );
}

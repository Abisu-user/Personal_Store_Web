"use client";
import { useCreateFlow, useCreatedItemRefresh } from "@/components/ui/create-item-modal";
import { CreateFormActions } from "@/components/ui/create-form-actions";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordDashboardOpen } from "@/lib/dashboard/record-open";
import {
  CollectionCategory,
  CollectionNavigation,
  CollectionView,
} from "@/components/content/collection-navigation";
import { BulkOrganizeDialog, type BulkOrganizeChange } from "@/components/content/bulk-organize-dialog";
import { TaxonomyMultiSelect } from "@/components/content/taxonomy-multi-select";
import {
  CoverImageField,
  type CoverSelection,
  uploadCover,
} from "@/components/content/cover-image-field";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AppIcon } from "@/components/ui/app-icon";
import { ModalDialog } from "@/components/ui/modal-dialog";
import { BatchActionBar } from "@/components/ui/batch-action-bar";
import { useBackgroundSave } from "@/components/background-save/background-save-provider";
import mobileStyles from "@/components/ui/mobile-library.module.css";
import type { Note, NotesWorkspaceData } from "@/lib/notes/types";

function CollectionSettings({
  categories,
  folders,
  note,
}: {
  categories: NotesWorkspaceData["categories"];
  folders: NotesWorkspaceData["folders"];
  note?: Note;
}) {
  return (
    <details className="collection-settings">
      <summary>
        收藏設定 <small>可複選</small>
      </summary>
      <div className="collection-settings-menu">
        <label>
          <input
            defaultChecked={note?.favorite}
            name="favorite"
            type="checkbox"
          />{" "}
          我的最愛
        </label>
        <label>
          <input defaultChecked={note?.pinned} name="pinned" type="checkbox" />{" "}
          置頂
        </label>
        <label>
          <input
            defaultChecked={note?.archived}
            name="archived"
            type="checkbox"
          />{" "}
          封存
        </label>
        <div className="collection-settings-divider" />
        <TaxonomyMultiSelect categories={categories} defaultCategoryIds={note?.categories.map((item) => item.id) ?? []} defaultFolderIds={note?.folders.map((item) => item.id) ?? []} folders={folders} />
      </div>
    </details>
  );
}

export function NotesWorkspace({
  initialData,
  createMode = false,
}: {
  initialData: NotesWorkspaceData;
  createMode?: boolean;
}) {
  const router = useRouter();
  const createFlow = useCreateFlow();
  const backgroundJobs = useBackgroundSave();
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<CollectionView>("all");
  const [category, setCategory] = useState<CollectionCategory>([]);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pending = false;
  const [selected, setSelected] = useState<Note | null>(null);
  useEffect(() => { if (selected?.id) recordDashboardOpen(selected.id); }, [selected?.id]);
  const dashboardTargetHandled = useRef(false);
  useEffect(() => {
    if (createMode || dashboardTargetHandled.current) return;
    const target = new URLSearchParams(window.location.search).get("item");
    const item = target ? data.notes.find((entry) => entry.id === target) : null;
    if (!item) return;
    dashboardTargetHandled.current = true;
    queueMicrotask(() => setSelected(item));
  }, [createMode, data.notes]);
  const [editing, setEditing] = useState<Note | null>(null);
  const [confirm, setConfirm] = useState<{
    note: Note;
    permanent: boolean;
  } | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<
    "trash" | "restore" | "permanent" | null
  >(null);
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [cover, setCover] = useState<CoverSelection>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/notes", { cache: "no-store" });
    if (!response.ok) {
      setError("目前無法讀取筆記。");
      return;
    }
    setData((await response.json()) as NotesWorkspaceData);
  }, []);
  useCreatedItemRefresh("note", load);
  useEffect(() => {
    if (createMode) void load();
  }, [createMode, load]);
  const notes = useMemo(
    () =>
      data.notes.filter((note) => {
        if (view === "trash" ? !note.deletedAt : Boolean(note.deletedAt))
          return false;
        if (view === "all" && !folderIds.length && (note.archived || note.folders.length)) return false;
        if (view === "favorite" && (!note.favorite || note.archived))
          return false;
        if (view === "pinned" && (!note.pinned || note.archived)) return false;
        if (view === "archived" && !note.archived) return false;
        if (
          folderIds.length &&
          (note.archived || !note.folders.some((folder) => folderIds.includes(folder.id)))
        )
          return false;
        if (category.includes("unclassified") && note.categories.length) return false;
        if (
          category.length &&
          !category.includes("unclassified") &&
          !note.categories.some((itemCategory) => category.includes(itemCategory.id))
        )
          return false;
        return `${note.title} ${note.description ?? ""} ${note.content}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [category, data.notes, folderIds, query, view],
  );
  async function save(event: FormEvent<HTMLFormElement>, note?: Note) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const selectedCover = cover;
    const categoryIds = form.getAll("categoryIds").map(String);
    const selectedFolderIds = form.getAll("folderIds").map(String);
    const body = {
      ...(note ? { id: note.id } : {}),
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      content: String(form.get("content") ?? ""),
      categoryIds,
      folderIds: selectedFolderIds,
      favorite: form.get("favorite") === "on",
      pinned: form.get("pinned") === "on",
      archived: form.get("archived") === "on",
      tags: [] as string[],
    };
    if (note) {
      const optimistic: Note = {
        ...note,
        title: body.title,
        description: body.description || null,
        content: body.content,
        favorite: body.favorite,
        pinned: body.pinned,
        archived: body.archived,
        categories: data.categories.filter((item) => categoryIds.includes(item.id)),
        category: data.categories.find((item) => categoryIds.includes(item.id)) ?? null,
        folders: data.folders.filter((item) => selectedFolderIds.includes(item.id)),
        folder: data.folders.find((item) => selectedFolderIds.includes(item.id)) ?? null,
        updatedAt: new Date().toISOString(),
      };
      setData((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? optimistic : item) }));
    }
    backgroundJobs.enqueue({
      type: "note",
      title: note ? "更新筆記" : "新增筆記",
      operation: note ? "修改筆記" : "新增筆記",
      page: "/notes",
      entityKey: note ? `note:${note.id}` : undefined,
      mergeKey: note ? `note:${note.id}` : undefined,
      persist: false,
      execute: async ({ signal, reportProgress }) => {
        let coverTicket: string | null = null;
        if (selectedCover) {
          reportProgress(undefined, "正在上傳封面");
          coverTicket = await uploadCover(selectedCover);
        }
        reportProgress(undefined, "正在儲存筆記");
        const response = await fetch("/api/notes", {
          method: note ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, coverTicket }),
          signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error ?? "無法儲存筆記。");
        return payload;
      },
      rollback: () => {
        if (note) setData((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? note : item) }));
      },
      onSuccess: () => load(),
      onError: (cause) => setError(cause.message || "無法儲存筆記。"),
    });
    setEditing(null);
    setSelected(null);
    setCover(null);
    if (!note && createMode) {
      if (createFlow) createFlow.complete();
      else router.replace("/notes");
    }
  }
  async function action(note: Note, actionName: "trash" | "restore") {
    setError(null);
    const changed = { ...note, deletedAt: actionName === "trash" ? new Date().toISOString() : null };
    setData((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? changed : item) }));
    setSelected(null);
    backgroundJobs.enqueue({
      type: "note",
      title: actionName === "trash" ? "刪除筆記" : "還原筆記",
      operation: actionName === "trash" ? "移至垃圾桶" : "還原筆記",
      page: "/notes",
      entityKey: `note:${note.id}`,
      request: { url: "/api/notes", method: "PATCH", body: { id: note.id, action: actionName } },
      rollback: () => setData((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? note : item) })),
      onSuccess: () => load(),
      onError: () => setError("無法更新筆記狀態。"),
    });
  }
  async function remove() {
    if (!confirm) return;
    setError(null);
    const removed = confirm.note;
    setData((current) => ({ ...current, notes: current.notes.filter((item) => item.id !== removed.id) }));
    setConfirm(null);
    setSelected(null);
    backgroundJobs.enqueue({
      type: "note",
      title: "永久刪除筆記",
      operation: "永久刪除",
      page: "/notes",
      entityKey: `note:${removed.id}`,
      request: { url: "/api/notes", method: "DELETE", body: { id: removed.id } },
      rollback: () => setData((current) => ({ ...current, notes: current.notes.some((item) => item.id === removed.id) ? current.notes : [removed, ...current.notes] })),
      onError: () => setError("無法永久刪除筆記，項目已恢復。"),
    });
  }
  const chosenNotes = notes.filter((note) => chosen.has(note.id));
  const toggleAll = () =>
    setChosen(
      chosenNotes.length === notes.length && notes.length > 0
        ? new Set()
        : new Set(notes.map((note) => note.id)),
    );
  async function organizeSelection(change: BulkOrganizeChange) {
    setError(null);
    const ids = chosenNotes.map((note) => note.id);
    const previous = data.notes;
    const merge = <T extends { id: string }>(current: T[], selectedIds: string[], all: T[]) =>
      change.mode === "replace" ? all.filter((item) => selectedIds.includes(item.id)) :
      change.mode === "remove" ? current.filter((item) => !selectedIds.includes(item.id)) :
      [...current, ...all.filter((item) => selectedIds.includes(item.id) && !current.some((existing) => existing.id === item.id))];
    setData((current) => ({ ...current, notes: current.notes.map((item) => !ids.includes(item.id) ? item : {
      ...item,
      folders: merge(item.folders, change.folderIds, current.folders),
      categories: merge(item.categories, change.categoryIds, current.categories),
    }) }));
    setChosen(new Set());
    setOrganizeOpen(false);
    backgroundJobs.enqueue({
      type: "note-batch",
      title: `批量整理 ${ids.length} 筆筆記`,
      operation: "批量整理",
      page: "/notes",
      execute: async ({ signal, reportProgress }) => {
        reportProgress(undefined, `正在整理 ${ids.length} 筆`);
        const response = await fetch("/api/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, action: "organize", folderIds: change.folderIds, categoryIds: change.categoryIds, relationMode: change.mode }), signal });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "無法移動選取的筆記。");
        return payload;
      },
      rollback: () => setData((current) => ({ ...current, notes: previous })),
      onSuccess: () => load(),
      onError: (cause) => setError(cause.message || "無法移動選取的筆記。"),
    });
  }
  async function runBulk() {
    if (!bulkConfirm || !chosenNotes.length) return;
    const ids = chosenNotes.map((note) => note.id);
    setError(null);
    const previous = data.notes;
    setData((current) => ({ ...current, notes: bulkConfirm === "permanent" ? current.notes.filter((item) => !ids.includes(item.id)) : current.notes.map((item) => ids.includes(item.id) ? { ...item, deletedAt: bulkConfirm === "trash" ? new Date().toISOString() : null } : item) }));
    const operation = bulkConfirm;
    setChosen(new Set());
    setBulkConfirm(null);
    backgroundJobs.enqueue({
      type: "note-batch",
      title: `${operation === "permanent" ? "永久刪除" : operation === "restore" ? "還原" : "刪除"} ${ids.length} 筆筆記`,
      operation: operation === "permanent" ? "批量永久刪除" : operation === "restore" ? "批量還原" : "批量移至垃圾桶",
      page: "/notes",
      execute: async ({ reportProgress }) => {
        reportProgress(undefined, `0 / ${ids.length}`);
        const responses = await Promise.all(
        ids.map((id) =>
          operation === "permanent"
            ? fetch("/api/notes", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
              })
            : fetch("/api/notes", {
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
      rollback: () => setData((current) => ({ ...current, notes: previous })),
      onSuccess: () => load(),
      onError: () => setError("無法完成批量操作，清單已恢復。"),
    });
  }
  const editor = (note?: Note) => (
    <form className="note-editor" onSubmit={(event) => void save(event, note)}>
      <label>
        標題
        <input defaultValue={note?.title ?? ""} name="title" required />
      </label>
      <label>
        摘要
        <textarea
          defaultValue={note?.description ?? ""}
          name="description"
          placeholder="摘要（選填）"
          rows={2}
        />
      </label>
      <label>
        內容
        <textarea
          defaultValue={note?.content ?? ""}
          name="content"
          placeholder="開始輸入筆記內容…"
          required
          rows={14}
        />
      </label>
      <CollectionSettings categories={data.categories} folders={data.folders} note={note} />
      <CoverImageField initialUrl={note?.coverImageUrl} onChange={setCover} />
      {createMode ? <CreateFormActions pending={pending} returnHref="/notes" label="儲存" pendingLabel="儲存中…" /> : (<div className="dialog-actions">
        <button className="button" disabled={pending} type="submit">
          {pending ? "儲存中…" : note ? "儲存修改" : "儲存筆記"}
        </button>
        {note && (
          <button
            className="secondary-button"
            onClick={() => setEditing(null)}
            type="button"
          >
            取消
          </button>
        )}
      </div>)}
    </form>
  );
  if (createMode)
    return (
      <section className="notes-workspace create-only">
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
        {editor()}
      </section>
    );
  return (
    <section className={`library-workspace ${mobileStyles.libraryWorkspace}`}>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <CollectionNavigation
        categories={data.categories}
        category={category}
        folderIds={folderIds}
        folders={data.folders}
        items={data.notes}
        mobileAppActions
        setCategory={setCategory}
        setFolderIds={setFolderIds}
        setView={setView}
        storageKey="personal-vault:note-system-folders:v1"
        view={view}
      />
      <input
        aria-label="搜尋筆記"
        className="note-search"
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜尋筆記標題或內容"
        value={query}
      />
      <div className="bulk-toolbar">
        <label>
          <input
            checked={notes.length > 0 && chosenNotes.length === notes.length}
            onChange={toggleAll}
            type="checkbox"
          />{" "}
          全選目前清單
        </label>
      </div>
      <BatchActionBar count={chosenNotes.length} onCancel={() => setChosen(new Set())}>
        {view === "trash" ? (<>
          <button className="button" disabled={pending} onClick={() => setBulkConfirm("restore")} type="button">還原</button>
          <button className="delete-button" disabled={pending} onClick={() => setBulkConfirm("permanent")} type="button">永久刪除</button>
        </>) : (<>
          <button className="secondary-button" disabled={pending} onClick={() => setOrganizeOpen(true)} type="button">整理</button>
          <button className="delete-button" disabled={pending} onClick={() => setBulkConfirm("trash")} type="button">刪除</button>
        </>)}
      </BatchActionBar>
      <div className="content-item-list">
        {notes.map((note) => (
          <article className={`content-item-card ${mobileStyles.itemCard}`} data-pinned={note.pinned ? "true" : undefined} key={note.id}>
            <label className="item-select">
              <input
                aria-label="選擇筆記"
                checked={chosen.has(note.id)}
                onChange={() =>
                  setChosen((current) => {
                    const next = new Set(current);
                    next.has(note.id)
                      ? next.delete(note.id)
                      : next.add(note.id);
                    return next;
                  })
                }
                type="checkbox"
              />
            </label>
            <button
              className="content-item-open"
              onClick={() => setSelected(note)}
              type="button"
            >
              {note.coverImageUrl ? (
                <img alt="" src={note.coverImageUrl} />
              ) : (
                <span className="content-cover-placeholder"><AppIcon className={mobileStyles.mobileCoverIcon} name="note" /><span>筆記</span></span>
              )}
              <div>
                <div className={mobileStyles.mobileMetaRow}>{note.pinned && <span>置頂</span>}<time dateTime={note.updatedAt}>{new Date(note.updatedAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}</time></div>
                <p className="bookmark-meta">
                  {note.categories.map((category) => category.name).join("、") || "未分類"}
                  {note.folders.length > 0 && ` · ${note.folders.map((folder) => folder.name).join("、")}`}
                </p>
                <h3>{note.title}</h3>
                <p>{note.description || note.content.slice(0, 90)}</p>
              </div>
            </button>
          </article>
        ))}
        {notes.length === 0 && <p className="lead">此清單尚無筆記。</p>}
      </div>
      <BulkOrganizeDialog
        categories={data.categories}
        count={chosenNotes.length}
        folders={data.folders}
        onClose={() => setOrganizeOpen(false)}
        onSave={organizeSelection}
        open={organizeOpen}
        pending={pending}
      />
      <ModalDialog
        onClose={() => setSelected(null)}
        open={Boolean(selected)}
        pending={pending}
        title={selected?.title ?? "筆記內容"}
      >
        {selected && (
          <>
            <p className="detail-content">{selected.content}</p>
            <div className="dialog-actions">
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
                    onClick={() =>
                      setConfirm({ note: selected, permanent: true })
                    }
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
                    onClick={() =>
                      setConfirm({ note: selected, permanent: false })
                    }
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
        title="修改筆記"
      >
        {editing && editor(editing)}
      </ModalDialog>
      <ConfirmDialog
        confirmLabel={confirm?.permanent ? "永久刪除" : "移至垃圾桶"}
        description={
          confirm?.permanent
            ? "此筆記會永久刪除，無法還原。"
            : "此筆記會保留在垃圾桶 30 天，期間可隨時還原。"
        }
        error={error}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) {
            if (confirm.permanent) void remove();
            else {
              void action(confirm.note, "trash");
              setConfirm(null);
            }
          }
        }}
        open={Boolean(confirm)}
        pending={pending}
        title={confirm?.permanent ? "永久刪除筆記？" : "移至垃圾桶？"}
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
            ? `確定要永久刪除選取的 ${chosenNotes.length} 筆筆記嗎？此操作無法復原。`
            : bulkConfirm === "restore"
              ? `確定要還原選取的 ${chosenNotes.length} 筆筆記嗎？`
              : `確定要將選取的 ${chosenNotes.length} 筆筆記移至垃圾桶嗎？`
        }
        error={error}
        onCancel={() => setBulkConfirm(null)}
        onConfirm={() => void runBulk()}
        open={Boolean(bulkConfirm)}
        pending={pending}
        title={
          bulkConfirm === "permanent"
            ? "永久刪除筆記？"
            : bulkConfirm === "restore"
              ? "批量還原筆記？"
              : "批量移至垃圾桶？"
        }
      />
    </section>
  );
}

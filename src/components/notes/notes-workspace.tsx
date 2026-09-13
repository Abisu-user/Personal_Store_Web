"use client";
import { useCreateFlow, useCreatedItemRefresh } from "@/components/ui/create-item-modal";
import { CreateFormActions } from "@/components/ui/create-form-actions";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import { ModalDialog, OperationStatus } from "@/components/ui/modal-dialog";
import { MobileBatchActionBar } from "@/components/ui/mobile-batch-action-bar";
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
  const [data, setData] = useState(initialData);
  const [view, setView] = useState<CollectionView>("all");
  const [category, setCategory] = useState<CollectionCategory>([]);
  const [folderIds, setFolderIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selected, setSelected] = useState<Note | null>(null);
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
    setPending(true);
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      const coverTicket = await uploadCover(cover);
      const body = {
        ...(note ? { id: note.id } : {}),
        title: form.get("title"),
        description: form.get("description"),
        content: form.get("content"),
        categoryIds: form.getAll("categoryIds").map(String),
        folderIds: form.getAll("folderIds").map(String),
        favorite: form.get("favorite") === "on",
        pinned: form.get("pinned") === "on",
        archived: form.get("archived") === "on",
        coverTicket,
        tags: [] as string[],
      };
      const response = await fetch("/api/notes", {
        method: note ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error(
          (await response.json().catch(() => null))?.error ?? "無法儲存筆記。",
        );
      if (!note && createMode) {
        if (createFlow) { createFlow.complete(); return; }
        router.replace("/notes");
        router.refresh();
        return;
      }
      setEditing(null);
      setSelected(null);
      setCover(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "無法儲存筆記。");
    } finally {
      setPending(false);
    }
  }
  async function action(note: Note, actionName: "trash" | "restore") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: note.id, action: actionName }),
      });
      if (!response.ok) throw new Error();
      setSelected(null);
      await load();
    } catch {
      setError("無法更新筆記狀態。");
    } finally {
      setPending(false);
    }
  }
  async function remove() {
    if (!confirm) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: confirm.note.id }),
      });
      if (!response.ok) throw new Error();
      setConfirm(null);
      setSelected(null);
      await load();
    } catch {
      setError("無法永久刪除筆記。");
    } finally {
      setPending(false);
    }
  }
  const chosenNotes = notes.filter((note) => chosen.has(note.id));
  const toggleAll = () =>
    setChosen(
      chosenNotes.length === notes.length && notes.length > 0
        ? new Set()
        : new Set(notes.map((note) => note.id)),
    );
  async function organizeSelection(change: BulkOrganizeChange) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: chosenNotes.map((note) => note.id),
          action: "organize",
          folderIds: change.folderIds,
          categoryIds: change.categoryIds,
          relationMode: change.mode,
        }),
      });
      if (!response.ok)
        throw new Error((await response.json().catch(() => null))?.error);
      setChosen(new Set());
      setOrganizeOpen(false);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "無法移動選取的筆記。",
      );
    } finally {
      setPending(false);
    }
  }
  async function runBulk() {
    if (!bulkConfirm || !chosenNotes.length) return;
    const ids = chosenNotes.map((note) => note.id);
    setPending(true);
    setError(null);
    try {
      const responses = await Promise.all(
        ids.map((id) =>
          bulkConfirm === "permanent"
            ? fetch("/api/notes", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
              })
            : fetch("/api/notes", {
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
        {pending && <OperationStatus label="正在儲存筆記…" />}
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
      {pending && <OperationStatus label="正在處理筆記…" />}
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
        <strong className="bulk-mode-label">批量選取</strong>
        <label>
          <input
            checked={notes.length > 0 && chosenNotes.length === notes.length}
            onChange={toggleAll}
            type="checkbox"
          />{" "}
          全選目前清單
        </label>
        {chosenNotes.length > 0 && (
          <>
            <span>已選取 {chosenNotes.length} 筆</span>
            <button
              className="secondary-button compact"
              disabled={pending}
              onClick={() => setChosen(new Set())}
              type="button"
            >
              取消選取
            </button>
            {view === "trash" ? (
              <>
                <button
                  className="button compact"
                  disabled={pending}
                  onClick={() => setBulkConfirm("restore")}
                  type="button"
                >
                  批量還原
                </button>
                <button
                  className="delete-button compact"
                  disabled={pending}
                  onClick={() => setBulkConfirm("permanent")}
                  type="button"
                >
                  永久刪除
                </button>
              </>
            ) : (
              <>
                <button
                  className="secondary-button compact"
                  disabled={pending}
                  onClick={() => setOrganizeOpen(true)}
                  type="button"
                >
                  整理
                </button>
                <button
                  className="delete-button compact"
                  disabled={pending}
                  onClick={() => setBulkConfirm("trash")}
                  type="button"
                >
                  移至垃圾桶
                </button>
              </>
            )}
          </>
        )}
      </div>
      <MobileBatchActionBar count={chosenNotes.length} onCancel={() => setChosen(new Set())}>
        {view === "trash" ? (<>
          <button className="button" disabled={pending} onClick={() => setBulkConfirm("restore")} type="button">還原</button>
          <button className="delete-button" disabled={pending} onClick={() => setBulkConfirm("permanent")} type="button">永久刪除</button>
        </>) : (<>
          <button className="secondary-button" disabled={pending} onClick={() => setOrganizeOpen(true)} type="button">整理</button>
          <button className="delete-button" disabled={pending} onClick={() => setBulkConfirm("trash")} type="button">刪除</button>
        </>)}
      </MobileBatchActionBar>
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

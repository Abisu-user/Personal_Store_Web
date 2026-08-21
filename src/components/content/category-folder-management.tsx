"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OperationStatus } from "@/components/ui/modal-dialog";
import type { BookmarksWorkspaceData } from "@/lib/bookmarks/types";
import type { NotesWorkspaceData } from "@/lib/notes/types";
import type { CodeWorkspaceData } from "@/lib/code/types";
import type { FilesWorkspaceData } from "@/lib/files/types";
import type { PhotosWorkspaceData } from "@/lib/photos/types";
import type { FolderLockKind, FolderLockMode } from "@/lib/folder-locks/types";

type Tab = "bookmark" | "note" | "code" | "file" | "photo";
type Item = { id: string; name: string; is_visible?: boolean; is_locked?: boolean; lock_mode?: FolderLockMode | null };
type ContentItem = { category: { id: string } | null; folder: { id: string } | null; favorite: boolean; pinned: boolean; archived: boolean; deletedAt: string | null };
type SmartKey = "favorite" | "pinned" | "archived" | "trash";
type SmartSettings = Record<SmartKey, { label: string; visible: boolean }>;

const tabs: Tab[] = ["bookmark", "note", "code", "file", "photo"];
const tabLabels: Record<Tab, string> = { bookmark: "收藏", note: "筆記", code: "程式碼", file: "檔案", photo: "照片" };
const smartKeys: SmartKey[] = ["favorite", "pinned", "archived", "trash"];
const smartDefaults: SmartSettings = {
  favorite: { label: "我的最愛", visible: true },
  pinned: { label: "置頂", visible: true },
  archived: { label: "封存", visible: true },
  trash: { label: "垃圾桶", visible: true },
};
const smartStorageKey = (tab: Tab) => tab === "bookmark" ? "personal-vault:bookmark-system-folders:v1" : `personal-vault:${tab}:system-folders:v1`;

function FolderLockSettings({ folders, kind, onChange }: { folders: Item[]; kind: FolderLockKind; onChange: (items: Item[]) => void }) {
  const [folderId, setFolderId] = useState("");
  const [mode, setMode] = useState<FolderLockMode>("pin4");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = folders.find((folder) => folder.id === folderId);
  async function configure(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; setPending(true); setError(null); try { const response = await fetch("/api/folder-locks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "configure", kind, folderId: selected.id, mode, password }) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? "無法設定資料夾鎖定。 "); onChange(folders.map((folder) => folder.id === selected.id ? { ...folder, is_locked: true, lock_mode: mode } : folder)); setPassword(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "無法設定資料夾鎖定。 "); } finally { setPending(false); } }
  async function remove() { if (!selected) return; setPending(true); setError(null); try { const response = await fetch("/api/folder-locks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remove", kind, folderId: selected.id }) }); const body = await response.json().catch(() => null); if (!response.ok) throw new Error(body?.error ?? "無法解除鎖定。 "); onChange(folders.map((folder) => folder.id === selected.id ? { ...folder, is_locked: false, lock_mode: null } : folder)); setPassword(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "無法解除鎖定。 "); } finally { setPending(false); } }
  return <details className="folder-lock-settings"><summary>🔒 資料夾鎖定 <small>選擇要保護的資料夾</small></summary><div className="folder-lock-settings-body"><label>資料夾<select onChange={(event) => setFolderId(event.target.value)} value={folderId}><option value="">選擇資料夾</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.is_locked ? "🔒 " : ""}{folder.name} — {tabLabels[kind]}</option>)}</select></label>{selected && <form onSubmit={configure}><label>密碼類型<select onChange={(event) => setMode(event.target.value as FolderLockMode)} value={mode}><option value="pin4">4 位數 PIN 碼</option><option value="pin6">6 位數 PIN 碼</option><option value="password">英文＋數字＋符號密碼</option></select></label><label>{mode === "password" ? "新密碼（至少 10 字元）" : `PIN 碼（${mode === "pin4" ? 4 : 6} 位數）`}<input autoComplete="new-password" inputMode={mode === "password" ? undefined : "numeric"} maxLength={mode === "password" ? 128 : mode === "pin4" ? 4 : 6} onChange={(event) => setPassword(event.target.value)} pattern={mode === "password" ? undefined : "[0-9]*"} required type="password" value={password} /></label>{error && <p className="notice error" role="alert">{error}</p>}<div className="manager-actions"><button className="button compact" disabled={pending} type="submit">{pending ? "處理中…" : selected.is_locked ? "變更密碼" : "鎖住資料夾"}</button>{selected.is_locked && <button className="delete-button compact" disabled={pending} onClick={() => void remove()} type="button">解除鎖定</button>}</div></form>}</div></details>;
}

function ItemManager({ api, contentKind, count, description, fixedCount, items, kind, onChange, title }: {
  api: "/api/taxonomy" | "/api/content-folders";
  contentKind?: Tab;
  count: (id: string) => number;
  description: string;
  fixedCount?: number;
  items: Item[];
  kind: string;
  onChange: (items: Item[]) => void;
  title: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(method: "POST" | "PATCH" | "DELETE", body: object) {
    setPending(true); setError(null);
    try {
      const response = await fetch(api, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, ...(contentKind ? { contentKind } : {}), ...body }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "操作失敗。");
      if (method === "POST" && payload?.item) onChange([...items, payload.item].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")));
      if (method === "PATCH") onChange(items.map((item) => item.id === (body as { id: string }).id ? { ...item, ...(body as { name?: string; visible?: boolean }) } : item));
      if (method === "DELETE") onChange(items.filter((item) => item.id !== (body as { id: string }).id));
      window.dispatchEvent(new CustomEvent("personal-vault:taxonomy-updated", { detail: contentKind ?? kind }));
      router.refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失敗。"); return false; } finally { setPending(false); }
  }

  async function create(event: FormEvent) { event.preventDefault(); if (name.trim() && await mutate("POST", { name: name.trim() })) setName(""); }

  return <section className="category-manager management-panel">
    {pending && <OperationStatus label={`正在更新${title}…`} />}
    <header className="manager-heading"><div><p className="eyebrow">{title.toUpperCase()}</p><h2>{title}</h2><p>{description}</p></div></header>
    {error && <p className="notice error" role="alert">{error}</p>}
    <form className="category-create-row" onSubmit={create}><input aria-label={`新增${title}名稱`} onChange={(event) => setName(event.target.value)} placeholder={`新增${title}名稱`} value={name} /><button className="button compact" disabled={pending} type="submit">＋ 新增</button></form>
    <div aria-label={`${title}清單`} className="folder-list management-item-list" tabIndex={0}>
      {fixedCount !== undefined && <article className="folder-row system-folder"><div><strong>未分類 <em>{fixedCount}</em></strong><small>固定保留，未指定類別的資料會顯示於此</small></div><span>固定保留</span></article>}
      {items.length ? items.map((item) => <article className="folder-row" key={item.id}><div>{editing === item.id ? <input aria-label={`修改${title}名稱`} autoFocus onChange={(event) => setValue(event.target.value)} value={value} /> : <><strong>{item.is_locked ? "🔒 " : ""}{item.name} <em>{count(item.id)}</em></strong>{item.is_visible !== undefined && <small>{item.is_visible ? "目前顯示於清單與選單" : "目前已隱藏"}</small>}</>}</div><div className="manager-actions">{editing === item.id ? <><button className="button compact" disabled={pending} onClick={() => { if (value.trim()) void mutate("PATCH", { id: item.id, name: value.trim() }).then((ok) => ok && setEditing(null)); }} type="button">儲存</button><button className="secondary-button compact" disabled={pending} onClick={() => setEditing(null)} type="button">取消</button></> : <>{item.is_visible !== undefined && <button className="secondary-button compact" disabled={pending} onClick={() => void mutate("PATCH", { id: item.id, visible: !item.is_visible })} type="button">{item.is_visible ? "隱藏" : "顯示"}</button>}<button className="secondary-button compact" disabled={pending} onClick={() => { setEditing(item.id); setValue(item.name); }} type="button">修改</button><button className="delete-button compact" disabled={pending} onClick={() => void mutate("DELETE", { id: item.id })} type="button">移除</button></>}</div></article>) : <p className="manager-empty">尚未建立項目。</p>}
    </div>
  </section>;
}

function SmartFolderManager({ items, tab }: { items: ContentItem[]; tab: Tab }) {
  const storageKey = smartStorageKey(tab);
  const [settings, setSettings] = useState<SmartSettings>(() => {
    if (typeof window === "undefined") return smartDefaults;
    try { return { ...smartDefaults, ...JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") }; } catch { return smartDefaults; }
  });
  const [editing, setEditing] = useState<SmartKey | null>(null);
  const [value, setValue] = useState("");
  const count = (key: SmartKey) => key === "favorite" ? items.filter((item) => !item.deletedAt && item.favorite && !item.archived).length : key === "pinned" ? items.filter((item) => !item.deletedAt && item.pinned && !item.archived).length : key === "archived" ? items.filter((item) => !item.deletedAt && item.archived).length : items.filter((item) => item.deletedAt).length;
  function save(next: SmartSettings) { setSettings(next); window.localStorage.setItem(storageKey, JSON.stringify(next)); window.dispatchEvent(new CustomEvent("personal-vault:smart-folders", { detail: storageKey })); }
  return <section className="category-manager management-panel smart-folder-manager"><header className="manager-heading"><div><p className="eyebrow">SMART LISTS</p><h2>常駐清單</h2><p>「全部」固定顯示；其餘清單可改名或隱藏，會立即套用到{tabLabels[tab]}頁面。</p></div></header><div className="folder-list">{smartKeys.map((key) => <article className="folder-row" key={key}><div>{editing === key ? <input aria-label={`修改${settings[key].label}名稱`} autoFocus onChange={(event) => setValue(event.target.value)} value={value} /> : <><strong>{settings[key].label} <em>{count(key)}</em></strong><small>{settings[key].visible ? "目前顯示於清單" : "目前已隱藏"}</small></>}</div><div className="manager-actions">{editing === key ? <><button className="button compact" onClick={() => { if (value.trim()) { save({ ...settings, [key]: { ...settings[key], label: value.trim().slice(0, 20) } }); setEditing(null); } }} type="button">儲存</button><button className="secondary-button compact" onClick={() => setEditing(null)} type="button">取消</button></> : <><button className="secondary-button compact" onClick={() => { setEditing(key); setValue(settings[key].label); }} type="button">修改</button><button className={settings[key].visible ? "delete-button compact" : "secondary-button compact"} onClick={() => save({ ...settings, [key]: { ...settings[key], visible: !settings[key].visible } })} type="button">{settings[key].visible ? "隱藏" : "顯示"}</button></>}</div></article>)}</div></section>;
}

export function CategoryFolderManagement({ bookmarks, code, files, notes, photos }: { bookmarks: BookmarksWorkspaceData; notes: NotesWorkspaceData; code: CodeWorkspaceData; files: FilesWorkspaceData; photos: PhotosWorkspaceData }) {
  const [tab, setTab] = useState<Tab>("bookmark");
  const [bookmarkCategories, setBookmarkCategories] = useState<Item[]>(bookmarks.categories); const [noteCategories, setNoteCategories] = useState<Item[]>(notes.categories); const [codeCategories, setCodeCategories] = useState<Item[]>(code.categories); const [fileCategories, setFileCategories] = useState<Item[]>(files.categories);
  const [bookmarkFolders, setBookmarkFolders] = useState<Item[]>(bookmarks.folders); const [noteFolders, setNoteFolders] = useState<Item[]>(notes.folders); const [codeFolders, setCodeFolders] = useState<Item[]>(code.folders); const [fileFolders, setFileFolders] = useState<Item[]>(files.folders); const [photoCategories, setPhotoCategories] = useState<Item[]>(photos.categories); const [photoFolders, setPhotoFolders] = useState<Item[]>(photos.folders);
  const selected = useMemo(() => tab === "bookmark" ? { items: bookmarks.bookmarks as ContentItem[], categories: bookmarkCategories, setCategories: setBookmarkCategories, folders: bookmarkFolders, setFolders: setBookmarkFolders, folderApi: "/api/taxonomy" as const, folderKind: "bookmark_folder", folderTitle: "收藏資料夾" } : tab === "note" ? { items: notes.notes as ContentItem[], categories: noteCategories, setCategories: setNoteCategories, folders: noteFolders, setFolders: setNoteFolders, folderApi: "/api/content-folders" as const, folderKind: "note", folderTitle: "筆記資料夾" } : tab === "code" ? { items: code.snippets as ContentItem[], categories: codeCategories, setCategories: setCodeCategories, folders: codeFolders, setFolders: setCodeFolders, folderApi: "/api/content-folders" as const, folderKind: "code", folderTitle: "程式碼資料夾" } : tab === "file" ? { items: files.files as ContentItem[], categories: fileCategories, setCategories: setFileCategories, folders: fileFolders, setFolders: setFileFolders, folderApi: "/api/content-folders" as const, folderKind: "file", folderTitle: "檔案資料夾" } : { items: photos.photos as ContentItem[], categories: photoCategories, setCategories: setPhotoCategories, folders: photoFolders, setFolders: setPhotoFolders, folderApi: "/api/content-folders" as const, folderKind: "photo", folderTitle: "照片資料夾" }, [bookmarkCategories, bookmarkFolders, bookmarks.bookmarks, code.snippets, codeCategories, codeFolders, fileCategories, fileFolders, files.files, noteCategories, noteFolders, notes.notes, photoCategories, photoFolders, photos.photos, tab]);
  const active = selected.items.filter((item) => !item.deletedAt && !item.archived);
  const categoryCount = (id: string) => active.filter((item) => item.category?.id === id).length;
  const folderCount = (id: string) => active.filter((item) => item.folder?.id === id).length;
  return <section className="management-workspace">
    <div className="management-tabs-row">
      <div className="management-tabs" role="tablist">{tabs.map((key) => <button aria-selected={tab === key} className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key)} role="tab" type="button">{tabLabels[key]}</button>)}</div>
      <FolderLockSettings folders={selected.folders} kind={tab} onChange={selected.setFolders} />
    </div>
    <div className="management-intro"><p className="eyebrow">{tabLabels[tab].toUpperCase()} ORGANIZATION</p><h2>管理 {tabLabels[tab]} 的類別與資料夾</h2><p>「未分類」固定保留；每種資料各自有獨立類別。資料夾、常駐清單與數量會立即反映目前設定。</p></div>
    <div className="management-grid"><ItemManager api="/api/taxonomy" contentKind={tab} count={categoryCount} description="類別只屬於目前選擇的資料類型；數字顯示使用這個類別的資料筆數。" fixedCount={active.filter((item) => !item.category).length} items={selected.categories} kind="category" onChange={selected.setCategories} title="類別" /><ItemManager api={selected.folderApi} count={folderCount} description="資料夾只屬於目前選擇的資料類型；數字不包含封存或垃圾桶中的資料。" items={selected.folders} kind={selected.folderKind} onChange={selected.setFolders} title={selected.folderTitle} /></div>
    <SmartFolderManager items={selected.items} tab={tab} />
  </section>;
}

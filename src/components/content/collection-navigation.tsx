"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { FolderUnlockDialog } from "@/components/content/folder-unlock-dialog";
import { ModalDialog, OperationStatus } from "@/components/ui/modal-dialog";
import type { FolderLockMode } from "@/lib/folder-locks/types";

export type CollectionView = "all" | "favorite" | "pinned" | "archived" | "trash" | `folder:${string}`;
export type CollectionCategory = "all" | "unclassified" | string;
type SmartKey = "favorite" | "pinned" | "archived" | "trash";
type SmartSettings = Record<SmartKey, { label: string; visible: boolean }>;
type CollectionItem = { category: { id: string } | null; folder: { id: string } | null; favorite: boolean; pinned: boolean; archived: boolean; deletedAt: string | null };
type Folder = { id: string; name: string; is_visible: boolean; is_locked?: boolean; lock_mode?: FolderLockMode | null };
type Category = { id: string; name: string };

const smartKeys: SmartKey[] = ["favorite", "pinned", "archived"];
const defaults: SmartSettings = { favorite: { label: "我的最愛", visible: true }, pinned: { label: "置頂", visible: true }, archived: { label: "封存", visible: true }, trash: { label: "垃圾桶", visible: true } };

export function CollectionNavigation({ categories, category, folders, items, setCategory, setView, storageKey, view }: { categories: Category[]; category: CollectionCategory; folders: Folder[]; items: CollectionItem[]; setCategory: (value: CollectionCategory) => void; setView: (value: CollectionView) => void; storageKey: string; view: CollectionView }) {
  const [settings, setSettings] = useState<SmartSettings>(defaults);
  const [lockedFolder, setLockedFolder] = useState<Folder | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localCategories, setLocalCategories] = useState(categories);
  useEffect(() => {
    const read = () => { try { setSettings({ ...defaults, ...JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") }); } catch { setSettings(defaults); } };
    read();
    const onSmartFolders = (event: Event) => { if ((event as CustomEvent<string>).detail === storageKey) read(); };
    window.addEventListener("personal-vault:smart-folders", onSmartFolders);
    return () => window.removeEventListener("personal-vault:smart-folders", onSmartFolders);
  }, [storageKey]);
  useEffect(() => { setLocalCategories(categories); }, [categories]);
  useEffect(() => {
    const target = window.sessionStorage.getItem(`${storageKey}:unlock-target`);
    if (target && folders.some((folder) => folder.id === target)) { window.sessionStorage.removeItem(`${storageKey}:unlock-target`); setView(`folder:${target}`); }
  }, [folders, setView, storageKey]);
  const counts = useMemo(() => ({ all: items.filter((item) => !item.deletedAt && !item.archived && !item.folder).length, favorite: items.filter((item) => !item.deletedAt && item.favorite && !item.archived).length, pinned: items.filter((item) => !item.deletedAt && item.pinned && !item.archived).length, archived: items.filter((item) => !item.deletedAt && item.archived).length, trash: items.filter((item) => item.deletedAt).length }), [items]);
  const activeItems = items.filter((item) => !item.deletedAt && !item.archived);
  const categoryCount = (id: string) => activeItems.filter((item) => item.category?.id === id).length;
  const folderCount = (id: string) => activeItems.filter((item) => item.folder?.id === id).length;
  const labels: Record<Exclude<CollectionView, `folder:${string}`>, string> = { all: "未整理", favorite: settings.favorite.label, pinned: settings.pinned.label, archived: settings.archived.label, trash: settings.trash.label };
  const contentKind = storageKey.includes(":note:") ? "note" : storageKey.includes(":code:") ? "code" : storageKey.includes(":file:") ? "file" : storageKey.includes(":photo:") ? "photo" : "bookmark";
  const visibleCategories = localCategories.filter((item) => item.name.toLocaleLowerCase().includes(categoryQuery.trim().toLocaleLowerCase()));
  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    setPending(true); setError(null);
    try {
      const response = await fetch("/api/taxonomy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "category", contentKind, name }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "無法新增類別。");
      if (body?.item?.id && body?.item?.name) setLocalCategories((current) => current.some((item) => item.id === body.item.id) ? current : [...current, body.item].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")));
      window.dispatchEvent(new CustomEvent("personal-vault:taxonomy-updated", { detail: contentKind }));
      setCategoryName(""); setAddingCategory(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法新增類別。"); }
    finally { setPending(false); }
  }
  return <>
    <div className="bookmark-view-tabs collection-view-tabs" role="tablist"><div className="bookmark-view-tabs-scroll"><button aria-selected={view === "all"} className={view === "all" ? "active" : ""} onClick={() => setView("all")} role="tab" type="button">{labels.all} <span>{counts.all}</span></button>{smartKeys.filter((key) => settings[key].visible).map((key) => <button aria-selected={view === key} className={view === key ? "active" : ""} key={key} onClick={() => setView(key)} role="tab" type="button">{labels[key]} <span>{counts[key]}</span></button>)}{folders.filter((folder) => folder.is_visible).map((folder) => <button aria-selected={view === `folder:${folder.id}`} className={view === `folder:${folder.id}` ? "active" : ""} key={folder.id} onClick={() => folder.is_locked ? setLockedFolder(folder) : setView(`folder:${folder.id}`)} type="button">{folder.is_locked ? "🔒 " : ""}{folder.name} <span>{folderCount(folder.id)}</span></button>)}{settings.trash.visible && <button aria-selected={view === "trash"} className={view === "trash" ? "active trash-tab" : "trash-tab"} onClick={() => setView("trash")} role="tab" type="button">{labels.trash} <span>{counts.trash}</span></button>}</div></div>
    <div className="category-strip collection-category-strip" role="tablist"><button aria-selected={category === "all"} className={category === "all" ? "active" : ""} onClick={() => setCategory("all")} role="tab" type="button">全部 <span>{counts.all}</span></button><button aria-selected={category === "unclassified"} className={category === "unclassified" ? "active" : ""} onClick={() => setCategory("unclassified")} role="tab" type="button">未分類 <span>{activeItems.filter((item) => !item.category).length}</span></button>{localCategories.map((item) => <button aria-selected={category === item.id} className={category === item.id ? "active" : ""} key={item.id} onClick={() => setCategory(item.id)} role="tab" type="button">{item.name} <span>{categoryCount(item.id)}</span></button>)}<button aria-label="查看更多類別" className="collection-category-utility" onClick={() => setManagingCategories(true)} type="button">更多</button><button aria-label="新增類別" className="collection-category-utility collection-category-add" onClick={() => { setError(null); setAddingCategory(true); }} type="button">＋</button></div>
    <ModalDialog className="mobile-sheet-dialog" onClose={() => !pending && setAddingCategory(false)} open={addingCategory} pending={pending} title="新增類別"><form className="collection-category-dialog" onSubmit={addCategory}><p>新增後會立即顯示於目前頁面的類別清單。</p><label>類別名稱<input autoFocus disabled={pending} maxLength={80} onChange={(event) => setCategoryName(event.target.value)} placeholder="例如：動畫、工作" value={categoryName} /></label>{error && <p className="notice error" role="alert">{error}</p>}<div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={() => setAddingCategory(false)} type="button">取消</button><button className="button" disabled={pending || !categoryName.trim()} type="submit">新增類別</button></div></form></ModalDialog>
    <ModalDialog className="mobile-sheet-dialog" onClose={() => setManagingCategories(false)} open={managingCategories} title="類別"><div className="collection-category-dialog collection-category-manager"><p>快速選取類別；資料夾、鎖定與常駐清單請前往管理資料夾調整。</p><input aria-label="搜尋類別" onChange={(event) => setCategoryQuery(event.target.value)} placeholder="搜尋類別" value={categoryQuery} /><div className="collection-category-manager-list"><button className={category === "all" ? "active" : ""} onClick={() => { setCategory("all"); setManagingCategories(false); }} type="button">全部 <span>{counts.all}</span></button><button className={category === "unclassified" ? "active" : ""} onClick={() => { setCategory("unclassified"); setManagingCategories(false); }} type="button">未分類 <span>{activeItems.filter((item) => !item.category).length}</span></button>{visibleCategories.map((item) => <button className={category === item.id ? "active" : ""} key={item.id} onClick={() => { setCategory(item.id); setManagingCategories(false); }} type="button">{item.name} <span>{categoryCount(item.id)}</span></button>)}</div><Link className="secondary-button collection-category-manage-link" href={`/organize?type=${contentKind}`}>管理資料夾</Link></div></ModalDialog>
    {pending && <OperationStatus label="正在新增類別…" />}
    <FolderUnlockDialog folder={lockedFolder} kind={storageKey.includes(":note:") ? "note" : storageKey.includes(":code:") ? "code" : storageKey.includes(":file:") ? "file" : "photo"} onClose={() => setLockedFolder(null)} onUnlocked={() => { if (lockedFolder) window.sessionStorage.setItem(`${storageKey}:unlock-target`, lockedFolder.id); window.location.reload(); }} />
  </>;
}

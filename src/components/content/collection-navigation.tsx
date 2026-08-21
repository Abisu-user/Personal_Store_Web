"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderUnlockDialog } from "@/components/content/folder-unlock-dialog";
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
  useEffect(() => {
    const read = () => { try { setSettings({ ...defaults, ...JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") }); } catch { setSettings(defaults); } };
    read();
    const onSmartFolders = (event: Event) => { if ((event as CustomEvent<string>).detail === storageKey) read(); };
    window.addEventListener("personal-vault:smart-folders", onSmartFolders);
    return () => window.removeEventListener("personal-vault:smart-folders", onSmartFolders);
  }, [storageKey]);
  useEffect(() => {
    const target = window.sessionStorage.getItem(`${storageKey}:unlock-target`);
    if (target && folders.some((folder) => folder.id === target)) { window.sessionStorage.removeItem(`${storageKey}:unlock-target`); setView(`folder:${target}`); }
  }, [folders, setView, storageKey]);
  const counts = useMemo(() => ({ all: items.filter((item) => !item.deletedAt && !item.archived).length, favorite: items.filter((item) => !item.deletedAt && item.favorite && !item.archived).length, pinned: items.filter((item) => !item.deletedAt && item.pinned && !item.archived).length, archived: items.filter((item) => !item.deletedAt && item.archived).length, trash: items.filter((item) => item.deletedAt).length }), [items]);
  const activeItems = items.filter((item) => !item.deletedAt && !item.archived);
  const categoryCount = (id: string) => activeItems.filter((item) => item.category?.id === id).length;
  const folderCount = (id: string) => activeItems.filter((item) => item.folder?.id === id).length;
  const labels: Record<Exclude<CollectionView, `folder:${string}`>, string> = { all: "全部", favorite: settings.favorite.label, pinned: settings.pinned.label, archived: settings.archived.label, trash: settings.trash.label };
  return <>
    <div className="bookmark-view-tabs collection-view-tabs" role="tablist"><div className="bookmark-view-tabs-scroll"><button aria-selected={view === "all"} className={view === "all" ? "active" : ""} onClick={() => setView("all")} role="tab" type="button">{labels.all} <span>{counts.all}</span></button>{smartKeys.filter((key) => settings[key].visible).map((key) => <button aria-selected={view === key} className={view === key ? "active" : ""} key={key} onClick={() => setView(key)} role="tab" type="button">{labels[key]} <span>{counts[key]}</span></button>)}{folders.filter((folder) => folder.is_visible).map((folder) => <button aria-selected={view === `folder:${folder.id}`} className={view === `folder:${folder.id}` ? "active" : ""} key={folder.id} onClick={() => folder.is_locked ? setLockedFolder(folder) : setView(`folder:${folder.id}`)} type="button">{folder.is_locked ? "🔒 " : ""}{folder.name} <span>{folderCount(folder.id)}</span></button>)}</div>{settings.trash.visible && <button aria-selected={view === "trash"} className={view === "trash" ? "active trash-tab" : "trash-tab"} onClick={() => setView("trash")} role="tab" type="button">{labels.trash} <span>{counts.trash}</span></button>}</div>
    <div className="category-strip collection-category-strip" role="tablist"><button aria-selected={category === "all"} className={category === "all" ? "active" : ""} onClick={() => setCategory("all")} role="tab" type="button">全部 <span>{counts.all}</span></button><button aria-selected={category === "unclassified"} className={category === "unclassified" ? "active" : ""} onClick={() => setCategory("unclassified")} role="tab" type="button">未分類 <span>{activeItems.filter((item) => !item.category).length}</span></button>{categories.map((item) => <button aria-selected={category === item.id} className={category === item.id ? "active" : ""} key={item.id} onClick={() => setCategory(item.id)} role="tab" type="button">{item.name} <span>{categoryCount(item.id)}</span></button>)}</div>
    <FolderUnlockDialog folder={lockedFolder} kind={storageKey.includes(":note:") ? "note" : storageKey.includes(":code:") ? "code" : storageKey.includes(":file:") ? "file" : "photo"} onClose={() => setLockedFolder(null)} onUnlocked={() => { if (lockedFolder) window.sessionStorage.setItem(`${storageKey}:unlock-target`, lockedFolder.id); window.location.reload(); }} />
  </>;
}

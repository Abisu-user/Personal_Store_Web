"use client";

import { useMemo, useState } from "react";

type Folder = { id: string; name: string; is_visible?: boolean };
type Category = { id: string; name: string; folder_id: string | null };

function toggle(values: string[], id: string) { return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]; }

export function TaxonomyMultiSelect({ categories, categoryName = "categoryIds", defaultCategoryIds = [], defaultFolderIds = [], disabled = false, folderName = "folderIds", folders }: { categories: Category[]; categoryName?: string; defaultCategoryIds?: string[]; defaultFolderIds?: string[]; disabled?: boolean; folderName?: string; folders: Folder[] }) {
  const [folderIds, setFolderIds] = useState(() => [...new Set(defaultFolderIds)]);
  const [categoryIds, setCategoryIds] = useState(() => [...new Set(defaultCategoryIds)]);
  const visibleFolders = folders.filter((folder) => folder.is_visible !== false || folderIds.includes(folder.id));
  const availableCategories = useMemo(() => categories.filter((category) => category.folder_id === null || folderIds.includes(category.folder_id) || categoryIds.includes(category.id)), [categories, categoryIds, folderIds]);
  function toggleFolder(folderId: string) {
    setFolderIds((current) => {
      const next = toggle(current, folderId);
      if (!next.includes(folderId)) setCategoryIds((selected) => selected.filter((id) => categories.find((category) => category.id === id)?.folder_id !== folderId));
      return next;
    });
  }
  return <div className="taxonomy-multi-select">
    {folderIds.map((id) => <input key={`${folderName}:${id}`} name={folderName} type="hidden" value={id} />)}
    {categoryIds.map((id) => <input key={`${categoryName}:${id}`} name={categoryName} type="hidden" value={id} />)}
    <fieldset><legend>資料夾（可複選）</legend><div className="taxonomy-choice-grid">{visibleFolders.map((folder) => <label className={folderIds.includes(folder.id) ? "selected" : ""} key={folder.id}><input checked={folderIds.includes(folder.id)} disabled={disabled} onChange={() => toggleFolder(folder.id)} type="checkbox" />{folder.name}</label>)}</div>{!visibleFolders.length && <p className="hint">尚未建立資料夾。</p>}</fieldset>
    <fieldset><legend>類別（可複選）</legend><div className="taxonomy-choice-grid">{availableCategories.map((category) => <label className={categoryIds.includes(category.id) ? "selected" : ""} key={category.id}><input checked={categoryIds.includes(category.id)} disabled={disabled} onChange={() => setCategoryIds((current) => toggle(current, category.id))} type="checkbox" />{category.name}</label>)}</div>{!availableCategories.length && <p className="hint">目前選取的資料夾尚未建立類別。</p>}</fieldset>
  </div>;
}

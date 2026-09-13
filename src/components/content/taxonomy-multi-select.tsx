"use client";

import { useId, useMemo, useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";

type Folder = { id: string; name: string; is_visible?: boolean };
type Category = { id: string; name: string; folder_id: string | null };

function toggle(values: string[], id: string) { return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]; }

type TaxonomyMultiSelectProps = {
  categories: Category[];
  categoryIds?: string[];
  categoryName?: string;
  defaultCategoryIds?: string[];
  defaultFolderIds?: string[];
  disabled?: boolean;
  categoryHint?: string;
  folderHint?: string;
  folderIds?: string[];
  folderName?: string;
  folders: Folder[];
  onCategoryIdsChange?: (ids: string[]) => void;
  onFolderIdsChange?: (ids: string[]) => void;
  showFolders?: boolean;
  showUnassignedCategoriesWithFolders?: boolean;
};

export function TaxonomyMultiSelect({
  categories,
  categoryIds: controlledCategoryIds,
  categoryName = "categoryIds",
  defaultCategoryIds = [],
  defaultFolderIds = [],
  disabled = false,
  categoryHint = "選擇要使用的類別",
  folderHint = "選擇要使用的資料夾",
  folderIds: controlledFolderIds,
  folderName = "folderIds",
  folders,
  onCategoryIdsChange,
  onFolderIdsChange,
  showFolders = true,
  showUnassignedCategoriesWithFolders = true,
}: TaxonomyMultiSelectProps) {
  const folderTitleId = useId();
  const categoryTitleId = useId();
  const [localFolderIds, setLocalFolderIds] = useState(() => [...new Set(defaultFolderIds)]);
  const [localCategoryIds, setLocalCategoryIds] = useState(() => [...new Set(defaultCategoryIds)]);
  const folderIds = controlledFolderIds ?? localFolderIds;
  const categoryIds = controlledCategoryIds ?? localCategoryIds;
  const updateFolderIds = (ids: string[]) => {
    if (controlledFolderIds === undefined) setLocalFolderIds(ids);
    onFolderIdsChange?.(ids);
  };
  const updateCategoryIds = (ids: string[]) => {
    if (controlledCategoryIds === undefined) setLocalCategoryIds(ids);
    onCategoryIdsChange?.(ids);
  };
  const visibleFolders = folders.filter((folder) => folder.is_visible !== false || folderIds.includes(folder.id));
  const availableCategories = useMemo(() => categories.filter((category) => {
    if (categoryIds.includes(category.id)) return true;
    if (category.folder_id === null) return folderIds.length === 0 || showUnassignedCategoriesWithFolders;
    return folderIds.includes(category.folder_id);
  }), [categories, categoryIds, folderIds, showUnassignedCategoriesWithFolders]);
  function toggleFolder(folderId: string) {
    const next = toggle(folderIds, folderId);
    updateFolderIds(next);
    if (!next.includes(folderId)) updateCategoryIds(categoryIds.filter((id) => categories.find((category) => category.id === id)?.folder_id !== folderId));
  }
  return <div className="taxonomy-multi-select">
    {folderIds.map((id) => <input key={`${folderName}:${id}`} name={folderName} type="hidden" value={id} />)}
    {categoryIds.map((id) => <input key={`${categoryName}:${id}`} name={categoryName} type="hidden" value={id} />)}
    {showFolders && <section aria-labelledby={folderTitleId} className="taxonomy-section-card">
      <header className="taxonomy-section-header"><span className="taxonomy-section-icon"><AppIcon name="folder" /></span><div><h3 id={folderTitleId}>資料夾（可複選）</h3><p>{folderHint}</p></div></header>
      <div className="taxonomy-choice-grid">{visibleFolders.map((folder) => <label className={folderIds.includes(folder.id) ? "selected" : ""} key={folder.id}><input checked={folderIds.includes(folder.id)} disabled={disabled} onChange={() => toggleFolder(folder.id)} type="checkbox" /><span>{folder.name}</span></label>)}</div>
      {!visibleFolders.length && <p className="taxonomy-empty-hint">尚未建立資料夾。</p>}
    </section>}
    <section aria-labelledby={categoryTitleId} className="taxonomy-section-card">
      <header className="taxonomy-section-header"><span className="taxonomy-section-icon taxonomy-section-icon-tag"><AppIcon name="tag" /></span><div><h3 id={categoryTitleId}>類別（可複選）</h3><p>{categoryHint}</p></div></header>
      <div className="taxonomy-choice-grid">{availableCategories.map((category) => <label className={categoryIds.includes(category.id) ? "selected" : ""} key={category.id}><input checked={categoryIds.includes(category.id)} disabled={disabled} onChange={() => updateCategoryIds(toggle(categoryIds, category.id))} type="checkbox" /><span>{category.name}</span></label>)}</div>
      {!availableCategories.length && <p className="taxonomy-empty-hint">目前選取的資料夾尚未建立類別。</p>}
    </section>
  </div>;
}

"use client";

import { AppIcon } from "@/components/ui/app-icon";

export type DesktopCollectionCategory = { id: string; name: string; count?: number };

type TrashAction = { label: string; count?: number; active: boolean; onSelect: () => void };

export function DesktopCollectionSidebar({
  categories,
  selectedIds,
  allLabel = "全部",
  allCount,
  unclassifiedCount,
  onAll,
  onUnclassified,
  onCategory,
  onAdd,
  onManage,
  trash,
}: {
  categories: DesktopCollectionCategory[];
  selectedIds: readonly string[];
  allLabel?: string;
  allCount?: number;
  unclassifiedCount?: number;
  onAll: () => void;
  onUnclassified: () => void;
  onCategory: (id: string) => void;
  onAdd: () => void;
  onManage: () => void;
  trash?: TrashAction;
}) {
  const item = (label: string, active: boolean, onClick: () => void, count?: number, icon: "tag" | "trash" = "tag", key?: string) => (
    <button aria-pressed={active} className="desktop-collection-category" key={key ?? label} onClick={onClick} type="button">
      <AppIcon name={icon} />
      <span>{label}</span>
      {count !== undefined && <small>{count}</small>}
    </button>
  );

  return <aside aria-label="類別篩選" className="desktop-collection-sidebar">
    <header>
      <strong>類別</strong>
      <div>
        <button aria-label="新增類別" onClick={onAdd} title="新增類別" type="button"><AppIcon name="plus" /></button>
        <button onClick={onManage} type="button">管理</button>
      </div>
    </header>
    <div className="desktop-collection-category-list">
      {item(allLabel, selectedIds.length === 0, onAll, allCount)}
      {item("未分類", selectedIds.includes("unclassified"), onUnclassified, unclassifiedCount)}
      {categories.map((category) => item(category.name, selectedIds.includes(category.id), () => onCategory(category.id), category.count, "tag", category.id))}
    </div>
    {trash && <div className="desktop-collection-sidebar-footer">
      {item(trash.label, trash.active, trash.onSelect, trash.count, "trash")}
    </div>}
  </aside>;
}

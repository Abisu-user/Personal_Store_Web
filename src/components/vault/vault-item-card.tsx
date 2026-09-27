"use client";

import type { VaultField } from "./vault-fields";
import styles from "./vault-ui.module.css";

type CardItem = { id: string; label: string; notes: string; fields: VaultField[]; categoryIds: string[] };

export function VaultItemCard({
  item, categoryLabel, selectionMode, selected, menuOpen, expanded, visibleFieldKeys,
  onSelect, onMenu, onEdit, onDelete, onExpand, onToggleField, onCopy,
}: {
  item: CardItem;
  categoryLabel: string;
  selectionMode: boolean;
  selected: boolean;
  menuOpen: boolean;
  expanded: boolean;
  visibleFieldKeys: Set<string>;
  onSelect: () => void;
  onMenu: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onExpand: () => void;
  onToggleField: (fieldId: string) => void;
  onCopy: (field: VaultField) => void;
}) {
  const orderedFields = [...item.fields].sort((a, b) => a.order - b.order);
  const shownFields = expanded ? orderedFields : orderedFields.slice(0, 3);
  return <article className={selected ? "vault-item selected" : "vault-item"}>
    <header>
      {selectionMode ? <label className="vault-item-select"><input aria-label={`選取 ${item.label}`} checked={selected} onChange={onSelect} type="checkbox" /><span>選取</span></label> : <span className="vault-kind-badge">{categoryLabel}</span>}
      <div className="vault-item-menu"><button aria-expanded={menuOpen} aria-label={`開啟 ${item.label} 的操作選單`} className="vault-menu-trigger" onClick={onMenu} type="button">⋯</button>{menuOpen && <div className="vault-item-menu-popover"><button onClick={onEdit} type="button">編輯</button><button className="vault-menu-delete" onClick={onDelete} type="button">刪除</button></div>}</div>
    </header>
    <div className="vault-item-content"><h3>{item.label}</h3><div className={styles.itemFields}>
      {shownFields.map((field) => {
        const visible = visibleFieldKeys.has(`${item.id}:${field.id}`);
        return <div className={styles.itemField} key={field.id}>
          <span className={styles.itemFieldLabel}>{field.label}</span>
          <span className={styles.itemFieldValue} data-sensitive={field.type === "password"}>{field.value ? field.type === "password" && !visible ? "••••••••" : field.value : "尚未輸入"}</span>
          <span className={styles.itemFieldActions}>{field.type === "password" && <button aria-label={visible ? `隱藏 ${field.label}` : `顯示 ${field.label}`} onClick={() => onToggleField(field.id)} type="button">{visible ? "隱藏" : "顯示"}</button>}<button aria-label={`複製 ${field.label}`} disabled={!field.value} onClick={() => onCopy(field)} type="button">複製</button></span>
        </div>;
      })}
    </div>{orderedFields.length > 3 && <button aria-expanded={expanded} className={styles.expandFields} onClick={onExpand} type="button">{expanded ? "收合欄位⌃" : `顯示其他 ${orderedFields.length - 3} 個欄位⌄`}</button>}{item.notes && <p className="vault-notes">{item.notes}</p>}</div>
  </article>;
}

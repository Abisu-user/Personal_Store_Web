"use client";

import { ResponsiveChipOverflow } from "@/components/ui/responsive-chip-overflow";
import styles from "./vault-ui.module.css";

type Category = { id: string; name: string; itemCount: number };

export function VaultCategoryNavigation({ categories, filters, moreOpen, itemCount, onSelect, onMore, onManage }: {
  categories: Category[];
  filters: string[];
  moreOpen: boolean;
  itemCount: number;
  onSelect: (id: string) => void;
  onMore: () => void;
  onManage: () => void;
}) {
  return <>
    <aside aria-label="保管項目分類" className={styles.sidebar}>
      <div className={styles.sidebarTitle}><strong>分類</strong><button onClick={onManage} type="button">管理</button></div>
      <div className={styles.sidebarItems}>
        <button data-active={!filters.length} onClick={() => onSelect("all")} type="button"><span>全部</span><small>{itemCount}</small></button>
        <button data-active={filters.includes("unclassified")} onClick={() => onSelect("unclassified")} type="button"><span>未分類</span></button>
        {categories.map((category) => <button data-active={filters.includes(category.id)} key={category.id} onClick={() => onSelect(category.id)} type="button"><span>{category.name}</span><small>{category.itemCount || ""}</small></button>)}
      </div>
    </aside>
    <section aria-label="保管項目分類" className={`vault-categories ${styles.mobileCategories}`} data-chip-overflow-container>
      <div className="vault-category-heading"><strong>分類</strong><button className="secondary-button compact" onClick={onManage} type="button">管理</button></div>
      <div className="vault-category-row"><ResponsiveChipOverflow
        activeIds={filters.filter((id) => id !== "unclassified")}
        className="vault-filter-chips"
        items={categories}
        itemId={(category) => category.id}
        itemMeasureKey={(category) => `${category.name}|${category.itemCount}`}
        leading={<><button className={!filters.length ? "active" : ""} onClick={() => onSelect("all")} type="button">全部</button><button className={filters.includes("unclassified") ? "active" : ""} onClick={() => onSelect("unclassified")} type="button">未分類</button></>}
        leadingCount={2}
        renderItem={(category) => <button className={filters.includes(category.id) ? "active" : ""} key={category.id} onClick={() => onSelect(category.id)} type="button">{category.name}{category.itemCount ? ` ${category.itemCount}` : ""}</button>}
        renderMore={(hasHiddenActive) => <button aria-expanded={moreOpen} className={hasHiddenActive ? "active" : ""} onClick={onMore} type="button">更多</button>}
        rowClassName="vault-filter-chips-row"
      />{moreOpen && <div className="vault-more-categories">{categories.map((category) => <button className={filters.includes(category.id) ? "active" : ""} key={category.id} onClick={() => onSelect(category.id)} type="button">{category.name}{category.itemCount ? ` ${category.itemCount}` : ""}</button>)}</div>}</div>
    </section>
  </>;
}

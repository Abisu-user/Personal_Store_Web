"use client";

import { ReactNode, useLayoutEffect, useRef, useState } from "react";

type ResponsiveChipOverflowProps<T> = {
  activeId?: string | null;
  className?: string;
  /** Number of fixed chips rendered before items (for example: 全部 / 未分類). */
  leadingCount?: number;
  leading?: ReactNode;
  items: T[];
  itemId: (item: T) => string;
  itemMeasureKey?: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  renderMore: (hasHiddenActive: boolean) => ReactNode;
  rowClassName?: string;
  /** Number of fixed chips rendered after items (for example: 垃圾桶). */
  trailingCount?: number;
  trailing?: ReactNode;
};

/**
 * A single-line chip rail that measures the real DOM width of every chip.
 * A permanently hidden measurement row keeps every chip available for
 * calculation, so changing the visible row can never lose the dimensions that
 * are needed to decide whether the "更多" button is required.
 */
export function ResponsiveChipOverflow<T>({ activeId, className, leading, leadingCount = 0, items, itemId, itemMeasureKey, renderItem, renderMore, rowClassName, trailing, trailingCount = 0 }: ResponsiveChipOverflowProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const signature = items.map((item) => `${itemId(item)}:${itemMeasureKey?.(item) ?? ""}`).join("|");
  const hidden = items.slice(visibleCount);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return;
    const scope = root.closest<HTMLElement>("[data-chip-overflow-container]") ?? root.parentElement;
    const actions = scope?.querySelector<HTMLElement>("[data-chip-overflow-actions]") ?? null;
    const recalculate = () => {
      const rootBox = root.getBoundingClientRect();
      const sharesRailWithActions = Boolean(actions && actions.parentElement === root.parentElement);
      const actionWidth = sharesRailWithActions ? actions?.getBoundingClientRect().width ?? 0 : 0;
      const actionGap = sharesRailWithActions && actions?.parentElement
        ? Number.parseFloat(getComputedStyle(actions.parentElement).gap) || 0
        : 0;
      const availableWidth = Math.max(0, rootBox.width - actionWidth - actionGap);
      const children = Array.from(measure.children) as HTMLElement[];
      const fixedLeading = children.slice(0, leadingCount);
      const itemElements = children.slice(leadingCount, leadingCount + items.length);
      const more = children[leadingCount + items.length];
      const fixedTrailing = trailingCount ? children.slice(-trailingCount) : [];
      if (itemElements.length !== items.length) return;
      const gap = Number.parseFloat(getComputedStyle(measure).gap) || 0;
      const widthOf = (elements: HTMLElement[]) => elements.reduce((total, element) => total + element.getBoundingClientRect().width, 0);
      const leadingWidth = widthOf(fixedLeading);
      const trailingWidth = widthOf(fixedTrailing);
      const itemWidths = itemElements.map((element) => element.getBoundingClientRect().width);
      const allVisibleElements = leadingCount + items.length + trailingCount;
      const allWidth = leadingWidth + widthOf(itemElements) + trailingWidth + Math.max(0, allVisibleElements - 1) * gap;
      if (allWidth <= availableWidth + 1) {
        setVisibleCount((current) => current === items.length ? current : items.length);
        return;
      }
      const moreWidth = more?.getBoundingClientRect().width ?? 0;
      let retainedWidth = leadingWidth;
      let nextVisibleCount = 0;
      for (const width of itemWidths) {
        const candidateCount = nextVisibleCount + 1;
        const visibleElements = leadingCount + candidateCount + trailingCount + 1;
        const candidateWidth = retainedWidth + width + moreWidth + trailingWidth + Math.max(0, visibleElements - 1) * gap;
        if (candidateWidth > availableWidth + 1) break;
        retainedWidth += width;
        nextVisibleCount = candidateCount;
      }
      setVisibleCount((current) => current === nextVisibleCount ? current : nextVisibleCount);
    };
    recalculate();
    const observer = new ResizeObserver(recalculate);
    observer.observe(root);
    if (scope) observer.observe(scope);
    if (actions) observer.observe(actions);
    let active = true;
    void document.fonts?.ready.then(() => { if (active) recalculate(); });
    return () => { active = false; observer.disconnect(); };
  }, [leadingCount, items.length, signature, trailingCount]);

  return <div className={`responsive-chip-overflow${className ? ` ${className}` : ""}`} ref={rootRef}>
    <div className={`responsive-chip-overflow-row${rowClassName ? ` ${rowClassName}` : ""}`}>
      {leading}
      {items.slice(0, visibleCount).map(renderItem)}
      {hidden.length > 0 && renderMore(hidden.some((item) => itemId(item) === activeId))}
      {trailing}
    </div>
    <div aria-hidden="true" className={`responsive-chip-overflow-measure responsive-chip-overflow-row${rowClassName ? ` ${rowClassName}` : ""}`} ref={measureRef}>
      {leading}
      {items.map(renderItem)}
      {renderMore(false)}
      {trailing}
    </div>
  </div>;
}

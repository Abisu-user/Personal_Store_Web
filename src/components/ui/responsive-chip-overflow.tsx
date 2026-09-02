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
 * The first pass renders every item within the bounded rail; after measuring,
 * only the largest prefix that fits beside a real "更多" control remains.
 */
export function ResponsiveChipOverflow<T>({ activeId, className, leading, leadingCount = 0, items, itemId, itemMeasureKey, renderItem, renderMore, rowClassName, trailing, trailingCount = 0 }: ResponsiveChipOverflowProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const moreMeasureRef = useRef<HTMLDivElement>(null);
  const widthRef = useRef(0);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const signature = items.map((item) => `${itemId(item)}:${itemMeasureKey?.(item) ?? ""}`).join("|");
  const hidden = items.slice(visibleCount);
  const reset = () => setVisibleCount(items.length);

  useLayoutEffect(reset, [items, signature]);
  useLayoutEffect(() => {
    const root = rootRef.current; if (!root) return;
    const scope = root.closest<HTMLElement>("[data-chip-overflow-container]") ?? root.parentElement;
    const actions = scope?.querySelector<HTMLElement>("[data-chip-overflow-actions]") ?? null;
    const observer = new ResizeObserver((entries) => {
      const width = Math.round(root.getBoundingClientRect().width);
      if (entries.some((entry) => entry.target === actions) || width !== widthRef.current) {
        widthRef.current = width;
        reset();
      }
    });
    widthRef.current = Math.round(root.getBoundingClientRect().width);
    observer.observe(root); if (actions) observer.observe(actions);
    void document.fonts?.ready.then(reset);
    return () => observer.disconnect();
  }, [items, signature]);
  useLayoutEffect(() => {
    // A complete first pass is required to measure every possible chip.
    if (visibleCount !== items.length) return;
    const root = rootRef.current; const row = rowRef.current; const more = moreMeasureRef.current;
    if (!root || !row || !more) return;
    const frame = requestAnimationFrame(() => {
      const scope = root.closest<HTMLElement>("[data-chip-overflow-container]") ?? root.parentElement;
      const actions = scope?.querySelector<HTMLElement>("[data-chip-overflow-actions]");
      const actionWidth = actions?.getBoundingClientRect().width ?? 0;
      const actionGap = actions?.parentElement ? Number.parseFloat(getComputedStyle(actions.parentElement).gap) || 0 : 0;
      const availableWidth = Math.max(0, root.getBoundingClientRect().width - actionWidth - actionGap);
      const children = Array.from(row.children) as HTMLElement[];
      const fixedLeading = children.slice(0, leadingCount);
      const itemElements = children.slice(leadingCount, leadingCount + items.length);
      const fixedTrailing = trailingCount ? children.slice(-trailingCount) : [];
      if (itemElements.length !== items.length) return;
      const gap = Number.parseFloat(getComputedStyle(row).gap) || 0;
      const widthOf = (elements: HTMLElement[]) => elements.reduce((total, element) => total + element.getBoundingClientRect().width, 0);
      const leadingWidth = widthOf(fixedLeading);
      const trailingWidth = widthOf(fixedTrailing);
      const itemWidths = itemElements.map((element) => element.getBoundingClientRect().width);
      const allWidth = leadingWidth + widthOf(itemElements) + trailingWidth + Math.max(0, children.length - 1) * gap;
      if (allWidth <= availableWidth + 1) return;
      const moreWidth = more.getBoundingClientRect().width;
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
      setVisibleCount(nextVisibleCount);
    });
    return () => cancelAnimationFrame(frame);
  }, [items, leadingCount, signature, trailingCount, visibleCount]);

  return <div className={`responsive-chip-overflow${className ? ` ${className}` : ""}`} ref={rootRef}>
    <div className={`responsive-chip-overflow-row${rowClassName ? ` ${rowClassName}` : ""}`} ref={rowRef}>
      {leading}
      {items.slice(0, visibleCount).map(renderItem)}
      {hidden.length > 0 && renderMore(hidden.some((item) => itemId(item) === activeId))}
      {trailing}
    </div>
    <div aria-hidden="true" className={`responsive-chip-overflow-measure responsive-chip-overflow-row${rowClassName ? ` ${rowClassName}` : ""}`} ref={moreMeasureRef}>{renderMore(false)}</div>
  </div>;
}

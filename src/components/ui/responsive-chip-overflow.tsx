"use client";

import { ReactNode, useLayoutEffect, useRef, useState } from "react";

type ResponsiveChipOverflowProps<T> = {
  activeId?: string | null;
  className?: string;
  items: T[];
  itemId: (item: T) => string;
  itemMeasureKey?: (item: T) => string;
  leading?: ReactNode;
  renderItem: (item: T) => ReactNode;
  renderMore: (hasHiddenActive: boolean) => ReactNode;
  rowClassName?: string;
  trailing?: ReactNode;
};

/**
 * Keeps a single chip row without guessing from viewport breakpoints. It starts
 * with every chip, measures the real rendered widths, then only moves the chips
 * that no longer fit (including the More chip itself) into the caller's menu.
 */
export function ResponsiveChipOverflow<T>({ activeId, className, items, itemId, itemMeasureKey, leading, renderItem, renderMore, rowClassName, trailing }: ResponsiveChipOverflowProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const measuredWidthRef = useRef(0);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const signature = items.map((item) => `${itemId(item)}:${itemMeasureKey?.(item) ?? ""}`).join("|");
  const hidden = items.slice(visibleCount);

  useLayoutEffect(() => { setVisibleCount(items.length); }, [items, signature]);
  useLayoutEffect(() => {
    const root = rootRef.current; if (!root) return;
    const scope = root.closest<HTMLElement>("[data-chip-overflow-container]") ?? root.parentElement;
    const actions = scope?.querySelector<HTMLElement>("[data-chip-overflow-actions]") ?? null;
    let frame = 0;
    const reset = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setVisibleCount(items.length)); };
    const observeWidth = () => {
      const nextWidth = Math.round(root.getBoundingClientRect().width);
      if (nextWidth === measuredWidthRef.current) return;
      measuredWidthRef.current = nextWidth;
      reset();
    };
    const observer = new ResizeObserver((entries) => {
      if (actions && entries.some((entry) => entry.target === actions)) reset();
      else observeWidth();
    });
    observer.observe(root); if (actions) observer.observe(actions);
    observeWidth();
    void document.fonts?.ready.then(reset);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [items, items.length, signature]);
  useLayoutEffect(() => {
    const root = rootRef.current; const row = rowRef.current; if (!root || !row) return;
    const frame = requestAnimationFrame(() => {
      const scope = root.closest<HTMLElement>("[data-chip-overflow-container]") ?? root.parentElement;
      const actions = scope?.querySelector<HTMLElement>("[data-chip-overflow-actions]");
      const actionWidth = actions?.getBoundingClientRect().width ?? 0;
      const actionGap = actions?.parentElement ? Number.parseFloat(getComputedStyle(actions.parentElement).gap) || 0 : 0;
      const availableWidth = Math.max(0, root.getBoundingClientRect().width - actionWidth - actionGap);
      const rowLeft = row.getBoundingClientRect().left;
      const usedWidth = Math.max(0, ...Array.from(row.children).map((child) => child.getBoundingClientRect().right - rowLeft));
      // Once one item is hidden, renderMore is part of this same measurement,
      // so its own real width is reserved before any further item is retained.
      if (usedWidth > availableWidth + 1 && visibleCount > 0) setVisibleCount((count) => Math.max(0, count - 1));
    });
    return () => cancelAnimationFrame(frame);
  }, [visibleCount, items, signature]);

  return <div className={`responsive-chip-overflow${className ? ` ${className}` : ""}`} ref={rootRef}>
    <div className={`responsive-chip-overflow-row${rowClassName ? ` ${rowClassName}` : ""}`} ref={rowRef}>
      {leading}
      {items.slice(0, visibleCount).map(renderItem)}
      {hidden.length > 0 && renderMore(hidden.some((item) => itemId(item) === activeId))}
      {trailing}
    </div>
  </div>;
}

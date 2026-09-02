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
  const [visibleCount, setVisibleCount] = useState(items.length);
  const signature = items.map((item) => `${itemId(item)}:${itemMeasureKey?.(item) ?? ""}`).join("|");
  const hidden = items.slice(visibleCount);

  useLayoutEffect(() => { setVisibleCount(items.length); }, [items.length, signature]);
  useLayoutEffect(() => {
    const root = rootRef.current; if (!root) return;
    let frame = 0;
    const reset = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => setVisibleCount(items.length)); };
    const observer = new ResizeObserver(reset); observer.observe(root);
    void document.fonts?.ready.then(reset);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [items.length, signature]);
  useLayoutEffect(() => {
    const row = rowRef.current; if (!row) return;
    const frame = requestAnimationFrame(() => {
      if (row.scrollWidth > row.clientWidth + 1 && visibleCount > 0) setVisibleCount((count) => Math.max(0, count - 1));
    });
    return () => cancelAnimationFrame(frame);
  }, [visibleCount, signature]);

  return <div className={`responsive-chip-overflow${className ? ` ${className}` : ""}`} ref={rootRef}>
    <div className={`responsive-chip-overflow-row${rowClassName ? ` ${rowClassName}` : ""}`} ref={rowRef}>
      {leading}
      {items.slice(0, visibleCount).map(renderItem)}
      {hidden.length > 0 && renderMore(hidden.some((item) => itemId(item) === activeId))}
      {trailing}
    </div>
  </div>;
}

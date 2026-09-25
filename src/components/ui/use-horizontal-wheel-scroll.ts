"use client";

import { useEffect, type RefObject } from "react";

/** Pan an overflowing row with a mouse wheel; native horizontal trackpads and touch remain untouched. */
export function useHorizontalWheelScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  enabled = true,
) {
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || window.matchMedia("(max-width: 700px)").matches) return;
      if (node.scrollWidth <= node.clientWidth + 1) return;
      if (event.deltaX !== 0) return;
      if (!event.deltaY) return;
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? node.clientWidth : 1;
      const delta = event.deltaY * scale;
      const maxScroll = node.scrollWidth - node.clientWidth;
      const itemWidth = node.firstElementChild?.getBoundingClientRect().width ?? 200;
      const distance = Math.abs(delta) >= 40
        ? Math.sign(delta) * Math.max(Math.abs(delta), Math.min(itemWidth * 0.8, 240))
        : delta;
      const target = Math.max(0, Math.min(maxScroll, node.scrollLeft + distance));
      if (Math.abs(target - node.scrollLeft) < 1) return;
      event.preventDefault();
      node.scrollLeft = target;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [enabled, ref]);
}

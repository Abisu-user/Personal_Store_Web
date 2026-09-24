"use client";

import {
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

/** Native horizontal scroller: touch/trackpad remain native; vertical desktop wheel pans while space remains. */
export function AnimeHorizontalScroller({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      if (node.scrollWidth <= node.clientWidth + 1) return;
      // A horizontal precision-trackpad gesture already scrolls this native
      // container. Handling deltaX here would move it a second time.
      if (Math.abs(event.deltaX) > 2 && Math.abs(event.deltaX) >= Math.abs(event.deltaY) * 0.5) return;
      if (!event.deltaY) return;
      const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? node.clientWidth : 1;
      const delta = event.deltaY * scale;
      const maxScroll = node.scrollWidth - node.clientWidth;
      const cardWidth = node.firstElementChild?.getBoundingClientRect().width ?? 200;
      // One mouse-wheel notch must clear the snap threshold. Small trackpad
      // vertical deltas keep their original fine-grained movement.
      const distance = Math.abs(delta) >= 40
        ? Math.sign(delta) * Math.max(Math.abs(delta), cardWidth * 0.8)
        : delta;
      const target = Math.max(0, Math.min(maxScroll, node.scrollLeft + distance));
      if (Math.abs(target - node.scrollLeft) < 1) return;
      event.preventDefault();
      node.scrollLeft = target;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div
      {...props}
      className={className}
      ref={ref}
    >
      {children}
    </div>
  );
}

"use client";

import {
  useEffect,
  useRef,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type DragState = {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  dragged: boolean;
};

/** Shared native scroller: touch remains native; desktop adds wheel and mouse drag. */
export function AnimeHorizontalScroller({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth + 1) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
      if (!delta) return;
      const atStart = node.scrollLeft <= 0;
      const atEnd = node.scrollLeft + node.clientWidth >= node.scrollWidth - 1;
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;
      event.preventDefault();
      node.scrollLeft += delta;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const node = ref.current;
    if (!node || node.scrollWidth <= node.clientWidth + 1) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: node.scrollLeft,
      dragged: false,
    };
    node.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const node = ref.current;
    if (!state || !node || state.pointerId !== event.pointerId) return;
    const distance = event.clientX - state.startX;
    if (!state.dragged && Math.abs(distance) < 5) return;
    state.dragged = true;
    suppressClick.current = true;
    node.dataset.dragging = "true";
    node.scrollLeft = state.startScrollLeft - distance;
    event.preventDefault();
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const node = ref.current;
    if (!state || !node || state.pointerId !== event.pointerId) return;
    if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
    delete node.dataset.dragging;
    drag.current = null;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
  };

  return (
    <div
      {...props}
      className={className}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={endDrag}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      ref={ref}
    >
      {children}
    </div>
  );
}

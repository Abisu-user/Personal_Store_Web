"use client";

import { useRef, type HTMLAttributes, type ReactNode } from "react";
import { useHorizontalWheelScroll } from "@/components/ui/use-horizontal-wheel-scroll";

/** Native horizontal scroller: touch/trackpad remain native; vertical desktop wheel pans while space remains. */
export function AnimeHorizontalScroller({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useHorizontalWheelScroll(ref);

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

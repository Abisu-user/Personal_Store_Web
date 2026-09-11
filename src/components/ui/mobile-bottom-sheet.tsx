"use client";
import { useLayoutEffect, type ReactNode } from "react";
import { ModalDialog } from "./modal-dialog";

/** One dialog tree and interaction path. Only its phone CSS makes it a sheet. */
export function MobileBottomSheet({ open, onClose, title, children, className = "", eyebrow }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string; eyebrow?: string;
}) {
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = document.querySelector(".mobile-bottom-sheet");
      const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? [])
        .filter(el => el.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);
  return <ModalDialog open={open} onClose={onClose} title={title} eyebrow={eyebrow} className={`mobile-bottom-sheet ${className}`}>{children}</ModalDialog>;
}

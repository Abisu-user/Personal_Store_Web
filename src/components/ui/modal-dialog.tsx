"use client";

import { ReactNode, useEffect, useId, useRef } from "react";

type ModalDialogProps = {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  pending?: boolean;
  title: string;
};

export function ModalDialog({ children, onClose, open, pending = false, title }: ModalDialogProps) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, pending]);

  if (!open) return null;

  return <div className="modal-dialog-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget && !pending) onClose();
  }}>
    <section aria-labelledby={titleId} aria-modal="true" className="modal-dialog" role="dialog">
      <header className="modal-dialog-header">
        <div><p className="eyebrow">EDIT PRIVATE ITEM</p><h2 id={titleId}>{title}</h2></div>
        <button aria-label="關閉視窗" className="modal-dialog-close" disabled={pending} onClick={onClose} ref={closeButton} type="button">×</button>
      </header>
      <div className="modal-dialog-content">{children}</div>
    </section>
  </div>;
}

export function OperationStatus({ label = "正在處理資料…" }: { label?: string }) {
  return <div aria-live="polite" className="operation-status" role="status"><span aria-hidden="true" />{label}</div>;
}

"use client";

import { useEffect, useRef } from "react";
import { useMobileModalLayout } from "@/components/ui/mobile-modal-layout";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ open, title, description, confirmLabel = "確認刪除", pending = false, error, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelButton = useRef<HTMLButtonElement>(null);

  useMobileModalLayout(open);

  useEffect(() => {
    if (!open) return;
    cancelButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape" && !pending) onCancel(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel, open, pending]);

  if (!open) return null;

  return <div className="confirm-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onCancel(); }}>
    <section aria-describedby="confirm-dialog-description" aria-labelledby="confirm-dialog-title" aria-modal="true" className="confirm-dialog" role="alertdialog">
      <span aria-hidden="true" className="confirm-dialog-icon">!</span>
      <div><p className="eyebrow">DELETE CONFIRMATION</p><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-description">{description}</p></div>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="delete-button" disabled={pending} onClick={onConfirm} type="button">{pending ? "處理中…" : confirmLabel}</button><button className="secondary-button" disabled={pending} onClick={onCancel} ref={cancelButton} type="button">取消</button></div>
    </section>
  </div>;
}

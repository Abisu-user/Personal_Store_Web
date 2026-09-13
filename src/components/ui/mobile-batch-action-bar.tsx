"use client";

import type { ReactNode } from "react";

type MobileBatchActionBarProps = {
  children: ReactNode;
  count: number;
  onCancel: () => void;
  unit?: string;
};

export function MobileBatchActionBar({ children, count, onCancel, unit = "筆" }: MobileBatchActionBarProps) {
  if (count < 1) return null;
  return <aside aria-label="批量操作" aria-live="polite" className="mobile-batch-action-bar">
    <strong>已選 {count} {unit}</strong>
    <button className="mobile-batch-cancel" onClick={onCancel} type="button">取消</button>
    <div className="mobile-batch-actions">{children}</div>
  </aside>;
}

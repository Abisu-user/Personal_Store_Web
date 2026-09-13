"use client";

import type { ReactNode } from "react";

type BatchActionBarProps = {
  children: ReactNode;
  count: number;
  onCancel: () => void;
  unit?: string;
};

export function BatchActionBar({ children, count, onCancel, unit = "筆" }: BatchActionBarProps) {
  if (count < 1) return null;
  return <aside aria-label="批量操作" aria-live="polite" className="batch-action-bar">
    <strong>已選 {count} {unit}</strong>
    <button className="batch-action-cancel" onClick={onCancel} type="button">取消</button>
    <div className="batch-action-buttons">{children}</div>
  </aside>;
}

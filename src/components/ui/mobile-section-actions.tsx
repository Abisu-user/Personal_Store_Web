"use client";

import { useState } from "react";
import { AppIcon } from "@/components/ui/app-icon";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";

export type MobileSectionAction = {
  label: string;
  onSelect: () => void;
  description?: string;
  destructive?: boolean;
};

export function MobileSectionActions({
  actions,
  label,
  title,
}: {
  actions: MobileSectionAction[];
  label: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);

  function select(action: MobileSectionAction) {
    setOpen(false);
    window.setTimeout(action.onSelect, 0);
  }

  return <>
    <button aria-label={label} className="mobile-section-actions-trigger" onClick={() => setOpen(true)} type="button">
      <AppIcon name="more" />
    </button>
    <MobileBottomSheet className="mobile-section-action-sheet" onClose={() => setOpen(false)} open={open} title={title}>
      <div className="mobile-section-action-list">
        {actions.map((action) => <button className={action.destructive ? "destructive" : ""} key={action.label} onClick={() => select(action)} type="button">
          <span>{action.label}</span>
          {action.description ? <small>{action.description}</small> : null}
        </button>)}
      </div>
    </MobileBottomSheet>
  </>;
}

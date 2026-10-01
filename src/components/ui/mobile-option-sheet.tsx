"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MobileBottomSheet } from "./mobile-bottom-sheet";
import styles from "./mobile-option-sheet.module.css";

export type MobileOptionGroup = {
  label: string;
  options: { value: string; label: string }[];
};

export function MobileOptionSheet({ open, title, groups, selectedValues, onSelect, onClose, onDone, children }: {
  open: boolean;
  title: string;
  groups: MobileOptionGroup[];
  selectedValues: readonly string[];
  onSelect: (value: string) => void;
  onClose: () => void;
  onDone?: () => boolean | void;
  children?: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  function close() {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setClosing(false);
      onClose();
    }, 220);
  }

  const selected = new Set(selectedValues);
  return <MobileBottomSheet
    className={`${styles.sheet} ${closing ? styles.closing : ""}`}
    eyebrow="選擇"
    footer={onDone ? <div className={styles.footer}><button className="button" onClick={() => { if (onDone() !== false) close(); }} type="button">完成</button></div> : undefined}
    onClose={close}
    open={open}
    title={title}
  >
    <div className={styles.groups}>
      {groups.map((group) => <section className={styles.group} key={group.label}>
        <h3>{group.label}</h3>
        <div aria-label={group.label} role="group">
          {group.options.map((option) => {
            const active = selected.has(option.value);
            return <button aria-pressed={active} className={styles.option} key={option.value} onClick={() => onSelect(option.value)} type="button">
              <span>{option.label}</span><span aria-hidden="true" className={active ? styles.selected : styles.unselected}>{active ? "✓" : "○"}</span>
            </button>;
          })}
        </div>
      </section>)}
      {children}
    </div>
  </MobileBottomSheet>;
}

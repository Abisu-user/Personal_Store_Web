"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef } from "react";

import styles from "./glassy-pin-verification.module.css";

export type PinVerificationState = "input" | "centering" | "verifying" | "success" | "error";

type PinDigitInputProps = {
  length: 4 | 6;
  value: string;
  state: PinVerificationState;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  focusSignal?: number;
};

type PinStyle = CSSProperties & {
  "--pin-angle": string;
  "--pin-counter-angle": string;
  "--pin-row-left": string;
};

export function PinDigitInput({
  length,
  value,
  state,
  onDigit,
  onBackspace,
  focusSignal = 0,
}: PinDigitInputProps) {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const digits = useMemo(() => Array.from({ length }, (_, index) => value[index] ?? ""), [length, value]);
  const disabled = state !== "input";

  useEffect(() => {
    if (disabled) return;
    const timer = window.setTimeout(() => scopeRef.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(timer);
  }, [disabled, focusSignal]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      onDigit(event.key);
      return;
    }
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onBackspace();
    }
  }

  return (
    <div
      ref={scopeRef}
      className={`${styles.pinStage} ${styles[`pinStage${length}`]} ${styles[`state${state[0].toUpperCase()}${state.slice(1)}`]}`}
      data-length={length}
      aria-label={`${length} 位數 PIN 碼輸入區，可使用實體數字鍵盤`}
      onKeyDown={handleKeyDown}
      role="group"
      tabIndex={disabled ? -1 : 0}
    >
      {digits.map((digit, index) => {
        const rowStart = length === 4 ? 12 : 8;
        const rowEnd = length === 4 ? 88 : 92;
        const rowLeft = rowStart + ((rowEnd - rowStart) * index) / (length - 1);
        const style = {
          "--pin-angle": `${(360 / length) * index}deg`,
          "--pin-counter-angle": `${-(360 / length) * index}deg`,
          "--pin-row-left": `${rowLeft}%`,
        } as PinStyle;
        return (
          <div className={styles.digitOrbit} style={style} key={index}>
            <div className={styles.digitFrame}>
              <div className={styles.digitContent}>
                <span className={styles.pinDigit} aria-label={`PIN 第 ${index + 1} 碼${digit ? `：${digit}` : "：尚未輸入"}`}>
                  {digit}
                </span>
              </div>
              <span className={styles.digitOrder} aria-hidden="true">
                {String.fromCharCode(9312 + index)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

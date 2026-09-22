"use client";

import type { CSSProperties, ClipboardEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef } from "react";

import styles from "./glassy-pin-verification.module.css";

export type PinVerificationState = "input" | "verifying" | "success" | "error";

type PinDigitInputProps = {
  length: 4 | 6;
  value: string;
  state: PinVerificationState;
  onChange: (value: string) => void;
  onComplete: (value: string) => void;
  autoFocus?: boolean;
  allowPaste?: boolean;
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
  onChange,
  onComplete,
  autoFocus = true,
  allowPaste = false,
  focusSignal = 0,
}: PinDigitInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const completedValue = useRef("");
  const digits = useMemo(() => Array.from({ length }, (_, index) => value[index] ?? ""), [length, value]);
  const disabled = state !== "input";

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const target = Math.min(value.length, length - 1);
    const timer = window.setTimeout(() => inputs.current[target]?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(timer);
  }, [autoFocus, disabled, focusSignal, length, value.length]);

  useEffect(() => {
    if (value.length < length) completedValue.current = "";
  }, [length, value]);

  function commit(nextValue: string) {
    const normalized = nextValue.replace(/\D/g, "").slice(0, length);
    onChange(normalized);
    if (normalized.length === length && completedValue.current !== normalized) {
      completedValue.current = normalized;
      window.setTimeout(() => onComplete(normalized), 130);
    }
  }

  function handleDigit(index: number, nextValue: string) {
    if (disabled) return;
    const digit = nextValue.replace(/\D/g, "").slice(-1);
    const next = digits.slice();
    next[index] = digit;
    const joined = next.join("");
    commit(joined);
    if (digit && index < length - 1) inputs.current[index + 1]?.focus({ preventScroll: true });
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;
    if (event.key === "Backspace") {
      event.preventDefault();
      if (digits[index]) {
        const next = digits.slice();
        next[index] = "";
        completedValue.current = "";
        onChange(next.join(""));
      } else if (index > 0) {
        const next = digits.slice();
        next[index - 1] = "";
        completedValue.current = "";
        onChange(next.join(""));
        inputs.current[index - 1]?.focus({ preventScroll: true });
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus({ preventScroll: true });
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus({ preventScroll: true });
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    if (!allowPaste || disabled) return;
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    commit(pasted);
    inputs.current[Math.min(pasted.length, length - 1)]?.focus({ preventScroll: true });
  }

  return (
    <div
      className={`${styles.pinStage} ${styles[`pinStage${length}`]} ${styles[`state${state[0].toUpperCase()}${state.slice(1)}`]}`}
      data-length={length}
      aria-label={`${length} 位數 PIN 碼`}
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
                <input
                  ref={(node) => {
                    inputs.current[index] = node;
                  }}
                  className={styles.digitInput}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  autoComplete="off"
                  value={digit}
                  disabled={disabled}
                  aria-label={`PIN 第 ${index + 1} 碼`}
                  onChange={(event) => handleDigit(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  onPaste={handlePaste}
                  onFocus={(event) => event.currentTarget.select()}
                />
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

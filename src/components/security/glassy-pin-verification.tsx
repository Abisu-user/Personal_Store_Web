"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppIcon } from "@/components/ui/app-icon";

import { PinDigitInput, type PinVerificationState } from "./pin-digit-input";
import { GlassyNumericKeypad } from "./glassy-numeric-keypad";
import styles from "./glassy-pin-verification.module.css";

const VERIFYING_MINIMUM_MS = 1_050;
const CENTERING_MS = 520;
const SUCCESS_HOLD_MS = 1_050;
const ERROR_HOLD_MS = 900;

export class PinVerificationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "PinVerificationError";
    this.status = status;
  }
}

export async function pinVerificationErrorFromResponse(response: Response, fallback: string) {
  let message = fallback;
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) message = payload.error;
  } catch {
    // Keep the user-safe fallback when an upstream response has no JSON body.
  }
  return new PinVerificationError(message, response.status);
}

type GlassyPinVerificationProps = {
  length: 4 | 6;
  verifyPin: (pin: string) => Promise<void>;
  onVerified: () => void | Promise<void>;
  title?: string;
  description?: string;
  onCancel?: () => void;
  cancelLabel?: string;
  secondaryActions?: (busy: boolean) => ReactNode;
  externalMessage?: string;
  embedded?: boolean;
  onStateChange?: (state: PinVerificationState) => void;
};

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

function stateCopy(state: PinVerificationState, errorStatus: number | null) {
  if (state === "centering") return { title: "正在驗證…", detail: "正在安全地準備驗證 PIN 碼" };
  if (state === "verifying") return { title: "正在驗證…", detail: "請稍候，正在安全地確認 PIN 碼" };
  if (state === "success") return { title: "驗證成功", detail: "已安全解鎖" };
  if (state === "error") {
    if (errorStatus === 429) return { title: "暫時無法重試", detail: "請依提示稍後再試" };
    if (errorStatus === 503) return { title: "服務暫時無法使用", detail: "請稍後再試" };
    return { title: "驗證失敗", detail: "PIN 碼錯誤，請重新輸入" };
  }
  return { title: "驗證 PIN 碼", detail: "輸入完成後會自動驗證" };
}

export function GlassyPinVerification({
  length,
  verifyPin,
  onVerified,
  title,
  description,
  onCancel,
  cancelLabel = "取消",
  secondaryActions,
  externalMessage,
  embedded = false,
  onStateChange,
}: GlassyPinVerificationProps) {
  const [pin, setPin] = useState("");
  const [state, setState] = useState<PinVerificationState>("input");
  const [message, setMessage] = useState("");
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const requestLock = useRef(false);
  const mounted = useRef(true);
  const copy = stateCopy(state, errorStatus);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  const submit = useCallback(
    async (completedPin: string) => {
      if (requestLock.current || state !== "input") return;
      requestLock.current = true;
      setMessage("");
      setErrorStatus(null);
      setState("centering");
      const startedAt = performance.now();
      const verification = verifyPin(completedPin).then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      );
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion) await delay(CENTERING_MS);
      if (!mounted.current) return;
      setState("verifying");
      const result = await verification;
      const elapsed = performance.now() - startedAt;
      if (elapsed < VERIFYING_MINIMUM_MS) await delay(VERIFYING_MINIMUM_MS - elapsed);
      if (!mounted.current) return;

      if (result.ok) {
        setState("success");
        await delay(SUCCESS_HOLD_MS);
        if (mounted.current) await onVerified();
        return;
      }

      const normalized = result.error instanceof PinVerificationError
        ? result.error
        : new PinVerificationError("PIN 驗證暫時無法完成，請稍後再試。", 503);
      setErrorStatus(normalized.status);
      setMessage(normalized.message);
      setState("error");
      await delay(ERROR_HOLD_MS);
      if (!mounted.current) return;
      setPin("");
      setState("input");
      requestLock.current = false;
      setFocusSignal((current) => current + 1);
    },
    [onVerified, state, verifyPin],
  );

  const busy = state === "centering" || state === "verifying" || state === "success";
  const visibleMessage = message || (state === "input" ? externalMessage : "");
  const enterDigit = useCallback((digit: string) => {
    if (state !== "input" || requestLock.current || !/^[0-9]$/.test(digit) || pin.length >= length) return;
    const next = `${pin}${digit}`;
    setPin(next);
    if (message) setMessage("");
    if (next.length === length) window.setTimeout(() => void submit(next), 130);
  }, [length, message, pin, state, submit]);
  const removeLastDigit = useCallback(() => {
    if (state !== "input" || requestLock.current) return;
    setPin((current) => current.slice(0, -1));
    if (message) setMessage("");
  }, [message, state]);
  const handleScopeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || state !== "input") return;
    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      enterDigit(event.key);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      removeLastDigit();
    }
  };

  return (
    <section className={`${styles.shell} ${embedded ? styles.embedded : ""}`} data-state={state} onKeyDown={handleScopeKeyDown}>
      <div className={styles.aurora} aria-hidden="true" />
      <div className={styles.heading}>
        <span className={`${styles.stateIcon} ${styles[`stateIcon${state[0].toUpperCase()}${state.slice(1)}`]}`}>
          <AppIcon name={state === "success" ? "security" : "lock"} height={24} width={24} />
        </span>
        <div>
          <p className={styles.eyebrow}>SECURE VERIFICATION</p>
          <h2>{title ?? copy.title}</h2>
          <p>{description ?? copy.detail}</p>
        </div>
      </div>

      <PinDigitInput
        length={length}
        value={pin}
        state={state}
        onDigit={enterDigit}
        onBackspace={removeLastDigit}
        focusSignal={focusSignal}
      />

      <GlassyNumericKeypad disabled={state !== "input"} onDigit={enterDigit} onBackspace={removeLastDigit} />

      <div
        className={`${styles.statusArea} ${state === "input" && !visibleMessage ? styles.statusAreaIdle : ""}`}
        aria-live="polite"
        aria-atomic="true"
        aria-hidden={state === "input" && !visibleMessage}
      >
        <strong>{copy.title}</strong>
        <span>{visibleMessage || copy.detail}</span>
      </div>

      {state === "success" ? (
        <div className={styles.successMark} aria-hidden="true">
          <span>✓</span>
        </div>
      ) : null}

      {secondaryActions ? <div className={styles.secondaryActions}>{secondaryActions(busy)}</div> : null}
      {onCancel ? (
        <button type="button" className={styles.cancelButton} onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
      ) : null}
    </section>
  );
}

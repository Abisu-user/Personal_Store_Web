"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppIcon } from "@/components/ui/app-icon";

import { PinDigitInput, type PinVerificationState } from "./pin-digit-input";
import styles from "./glassy-pin-verification.module.css";

const VERIFYING_MINIMUM_MS = 1_050;
const SUCCESS_HOLD_MS = 720;
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
      setState("verifying");
      const startedAt = performance.now();
      let caught: unknown = null;
      try {
        await verifyPin(completedPin);
      } catch (error) {
        caught = error;
      }
      const elapsed = performance.now() - startedAt;
      if (elapsed < VERIFYING_MINIMUM_MS) await delay(VERIFYING_MINIMUM_MS - elapsed);
      if (!mounted.current) return;

      if (!caught) {
        setState("success");
        await delay(SUCCESS_HOLD_MS);
        if (mounted.current) await onVerified();
        return;
      }

      const normalized = caught instanceof PinVerificationError
        ? caught
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

  const busy = state === "verifying" || state === "success";
  const visibleMessage = message || (state === "input" ? externalMessage : "");

  return (
    <section className={`${styles.shell} ${embedded ? styles.embedded : ""}`} data-state={state}>
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
        onChange={(next) => {
          setPin(next);
          if (message) setMessage("");
        }}
        onComplete={submit}
        focusSignal={focusSignal}
      />

      <div className={styles.statusArea} aria-live="polite" aria-atomic="true">
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

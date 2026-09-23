"use client";

import styles from "./glassy-pin-verification.module.css";

type GlassyNumericKeypadProps = {
  disabled: boolean;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
};

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function GlassyNumericKeypad({ disabled, onDigit, onBackspace }: GlassyNumericKeypadProps) {
  return (
    <div className={styles.keypad} aria-label="PIN 數字鍵盤" aria-disabled={disabled}>
      {digits.map((digit) => (
        <button className={styles.keypadKey} disabled={disabled} key={digit} onClick={() => onDigit(digit)} type="button">
          {digit}
        </button>
      ))}
      <span className={styles.keypadSpacer} aria-hidden="true" />
      <button className={styles.keypadKey} disabled={disabled} onClick={() => onDigit("0")} type="button">0</button>
      <button aria-label="刪除最後一碼" className={`${styles.keypadKey} ${styles.backspaceKey}`} disabled={disabled} onClick={onBackspace} type="button">⌫</button>
    </div>
  );
}

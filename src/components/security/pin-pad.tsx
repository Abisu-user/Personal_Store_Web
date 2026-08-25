"use client";

type PinPadProps = {
  length: 4 | 6;
  value: string;
  onChange: (value: string) => void;
  onComplete: (value: string) => void | Promise<void>;
  disabled?: boolean;
  label: string;
};

export function PinPad({ length, value, onChange, onComplete, disabled = false, label }: PinPadProps) {
  function append(digit: string) {
    if (disabled) return;
    const next = `${value}${digit}`.slice(0, length);
    onChange(next);
    if (next.length === length) window.setTimeout(() => void onComplete(next), 0);
  }
  return <div className="pin-unlock-panel">
    <p>{label}</p>
    <div aria-label="已輸入的 PIN 位數" className="app-pin-dots">{Array.from({ length }, (_, index) => <i className={index < value.length ? "filled" : ""} key={index} />)}</div>
    <div className="app-pin-pad">{"123456789".split("").map((digit) => <button aria-label={`數字 ${digit}`} disabled={disabled} key={digit} onClick={() => append(digit)} type="button">{digit}</button>)}<span /><button aria-label="數字 0" disabled={disabled} onClick={() => append("0")} type="button">0</button><button aria-label="刪除一位 PIN" className="app-pin-backspace" disabled={disabled || !value} onClick={() => onChange(value.slice(0, -1))} type="button">⌫</button></div>
  </div>;
}

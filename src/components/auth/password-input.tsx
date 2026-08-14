"use client";

import { useState } from "react";

type PasswordInputProps = {
  autoComplete: "current-password" | "new-password";
  hint?: string;
  id: string;
  label: string;
  name: string;
};

export function PasswordInput({ autoComplete, hint, id, label, name }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input autoComplete={autoComplete} id={id} name={name} required type={visible ? "text" : "password"} />
        <button aria-label={visible ? "隱藏密碼" : "顯示密碼"} className="password-toggle" onClick={() => setVisible((value) => !value)} type="button">
          {visible ? "◉" : "◌"}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

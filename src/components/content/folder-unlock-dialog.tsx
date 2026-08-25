"use client";

import { useState } from "react";
import type { FolderLockKind, FolderLockMode } from "@/lib/folder-locks/types";
import { PinPad } from "@/components/security/pin-pad";

type LockedFolder = { id: string; name: string; lock_mode?: FolderLockMode | null };

function modeHint(mode: FolderLockMode | null | undefined) {
  return mode === "pin4" ? "請輸入 4 位數 PIN 碼" : mode === "pin6" ? "請輸入 6 位數 PIN 碼" : "請輸入英文、數字與符號組成的密碼";
}

export function FolderUnlockDialog({ folder, kind, onClose, onUnlocked }: { folder: LockedFolder | null; kind: FolderLockKind; onClose: () => void; onUnlocked: () => Promise<void> | void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!folder) return null;
  const activeFolder = folder;
  const isPin = activeFolder.lock_mode === "pin4" || activeFolder.lock_mode === "pin6";
  async function verify(value = password) {
    setPending(true); setError(null);
    try {
      const response = await fetch("/api/folder-locks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", kind, folderId: activeFolder.id, password: value }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "無法解鎖資料夾。 ");
      await onUnlocked(); setPassword(""); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "無法解鎖資料夾。 "); } finally { setPending(false); }
  }
  const pinLength = activeFolder.lock_mode === "pin6" ? 6 : 4;
  return <div aria-label="關閉資料夾解鎖視窗" className="folder-lock-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}><section aria-labelledby="folder-unlock-title" aria-modal="true" className="folder-lock-dialog" role="dialog"><div className="folder-lock-dialog-content"><p className="eyebrow">LOCKED FOLDER</p><h2 id="folder-unlock-title">解鎖「{folder.name}」</h2><p>{modeHint(folder.lock_mode)}</p>{isPin ? <><PinPad disabled={pending} label={pinLength === 4 ? "輸入 4 位數資料夾 PIN" : "輸入 6 位數資料夾 PIN"} length={pinLength} onChange={setPassword} onComplete={(value) => void verify(value)} value={password} />{error && <p className="notice error" role="alert">{error}</p>}<div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={onClose} type="button">取消</button></div></> : <form onSubmit={(event) => { event.preventDefault(); void verify(); }}><label>資料夾密碼<input autoComplete="current-password" autoFocus maxLength={128} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>{error && <p className="notice error" role="alert">{error}</p>}<div className="dialog-actions"><button className="button" disabled={pending} type="submit">{pending ? "驗證中…" : "解鎖並開啟"}</button><button className="secondary-button" disabled={pending} onClick={onClose} type="button">取消</button></div></form>}</div></section></div>;
}

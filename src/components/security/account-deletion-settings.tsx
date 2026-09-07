"use client";

import { FormEvent, useState } from "react";

import { clearAppearanceIdentity } from "@/lib/appearance/preferences";
import { clearClientResources } from "@/lib/pwa/client-resource-cache";
import { createClient } from "@/lib/supabase/client";
import { ModalDialog } from "@/components/ui/modal-dialog";

export function AccountDeletionSettings() {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (pending) return;
    setOpen(false);
    setConfirmation("");
    setError(null);
  }

  async function removeAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== "DELETE") return;
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/security/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "目前無法刪除帳號。");

      clearAppearanceIdentity();
      clearClientResources();
      await createClient().auth.signOut({ scope: "local" }).catch(() => undefined);
      window.location.replace("/login?accountDeleted=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "目前無法刪除帳號。");
      setPending(false);
    }
  }

  return <section className="account-danger-zone">
    <div><p className="eyebrow">DANGER ZONE</p><h2>刪除帳號</h2><p>永久刪除帳號、所有個人資料與上傳檔案。此操作無法復原。</p></div>
    <button className="delete-button compact" onClick={() => setOpen(true)} type="button">刪除帳號</button>
    <ModalDialog eyebrow="PERMANENT ACTION" onClose={close} open={open} pending={pending} title="永久刪除帳號">
      <form className="account-delete-form" onSubmit={removeAccount}>
        <div className="account-delete-warning"><strong>刪除後無法復原</strong><p>你的收藏、筆記、檔案、照片、動漫、單字、保管庫、安全設定與所有上傳檔案都會永久刪除。</p></div>
        <label>請輸入 <code>DELETE</code> 確認<input autoCapitalize="characters" autoComplete="off" autoFocus disabled={pending} onChange={(event) => setConfirmation(event.target.value)} spellCheck={false} value={confirmation} /></label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="dialog-actions"><button className="secondary-button" disabled={pending} onClick={close} type="button">取消</button><button className="delete-button" disabled={pending || confirmation !== "DELETE"} type="submit">{pending ? "正在永久刪除…" : "永久刪除帳號"}</button></div>
      </form>
    </ModalDialog>
  </section>;
}

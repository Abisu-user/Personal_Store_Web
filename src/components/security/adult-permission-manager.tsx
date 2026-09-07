"use client";

import { useEffect, useState } from "react";

type Account = {
  userId: string;
  email: string;
  username: string | null;
  displayName: string | null;
  adultContentAccess: boolean;
  adultContentAdmin: boolean;
};

async function request<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "操作失敗，請稍後再試。");
  return payload as T;
}

export function AdultPermissionManager() {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setMessage(null);
      try {
        const result = await request<{ accounts: Account[] }>(`/api/security/adult-access?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        setAccounts(result.accounts);
      } catch (cause) {
        if (!controller.signal.aborted) setMessage(cause instanceof Error ? cause.message : "目前無法搜尋帳戶。");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  async function updateAccess(account: Account) {
    setPendingId(account.userId); setMessage(null);
    try {
      const nextAccess = !account.adultContentAccess;
      await request("/api/security/adult-access", { method: "PATCH", body: JSON.stringify({ userId: account.userId, adultContentAccess: nextAccess }) });
      setAccounts((current) => current.map((item) => item.userId === account.userId ? { ...item, adultContentAccess: nextAccess } : item));
      setMessage(nextAccess ? "已允許此帳戶使用成人功能。" : "已取消此帳戶的成人功能權限。");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "無法更新成人功能權限。"); }
    finally { setPendingId(null); }
  }

  return <section className="passkey-settings adult-permission-manager">
    <div><p className="eyebrow">ADULT ACCESS CONTROL</p><h2>成人功能存取管理</h2><p>只有經管理員明確允許的帳戶，才能看到並使用動漫收藏的成人內容。</p></div>
    <label>搜尋帳戶<input onChange={(event) => setQuery(event.target.value)} placeholder="輸入名稱或 Email" type="search" value={query} /></label>
    <div className="adult-account-list" aria-busy={loading}>
      {loading ? <p className="adult-account-empty">正在搜尋帳戶…</p> : accounts.length ? accounts.map((account) => <article key={account.userId}>
        <div><strong>{account.displayName || account.username || account.email}</strong><span>{account.email}</span><div className="adult-permission-badges">{account.adultContentAdmin && <small>成人功能管理員</small>}<small className={account.adultContentAccess ? "allowed" : "denied"}>{account.adultContentAccess ? "已允許" : "未允許"}</small></div></div>
        <button className={account.adultContentAccess ? "secondary-button compact" : "button compact"} disabled={account.adultContentAdmin || pendingId === account.userId} onClick={() => void updateAccess(account)} type="button">{pendingId === account.userId ? "處理中…" : account.adultContentAdmin ? "管理員" : account.adultContentAccess ? "取消允許" : "允許存取"}</button>
      </article>) : <p className="adult-account-empty">找不到符合的帳戶。</p>}
    </div>
    {message && <p className="notice" role="status">{message}</p>}
  </section>;
}

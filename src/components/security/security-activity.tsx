"use client";

import { useCallback, useEffect, useState } from "react";

type Session = { id: string; label: string; lastSeenAt: string; createdAt: string; revokedAt: string | null; current: boolean };
type Event = { id: number; action: string; metadata: Record<string, unknown>; occurred_at: string };
type Activity = { sessions: Session[]; events: Event[] };

function displayTime(value: string) { return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function eventLabel(action: string) { return action === "session_observed" ? "偵測到新的工作階段" : action === "other_sessions_revoked" ? "已登出其他工作階段" : action; }

export function SecurityActivity() {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/security/activity", { cache: "no-store" });
    if (!response.ok) { setError("目前無法讀取安全紀錄。"); return; }
    setActivity(await response.json() as Activity);
  }, []);
  useEffect(() => { void fetch("/api/security/activity", { method: "POST" }).finally(() => { void load(); }); }, [load]);
  async function signOutOthers() {
    setPending(true); setError(null);
    const response = await fetch("/api/security/sign-out-others", { method: "POST" });
    setPending(false);
    if (!response.ok) { setError("無法登出其他工作階段，請稍後再試。"); return; }
    await load();
  }
  if (!activity && !error) return <p className="lead">正在讀取安全活動…</p>;
  return <section className="security-activity">{error && <p className="notice error" role="alert">{error}</p>}<div className="security-heading"><div><h2>已知裝置</h2><p>裝置名稱來自瀏覽器資訊；IP 僅以雜湊形式儲存。</p></div><button className="button secondary" disabled={pending} onClick={signOutOthers} type="button">{pending ? "處理中…" : "登出其他裝置"}</button></div><div className="activity-list">{activity?.sessions.map((session) => <article className="activity-row" key={session.id}><div><strong>{session.label}{session.current ? "（目前裝置）" : ""}</strong><span>{session.revokedAt ? `已撤銷：${displayTime(session.revokedAt)}` : `最後活動：${displayTime(session.lastSeenAt)}`}</span></div><span className={session.revokedAt ? "status revoked" : "status active"}>{session.revokedAt ? "已登出" : "啟用中"}</span></article>)}</div><div className="security-heading"><div><h2>安全紀錄</h2><p>只記錄服務端確認的工作階段安全事件。</p></div></div><div className="activity-list">{activity?.events.map((event) => <article className="activity-row" key={event.id}><div><strong>{eventLabel(event.action)}</strong><span>{displayTime(event.occurred_at)}</span></div></article>)}</div></section>;
}

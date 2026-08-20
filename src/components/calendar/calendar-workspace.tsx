"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import type { CalendarEvent, CalendarWorkspaceData } from "@/lib/calendar/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const colors = ["indigo", "blue", "green", "amber", "rose"] as const;
type Color = (typeof colors)[number];
type Draft = { title: string; description: string; startsAt: string; endsAt: string; color: Color };

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function toInputValue(value: Date | string) { const date = new Date(value); const pad = (number: number) => String(number).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function dateLabel(value: string) { return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T00:00:00`)); }
function timeLabel(value: string) { return new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }
function makeDraft(day = new Date()): Draft { const start = new Date(day); start.setHours(9, 0, 0, 0); return { title: "", description: "", startsAt: toInputValue(start), endsAt: "", color: "indigo" }; }
function toDraft(event: CalendarEvent): Draft { return { title: event.title, description: event.description ?? "", startsAt: toInputValue(event.startsAt), endsAt: event.endsAt ? toInputValue(event.endsAt) : "", color: event.color }; }

export function CalendarWorkspace({ initialData }: { initialData: CalendarWorkspaceData }) {
  const [data, setData] = useState(initialData);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => dateKey(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => makeDraft());
  const [pending, setPending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/calendar", { cache: "no-store" });
    if (!response.ok) throw new Error("目前無法讀取日曆。");
    setData(await response.json() as CalendarWorkspaceData);
  }, []);

  const eventsByDay = useMemo(() => {
    const result = new Map<string, CalendarEvent[]>();
    for (const event of data.events) {
      const key = dateKey(new Date(event.startsAt));
      result.set(key, [...(result.get(key) ?? []), event]);
    }
    return result;
  }, [data.events]);
  const selectedEvents = eventsByDay.get(selectedDay) ?? [];
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  }, [month]);
  const monthLabel = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long" }).format(month);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const startNew = (day = selectedDay) => { const next = new Date(`${day}T00:00:00`); setSelectedId(null); setConfirmDelete(false); setDraft(makeDraft(next)); setNotice(null); };
  const selectEvent = (event: CalendarEvent) => { setSelectedId(event.id); setConfirmDelete(false); setDraft(toDraft(event)); setSelectedDay(dateKey(new Date(event.startsAt))); setNotice(null); };

  async function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault(); setPending(true); setNotice(null);
    const payload = { ...draft, startsAt: new Date(draft.startsAt).toISOString(), endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null };
    try {
      const response = await fetch("/api/calendar", { method: selectedId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(selectedId ? { ...payload, id: selectedId } : payload) });
      const responseData = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseData?.error ?? "無法儲存行程。");
      await load(); setNotice(selectedId ? "行程已更新。" : "行程已新增。");
      if (!selectedId) startNew(dateKey(new Date(payload.startsAt)));
    } catch (error) { setNotice(error instanceof Error ? error.message : "無法儲存行程。"); }
    finally { setPending(false); }
  }

  async function remove() {
    if (!selectedId) return;
    setPending(true); setNotice(null);
    try {
      const response = await fetch("/api/calendar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selectedId }) });
      const responseData = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseData?.error ?? "無法刪除行程。");
      await load(); startNew(); setNotice("行程已刪除。");
    } catch (error) { setNotice(error instanceof Error ? error.message : "無法刪除行程。"); }
    finally { setPending(false); }
  }

  return <section className="calendar-workspace">
    {notice && <p className="notice" role="status">{notice}</p>}
    <section className="calendar-panel"><div className="calendar-toolbar"><div><p className="eyebrow">PRIVATE CALENDAR</p><h2>{monthLabel}</h2></div><div className="calendar-nav"><button aria-label="上個月" className="secondary-button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} type="button">‹</button><button className="secondary-button" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} type="button">今天</button><button aria-label="下個月" className="secondary-button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} type="button">›</button></div></div><div className="calendar-weekdays">{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{days.map((day) => { const key = dateKey(day); const events = eventsByDay.get(key) ?? []; const inMonth = day.getMonth() === month.getMonth(); const isSelected = key === selectedDay; const isToday = key === dateKey(new Date()); return <button className={`calendar-day${inMonth ? "" : " outside"}${isSelected ? " selected" : ""}${isToday ? " today" : ""}`} key={key} onClick={() => { setSelectedDay(key); startNew(key); }} type="button"><span>{day.getDate()}</span><div>{events.slice(0, 3).map((event) => <i className={`calendar-dot ${event.color}`} key={event.id} title={event.title} />)}{events.length > 3 && <small>+{events.length - 3}</small>}</div></button>; })}</div></section>
    <aside className="calendar-side"><section className="calendar-day-events"><div className="notes-list-header"><div><p className="eyebrow">SELECTED DAY</p><h2>{dateLabel(selectedDay)}</h2></div><button className="button compact" onClick={() => startNew()} type="button">＋ 新行程</button></div><div className="calendar-event-list">{selectedEvents.map((event) => <button className={event.id === selectedId ? "calendar-event active" : "calendar-event"} key={event.id} onClick={() => selectEvent(event)} type="button"><i className={`calendar-dot ${event.color}`} /><span><strong>{event.title}</strong><small>{timeLabel(event.startsAt)}{event.endsAt ? ` — ${timeLabel(event.endsAt)}` : ""}</small></span></button>)}{selectedEvents.length === 0 && <p className="lead">這一天還沒有行程。</p>}</div></section><form className="calendar-form" onSubmit={save}><div className="note-editor-heading"><div><p className="eyebrow">{selectedId ? "EDIT EVENT" : "CREATE EVENT"}</p><h2>{selectedId ? "編輯行程" : "新增行程"}</h2></div></div><input aria-label="行程標題" maxLength={300} onChange={(event) => update("title", event.target.value)} placeholder="行程標題" required value={draft.title} /><textarea aria-label="行程說明" maxLength={2000} onChange={(event) => update("description", event.target.value)} placeholder="說明（避免放入密碼、API Key 等敏感資料）" rows={3} value={draft.description} /><label>開始時間<input aria-label="開始時間" onChange={(event) => update("startsAt", event.target.value)} required type="datetime-local" value={draft.startsAt} /></label><label>結束時間（選填）<input aria-label="結束時間" min={draft.startsAt} onChange={(event) => update("endsAt", event.target.value)} type="datetime-local" value={draft.endsAt} /></label><fieldset><legend>顏色</legend><div className="calendar-colors">{colors.map((color) => <button aria-label={`選擇${color}色`} aria-pressed={draft.color === color} className={`color-choice ${color}${draft.color === color ? " active" : ""}`} key={color} onClick={() => update("color", color)} type="button" />)}</div></fieldset><div className="note-editor-actions"><button className="button" disabled={pending} type="submit">{pending ? "儲存中…" : selectedId ? "儲存修改" : "新增行程"}</button>{selectedId && <button className="delete-button" disabled={pending} onClick={() => setConfirmDelete(true)} type="button">刪除行程</button>}</div></form><ConfirmDialog description="這個行程將永久刪除，無法還原。" error={notice?.includes("無法") ? notice : null} onCancel={() => setConfirmDelete(false)} onConfirm={() => { void remove(); }} open={confirmDelete} pending={pending} title="刪除行程？" /></aside>
  </section>;
}

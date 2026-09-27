"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useBackgroundSave } from "@/components/background-save/background-save-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreateFormActions } from "@/components/ui/create-form-actions";
import { CreateItemModal } from "@/components/ui/create-item-modal";
import { calendarDateKey, occurrencesInRange, rangeForMonth } from "@/lib/calendar/recurrence";
import { getTaiwanHolidays, type TaiwanHoliday } from "@/lib/calendar/taiwan-holidays";
import type { CalendarEvent, CalendarOccurrence, CalendarWorkspaceData } from "@/lib/calendar/types";
import styles from "./calendar-mobile.module.css";

const colors = ["indigo", "blue", "green", "amber", "rose"] as const;
type Color = (typeof colors)[number];
type Draft = {
  title: string; description: string; date: string; time: string; endDate: string; endTime: string;
  allDay: boolean; recurrenceType: "none" | "yearly"; color: Color;
};
type Upcoming = { key: string; date: string; title: string; detail: string; kind: "event" | "holiday" | "festival"; event?: CalendarOccurrence };

function parseDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function formatDate(key: string) {
  return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "long" }).format(parseDate(key));
}
function makeDraft(date: string): Draft {
  return { title: "", description: "", date, time: "09:00", endDate: date, endTime: "", allDay: false, recurrenceType: "none", color: "indigo" };
}
function draftFor(event: CalendarOccurrence): Draft {
  const end = event.endsAt ? new Date(event.endsAt) : null;
  const endOffset = end ? Math.round((Date.parse(calendarDateKey(end) + "T12:00:00Z") - Date.parse(event.eventDate + "T12:00:00Z")) / 86_400_000) : 0;
  const occurrenceEnd = parseDate(event.occurrenceDate);
  occurrenceEnd.setDate(occurrenceEnd.getDate() + endOffset);
  return {
    title: event.title, description: event.description ?? "", date: event.occurrenceDate,
    time: event.eventTime?.slice(0, 5) ?? "09:00",
    endDate: calendarDateKey(occurrenceEnd),
    endTime: end && !event.allDay ? String(end.getHours()).padStart(2, "0") + ":" + String(end.getMinutes()).padStart(2, "0") : "",
    allDay: event.allDay, recurrenceType: event.recurrenceType, color: event.color,
  };
}
function eventTime(event: CalendarOccurrence) {
  return event.allDay ? "全天" : event.eventTime?.slice(0, 5) ?? "時間未設定";
}

export function CalendarWorkspace({ initialData }: { initialData: CalendarWorkspaceData }) {
  const backgroundJobs = useBackgroundSave();
  const [data, setData] = useState(initialData);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => calendarDateKey(new Date()));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => makeDraft(calendarDateKey(new Date())));
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const range = useMemo(() => rangeForMonth(month), [month]);
  const rangeLoaded = data.range.from <= range.from && data.range.to >= range.to;

  const loadRange = useCallback(async (from: string, to: string, signal?: AbortSignal) => {
    const response = await fetch("/api/calendar?from=" + from + "&to=" + to, { cache: "no-store", signal });
    if (!response.ok) throw new Error("目前無法讀取日曆。");
    return await response.json() as CalendarWorkspaceData;
  }, []);

  useEffect(() => {
    if (rangeLoaded) return;
    const controller = new AbortController();
    void loadRange(range.from, range.to, controller.signal)
      .then((next) => { setData(next); setNotice(null); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "目前無法讀取日曆。"); })
      .finally(() => { if (!controller.signal.aborted) setFetching(false); });
    return () => controller.abort();
  }, [range.from, range.to, rangeLoaded, loadRange]);

  const occurrences = useMemo(() => occurrencesInRange(data.events, range.from, range.to), [data.events, range.from, range.to]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarOccurrence[]>();
    for (const event of occurrences) map.set(event.occurrenceDate, [...(map.get(event.occurrenceDate) ?? []), event]);
    return map;
  }, [occurrences]);
  const holidays = useMemo(() => getTaiwanHolidays(range.from, range.to), [range.from, range.to]);
  const holidaysByDay = useMemo(() => {
    const map = new Map<string, TaiwanHoliday[]>();
    for (const holiday of holidays) map.set(holiday.date, [...(map.get(holiday.date) ?? []), holiday]);
    return map;
  }, [holidays]);
  const selectedEvents = eventsByDay.get(selectedDay) ?? [];
  const selectedHolidays = holidaysByDay.get(selectedDay) ?? [];
  const selectedAllDay = selectedEvents.filter((event) => event.allDay);
  const selectedTimed = selectedEvents.filter((event) => !event.allDay);
  const todayKey = calendarDateKey(new Date());
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    const count = Math.ceil((first.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: count }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  }, [month]);
  const monthLabel = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "long" }).format(month);
  const monthPrefix = calendarDateKey(month).slice(0, 7);
  const monthHolidays = holidays.filter((holiday) => holiday.date.startsWith(monthPrefix));
  const monthEventCount = occurrences.filter((event) => event.occurrenceDate.startsWith(monthPrefix)).length;
  const monthHolidayCount = new Set(monthHolidays.filter((holiday) => holiday.isHoliday).map((holiday) => holiday.date)).size;

  const upcoming = useMemo(() => {
    const rows: Upcoming[] = [
      ...occurrences.filter((event) => event.occurrenceDate >= selectedDay).map((event) => ({
        key: event.id + ":" + event.occurrenceDate, date: event.occurrenceDate, title: event.title,
        detail: eventTime(event), kind: "event" as const, event,
      })),
      ...holidays.filter((holiday) => holiday.date >= selectedDay).map((holiday) => ({
        key: holiday.date + ":" + holiday.name, date: holiday.date, title: holiday.name,
        detail: holiday.isHoliday ? "放假" : "紀念日", kind: holiday.isHoliday ? "holiday" as const : "festival" as const,
      })),
    ];
    return rows.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "event" ? -1 : 1)).slice(0, 5);
  }, [occurrences, holidays, selectedDay]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const startNew = useCallback((date: string) => {
    setSelectedId(null); setConfirmDelete(false); setDraft(makeDraft(date)); setNotice(null); setEditorOpen(true);
  }, []);
  const selectEvent = (event: CalendarOccurrence) => {
    setSelectedId(event.id); setConfirmDelete(false); setDraft(draftFor(event)); setSelectedDay(event.occurrenceDate); setNotice(null); setEditorOpen(true);
  };
  useEffect(() => {
    const open = () => startNew(selectedDay);
    window.addEventListener("personal-vault:new-item", open);
    return () => window.removeEventListener("personal-vault:new-item", open);
  }, [selectedDay, startNew]);
  const navigate = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setFetching(true);
    setMonth(next); setSelectedDay(calendarDateKey(next));
  };
  const selectDate = (key: string) => {
    setSelectedDay(key);
    const date = parseDate(key);
    if (date.getMonth() !== month.getMonth() || date.getFullYear() !== month.getFullYear()) { setFetching(true); setMonth(new Date(date.getFullYear(), date.getMonth(), 1)); }
  };

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(null);
    const title = draft.title.trim();
    if (!title) { setNotice("請填寫行程名稱。"); return; }
    const startsAt = new Date(draft.date + "T" + (draft.allDay ? "12:00" : draft.time) + ":00").toISOString();
    const endsAt = !draft.allDay && draft.endTime ? new Date(draft.endDate + "T" + draft.endTime + ":00").toISOString() : null;
    if (endsAt && endsAt < startsAt) { setNotice("結束時間必須晚於開始時間。"); return; }
    const id = selectedId ?? crypto.randomUUID();
    const payload = {
      id, title, description: draft.description.trim(), startsAt, endsAt,
      eventDate: draft.date, eventTime: draft.allDay ? null : draft.time,
      allDay: draft.allDay, recurrenceType: draft.recurrenceType, color: draft.color,
    };
    const previousEvent = data.events.find((item) => item.id === id);
    const optimistic: CalendarEvent = {
      id, title, description: payload.description || null, startsAt, endsAt,
      eventDate: draft.date, eventTime: payload.eventTime, allDay: draft.allDay,
      recurrenceType: draft.recurrenceType, color: draft.color, updatedAt: new Date().toISOString(),
    };
    setData((current) => ({ ...current, events: [...current.events.filter((item) => item.id !== id), optimistic] }));
    backgroundJobs.enqueue({
      type: "calendar", title: selectedId ? "更新行程" : "新增行程", operation: selectedId ? "修改行程" : "新增行程",
      page: "/calendar", entityKey: "calendar:" + id,
      request: { url: "/api/calendar", method: selectedId ? "PATCH" : "POST", body: payload },
      persist: false, rollback: () => setData((current) => ({
        ...current,
        events: [...current.events.filter((item) => item.id !== id), ...(previousEvent ? [previousEvent] : [])],
      })),
      onSuccess: () => { setData((current) => ({ ...current, events: [...current.events.filter((item) => item.id !== id), optimistic] })); setNotice(selectedId ? "行程已更新。" : "行程已新增。"); },
      onError: (error) => setNotice(error.message || "無法儲存行程。請從背景儲存佇列重試。"),
    });
    setSelectedDay(draft.date); setMonth(new Date(Number(draft.date.slice(0, 4)), Number(draft.date.slice(5, 7)) - 1, 1));
    setEditorOpen(false);
  }

  function remove() {
    if (!selectedId) return;
    const id = selectedId;
    const previousEvent = data.events.find((event) => event.id === id);
    setData((current) => ({ ...current, events: current.events.filter((event) => event.id !== id) }));
    backgroundJobs.enqueue({
      type: "calendar", title: "刪除行程", operation: "刪除行程", page: "/calendar",
      entityKey: "calendar:" + id, request: { url: "/api/calendar", method: "DELETE", body: { id } },
      persist: false, rollback: () => setData((current) => ({ ...current, events: [...current.events.filter((event) => event.id !== id), ...(previousEvent ? [previousEvent] : [])] })),
      onSuccess: () => { setData((current) => ({ ...current, events: current.events.filter((event) => event.id !== id) })); setNotice("行程已刪除。"); },
      onError: (error) => setNotice(error.message || "無法刪除行程。請從背景儲存佇列重試。"),
    });
    setConfirmDelete(false); setEditorOpen(false); setSelectedId(null);
  }

  return <section className={styles.workspace}>
    <header className={styles.hero}>
      <div><p className={styles.kicker}>CALENDAR</p><h1>私人日曆</h1><p className={styles.heroDescription}>行程、節日與提醒集中在同一個月曆裡；放假日以紅色標示。</p></div>
      <div className={styles.stats}><div><strong>{monthEventCount}</strong><span>本月行程</span></div><div><strong>{monthHolidayCount}</strong><span>本月放假</span></div></div>
    </header>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.layout}>
      <section className={styles.panel} aria-label="月曆">
        <div className={styles.calendarHeader}>
          <div><p className={styles.kicker}>PRIVATE CALENDAR</p><h2>{monthLabel}</h2></div>
          <div className={styles.controls}>
            <button aria-label="上一個月" onClick={() => navigate(-1)} type="button">‹</button>
            <button onClick={() => { const now = new Date(); setFetching(true); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDay(calendarDateKey(now)); }} type="button">今天</button>
            <button aria-label="下一個月" onClick={() => navigate(1)} type="button">›</button>
          </div>
        </div>
        <div className={styles.holidayStrip} aria-label="本月節日">
          {monthHolidays.length ? monthHolidays.map((holiday) =>
            <button className={holiday.isHoliday ? styles.holidayChipOff : styles.holidayChip} key={holiday.date + holiday.name} onClick={() => selectDate(holiday.date)} type="button">
              {Number(holiday.date.slice(8))}日・{holiday.name}{holiday.isHoliday ? "・休" : ""}
            </button>) : <span className={styles.noHoliday}>本月無內建節日</span>}
        </div>
        <div className={styles.weekdays}>{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className={styles.grid} key={monthPrefix}>
          {days.map((day) => {
            const key = calendarDateKey(day);
            const items = eventsByDay.get(key) ?? [];
            const markers = holidaysByDay.get(key) ?? [];
            const off = markers.some((item) => item.isHoliday);
            const isToday = key === todayKey;
            const classes = [styles.day, day.getMonth() !== month.getMonth() ? styles.outside : "", off ? styles.dayOff : "", key === selectedDay ? styles.selected : "", isToday ? styles.today : ""].filter(Boolean).join(" ");
            const tags = [...markers.map((item) => ({ label: item.name, kind: item.isHoliday ? "off" : "festival" })), ...items.map((item) => ({ label: (item.allDay ? "" : eventTime(item) + " ") + item.title, kind: "event" }))];
            const dots = [...(off ? ["off"] : markers.length ? ["festival"] : []), ...items.slice(0, 3).map(() => "event")].slice(0, 3);
            return <button aria-label={formatDate(key) + (off ? "，放假" : "") + (items.length ? "，" + items.length + "個行程" : "")} aria-pressed={key === selectedDay} className={classes} key={key} onClick={() => selectDate(key)} type="button">
              <span className={styles.dayTop}><span className={styles.dayNumber}>{day.getDate()}</span>{off && <small className={styles.rest}>休</small>}</span>
              <span className={styles.dayTags}>{tags.slice(0, 2).map((tag, index) => <span className={tag.kind === "off" ? styles.tagOff : tag.kind === "festival" ? styles.tagFestival : styles.tagEvent} key={tag.kind + index}>{tag.label}</span>)}{tags.length > 2 && <small>+{tags.length - 2} 更多</small>}</span>
              <span className={styles.dayDots}>{dots.map((dot, index) => <i className={dot === "off" ? styles.dotOff : dot === "festival" ? styles.dotFestival : styles.dotEvent} key={dot + index} />)}</span>
            </button>;
          })}
        </div>
        {fetching && !rangeLoaded && <p className={styles.loading} role="status">正在更新行程…</p>}
      </section>
      <aside className={styles.side}>
        <section className={[styles.panel, styles.selectedPanel].join(" ")}>
          <div className={styles.grabber} aria-hidden="true" />
          <div className={styles.selectedHead}>
            <div><p className={styles.kicker}>SELECTED DAY</p><h2>{formatDate(selectedDay)}</h2><p className={styles.selectedMeta}>{selectedDay === todayKey ? "今天・" : ""}{selectedHolidays.length} 個節日・{selectedEvents.length} 個行程</p></div>
            <button className={styles.addButton} onClick={() => startNew(selectedDay)} type="button">＋ 新行程</button>
          </div>
          {selectedHolidays.length > 0 && <div className={styles.holidayNotes}>{selectedHolidays.map((holiday) => <div className={holiday.isHoliday ? styles.holidayNoteOff : styles.holidayNote} key={holiday.date + holiday.name}>{holiday.isHoliday ? "休・" : ""}{holiday.name}</div>)}</div>}
          <h3 className={styles.sectionTitle}>當日行程</h3>
          {selectedEvents.length === 0 && <p className={styles.empty}>今天沒有私人行程。可以新增行程，或選擇其他日期。</p>}
          <div className={styles.timeline}>
            {selectedAllDay.map((event) => <button className={styles.timelineEvent} key={event.id} onClick={() => selectEvent(event)} type="button"><time>全天</time><i /><span><strong>{event.title}</strong><small>{event.recurrenceType === "yearly" ? "每年重複" : "私人行程"}</small></span></button>)}
            {Array.from(new Set(["09:00", "12:00", "14:00", "18:00", "21:00", ...selectedTimed.map((event) => eventTime(event))])).sort().map((time) => {
              const matching = selectedTimed.filter((event) => eventTime(event) === time);
              return <div className={matching.length ? styles.timelineSlot : styles.timelineEmptySlot} key={time}><time>{time}</time><div className={styles.timelineRail} /><div className={styles.timelineItems}>{matching.map((event) => <button className={styles.timelineDetail} key={event.id} onClick={() => selectEvent(event)} type="button"><strong>{event.title}</strong><small>{event.recurrenceType === "yearly" ? "每年重複" : "私人行程"}{event.description ? "・" + event.description : ""}</small></button>)}</div></div>;
            })}
          </div>
        </section>
        <section className={[styles.panel, styles.upcomingPanel].join(" ")}><h3 className={styles.sectionTitle}>接下來</h3>
          {upcoming.length ? <div className={styles.upcomingList}>{upcoming.map((item) => <button className={styles.upcomingRow} key={item.key} onClick={() => { selectDate(item.date); if (item.event) selectEvent(item.event); }} type="button"><time>{Number(item.date.slice(5, 7))}/{Number(item.date.slice(8))}</time><span><strong>{item.title}</strong><small>{item.detail}</small></span><em className={item.kind === "holiday" ? styles.upcomingOff : item.kind === "festival" ? styles.upcomingFestival : styles.upcomingEvent}>{item.kind === "holiday" ? "放假" : item.kind === "festival" ? "節日" : "行程"}</em></button>)}</div> : <p className={styles.empty}>目前沒有接下來的行程或節日。</p>}
        </section>
      </aside>
    </div>
    <CreateItemModal className={styles.editorDialog} open={editorOpen} pending={false} title={selectedId ? "編輯行程" : "新增行程"} onClose={() => setEditorOpen(false)}>
      <form className={styles.form} onSubmit={save}>
        <label>行程名稱<input maxLength={300} onChange={(event) => update("title", event.target.value)} placeholder="例如：專題討論" required value={draft.title} /></label>
        <div className={styles.formRow}><label>日期<input onChange={(event) => update("date", event.target.value)} required type="date" value={draft.date} /></label><label className={styles.allDayControl}><input checked={draft.allDay} onChange={(event) => update("allDay", event.target.checked)} type="checkbox" />全天</label></div>
        {!draft.allDay && <><div className={styles.formRow}><label>開始時間<input onChange={(event) => update("time", event.target.value)} required type="time" value={draft.time} /></label><label>結束時間（選填）<input onChange={(event) => update("endTime", event.target.value)} type="time" value={draft.endTime} /></label></div>{draft.endTime && <label>結束日期（跨日行程）<input min={draft.date} onChange={(event) => update("endDate", event.target.value)} required type="date" value={draft.endDate} /></label>}</>}
        <label>重複<select onChange={(event) => update("recurrenceType", event.target.value as Draft["recurrenceType"])} value={draft.recurrenceType}><option value="none">不重複</option><option value="yearly">每年</option></select></label>
        <label>備註（選填）<textarea maxLength={2000} onChange={(event) => update("description", event.target.value)} placeholder="請勿放入密碼、金鑰或 Recovery Code" rows={3} value={draft.description} /></label>
        <fieldset><legend>顏色</legend><div className={styles.colorChoices}>{colors.map((color) => <button aria-label={"選擇" + color + "色"} aria-pressed={draft.color === color} className={[styles.colorChoice, styles["color_" + color], draft.color === color ? styles.colorActive : ""].join(" ")} key={color} onClick={() => update("color", color)} type="button" />)}</div></fieldset>
        <CreateFormActions pending={false} label={selectedId ? "儲存修改" : "新增行程"} pendingLabel="儲存中…" />
        {selectedId && <button className={styles.deleteButton} onClick={() => setConfirmDelete(true)} type="button">{draft.recurrenceType === "yearly" ? "刪除每年重複行程" : "刪除行程"}</button>}
      </form>
    </CreateItemModal>
    <ConfirmDialog description={draft.recurrenceType === "yearly" ? "這是每年重複的行程，刪除後每一年都不會再顯示。" : "這個行程將永久刪除，無法還原。"} onCancel={() => setConfirmDelete(false)} onConfirm={remove} open={confirmDelete} pending={false} title="刪除行程？" />
  </section>;
}

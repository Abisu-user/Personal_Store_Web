"use client";

import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBackgroundSave } from "@/components/background-save/background-save-provider";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CreateFormActions } from "@/components/ui/create-form-actions";
import { CreateItemModal } from "@/components/ui/create-item-modal";
import { MobileOptionSheet, type MobileOptionGroup } from "@/components/ui/mobile-option-sheet";
import { CalendarNotificationSettings } from "@/components/calendar/calendar-notifications";
import { calendarDateKey, isValidDateKey, occurrencesInRange, rangeForMonth } from "@/lib/calendar/recurrence";
import { defaultEventColor, eventColorContrast, eventColorPresets, isHexEventColor, normalizeEventColor } from "@/lib/calendar/event-color";
import type { CalendarEvent, CalendarOccurrence, CalendarWorkspaceData, TaiwanCalendarDay } from "@/lib/calendar/types";
import styles from "./calendar-mobile.module.css";

type Draft = {
  title: string; description: string; date: string; time: string; endDate: string; endTime: string;
  allDay: boolean; recurrenceType: CalendarEvent["recurrenceType"]; color: string;
  reminders: number[]; allDayReminderTime: string; timeZone: string;
};
const reminderPresets = [
  { value: 0, label: "行程開始時" }, { value: 5, label: "提前 5 分鐘" },
  { value: 10, label: "提前 10 分鐘" }, { value: 15, label: "提前 15 分鐘" },
  { value: 30, label: "提前 30 分鐘" }, { value: 60, label: "提前 1 小時" },
  { value: 120, label: "提前 2 小時" }, { value: 180, label: "提前 3 小時" },
  { value: 1440, label: "提前 1 天" }, { value: 2880, label: "提前 2 天" },
  { value: 4320, label: "提前 3 天" },
];
const reminderGroups: MobileOptionGroup[] = [
  { label: "常用", options: reminderPresets.slice(0, 5).map(({ value, label }) => ({ value: String(value), label })) },
  { label: "小時", options: reminderPresets.slice(5, 8).map(({ value, label }) => ({ value: String(value), label })) },
  { label: "天", options: reminderPresets.slice(8).map(({ value, label }) => ({ value: String(value), label })) },
];
const recurrenceGroups: MobileOptionGroup[] = [{ label: "重複方式", options: [
  { value: "none", label: "不重複" }, { value: "daily", label: "每天" },
  { value: "weekly", label: "每週" }, { value: "yearly", label: "每年" },
] }];
function reminderLabel(minutes: number) {
  return reminderPresets.find((item) => item.value === minutes)?.label ??
    (minutes % 1440 === 0 ? `提前 ${minutes / 1440} 天` : minutes % 60 === 0 ? `提前 ${minutes / 60} 小時` : `提前 ${minutes} 分鐘`);
}
function recurrenceLabel(type: CalendarEvent["recurrenceType"]) {
  return ({ none: "私人行程", daily: "每天重複", weekly: "每週重複", yearly: "每年重複" })[type];
}
type Upcoming = { key: string; date: string; title: string; detail: string; kind: "event" | "holiday" | "festival"; event?: CalendarOccurrence };

function parseDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function formatDate(key: string) {
  return new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "long" }).format(parseDate(key));
}
function makeDraft(date: string): Draft {
  return { title: "", description: "", date, time: "09:00", endDate: date, endTime: "", allDay: false, recurrenceType: "none", color: defaultEventColor, reminders: [], allDayReminderTime: "09:00", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei" };
}
function draftFor(event: CalendarOccurrence): Draft {
  const end = event.endsAt ? new Date(event.endsAt) : null;
  const endOffset = end ? Math.round((Date.parse(calendarDateKey(end) + "T12:00:00Z") - Date.parse(event.eventDate + "T12:00:00Z")) / 86_400_000) : 0;
  const occurrenceEnd = parseDate(event.eventDate);
  occurrenceEnd.setDate(occurrenceEnd.getDate() + endOffset);
  return {
    title: event.title, description: event.description ?? "", date: event.eventDate,
    time: event.eventTime?.slice(0, 5) ?? "09:00",
    endDate: calendarDateKey(occurrenceEnd),
    endTime: end && !event.allDay ? String(end.getHours()).padStart(2, "0") + ":" + String(end.getMinutes()).padStart(2, "0") : "",
    allDay: event.allDay, recurrenceType: event.recurrenceType, color: normalizeEventColor(event.color),
    reminders: event.reminders, allDayReminderTime: event.allDayReminderTime, timeZone: event.timeZone,
  };
}
function eventTime(event: CalendarOccurrence) {
  return event.allDay ? "全天" : event.eventTime?.slice(0, 5) ?? "時間未設定";
}
function eventStyle(color: string): CSSProperties {
  return { "--event-color": normalizeEventColor(color), "--event-ink": eventColorContrast(color) } as CSSProperties;
}
function dayLabels(day: TaiwanCalendarDay | undefined) {
  if (!day) return [];
  return [
    ...(day.holidayName ? [{ label: day.holidayName, kind: "off" as const }] : []),
    ...(day.festivalName ? [{ label: day.festivalName, kind: "festival" as const }] : []),
  ];
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
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [reminderChoice, setReminderChoice] = useState("");
  const [mobilePicker, setMobilePicker] = useState<"recurrence" | "reminders" | null>(null);
  const [pickerReminders, setPickerReminders] = useState<number[]>([]);
  const [pickerRecurrence, setPickerRecurrence] = useState<Draft["recurrenceType"]>("none");
  const [pickerCustomOpen, setPickerCustomOpen] = useState(false);
  const [pickerError, setPickerError] = useState("");
  const pickerTrigger = useRef<HTMLButtonElement | null>(null);
  const [customReminderValue, setCustomReminderValue] = useState(1);
  const [customReminderUnit, setCustomReminderUnit] = useState<"minute" | "hour" | "day">("hour");
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
  const calendarDaysByDate = useMemo(() => new Map((data.calendarDays ?? []).map((day) => [day.date, day])), [data.calendarDays]);
  const selectedEvents = eventsByDay.get(selectedDay) ?? [];
  const selectedCalendarDay = calendarDaysByDate.get(selectedDay);
  const selectedHolidays = dayLabels(selectedCalendarDay);
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
  const monthHolidays = (data.calendarDays ?? []).filter((day) => day.date.startsWith(monthPrefix) && (day.holidayName || day.festivalName));
  const monthOfficialAvailable = (data.calendarDays ?? []).some((day) => day.date.startsWith(monthPrefix) && day.officialAvailable);
  const monthEventCount = occurrences.filter((event) => event.occurrenceDate.startsWith(monthPrefix)).length;
  const monthHolidayCount = (data.calendarDays ?? []).filter((day) => day.date.startsWith(monthPrefix) && day.isConnectedHoliday).length;

  const upcoming = useMemo(() => {
    const rows: Upcoming[] = [
      ...occurrences.filter((event) => event.occurrenceDate >= selectedDay).map((event) => ({
        key: event.id + ":" + event.occurrenceDate, date: event.occurrenceDate, title: event.title,
        detail: eventTime(event), kind: "event" as const, event,
      })),
      ...(data.calendarDays ?? []).filter((day) => day.date >= selectedDay).flatMap((day) => dayLabels(day).map((label) => ({
        key: day.date + ":" + label.label, date: day.date, title: label.label,
        detail: day.isDayOff ? "放假" : "紀念日", kind: label.kind === "off" ? "holiday" as const : "festival" as const,
      }))),
    ];
    return rows.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "event" ? -1 : 1)).slice(0, 5);
  }, [occurrences, data.calendarDays, selectedDay]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const openReminderPicker = () => {
    setPickerReminders([...draft.reminders]); setPickerCustomOpen(false); setPickerError(""); setMobilePicker("reminders");
  };
  const togglePickerReminder = (value: string) => {
    const minutes = Number(value);
    if (pickerReminders.includes(minutes)) setPickerReminders((current) => current.filter((item) => item !== minutes));
    else if (pickerReminders.length < 12) setPickerReminders((current) => [...current, minutes]);
    else { setPickerError("最多可設定 12 個提醒。"); return; }
    setPickerError("");
  };
  const addCustomPickerReminder = () => {
    const max = { minute: 1440, hour: 168, day: 30 }[customReminderUnit];
    if (!Number.isInteger(customReminderValue) || customReminderValue < 1 || customReminderValue > max) {
      setPickerError(`自訂${{ minute: "分鐘", hour: "小時", day: "天" }[customReminderUnit]}須介於 1～${max}。`); return;
    }
    const minutes = customReminderValue * { minute: 1, hour: 60, day: 1440 }[customReminderUnit];
    if (pickerReminders.includes(minutes)) { setPickerError("此提醒時間已選取。"); return; }
    if (pickerReminders.length >= 12) { setPickerError("最多可設定 12 個提醒。"); return; }
    setPickerReminders((current) => [...current, minutes]); setPickerCustomOpen(false); setPickerError("");
  };
  const startNew = useCallback((date: string) => {
    setSelectedId(null); setConfirmDelete(false); setDraft(makeDraft(date)); setCustomColorOpen(false); setReminderChoice(""); setMobilePicker(null); setNotice(null); setEditorOpen(true);
  }, []);
  const selectEvent = (event: CalendarOccurrence) => {
    setSelectedId(event.id); setConfirmDelete(false); setDraft(draftFor(event)); setCustomColorOpen(!eventColorPresets.some((preset) => preset.value === normalizeEventColor(event.color))); setReminderChoice(""); setMobilePicker(null); setSelectedDay(event.occurrenceDate); setNotice(null); setEditorOpen(true);
  };
  useEffect(() => {
    const open = () => startNew(selectedDay);
    window.addEventListener("personal-vault:new-item", open);
    return () => window.removeEventListener("personal-vault:new-item", open);
  }, [selectedDay, startNew]);
  useEffect(() => {
    const date = new URLSearchParams(window.location.search).get("date");
    if (!date || !isValidDateKey(date)) return;
    const frame = window.requestAnimationFrame(() => {
      setSelectedDay(date);
      setMonth(new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, 1));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
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
    if (!isHexEventColor(draft.color)) { setNotice("請輸入完整的六位 Hex 顏色。"); return; }
    const startsAt = new Date(draft.date + "T" + (draft.allDay ? "12:00" : draft.time) + ":00").toISOString();
    const endsAt = !draft.allDay && draft.endTime ? new Date(draft.endDate + "T" + draft.endTime + ":00").toISOString() : null;
    if (endsAt && endsAt < startsAt) { setNotice("結束時間必須晚於開始時間。"); return; }
    const id = selectedId ?? crypto.randomUUID();
    const payload = {
      id, title, description: draft.description.trim(), startsAt, endsAt,
      eventDate: draft.date, eventTime: draft.allDay ? null : draft.time,
      allDay: draft.allDay, recurrenceType: draft.recurrenceType, color: draft.color,
      reminders: draft.reminders, allDayReminderTime: draft.allDayReminderTime, timeZone: draft.timeZone,
    };
    const previousEvent = data.events.find((item) => item.id === id);
    const optimistic: CalendarEvent = {
      id, title, description: payload.description || null, startsAt, endsAt,
      eventDate: draft.date, eventTime: payload.eventTime, allDay: draft.allDay,
      recurrenceType: draft.recurrenceType, color: draft.color, updatedAt: new Date().toISOString(),
      reminders: draft.reminders, allDayReminderTime: draft.allDayReminderTime, timeZone: draft.timeZone,
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
      onSuccess: () => { setData((current) => ({ ...current, events: [...current.events.filter((item) => item.id !== id), optimistic] })); setNotice(selectedId ? "行程已更新。" : "行程已新增。"); if (draft.reminders.length && typeof Notification !== "undefined" && Notification.permission === "default") setNotificationOpen(true); },
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
      <div className={styles.stats}><div><strong>{monthEventCount}</strong><span>本月行程</span></div><div><strong>{monthOfficialAvailable ? monthHolidayCount : "—"}</strong><span>本月放假</span></div></div>
    </header>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.layout}>
      <section className={styles.panel} aria-label="月曆">
        <div className={styles.calendarHeader}>
          <div><p className={styles.kicker}>PRIVATE CALENDAR</p><h2>{monthLabel}</h2></div>
          <div className={styles.controls}>
            <button aria-label="行程通知設定" onClick={() => setNotificationOpen(true)} type="button">🔔</button>
            <button aria-label="上一個月" onClick={() => navigate(-1)} type="button">‹</button>
            <button onClick={() => { const now = new Date(); setFetching(true); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setSelectedDay(calendarDateKey(now)); }} type="button">今天</button>
            <button aria-label="下一個月" onClick={() => navigate(1)} type="button">›</button>
          </div>
        </div>
        <div className={styles.holidayStrip} aria-label="本月節日">
          {monthHolidays.length ? monthHolidays.flatMap((day) => dayLabels(day).map((label) =>
            <button className={label.kind === "off" ? styles.holidayChipOff : styles.holidayChip} key={day.date + label.label} onClick={() => selectDate(day.date)} type="button">
              {Number(day.date.slice(8))}日・{label.label}{day.isConnectedHoliday ? "・休" : ""}
            </button>)) : <span className={styles.noHoliday}>{monthOfficialAvailable ? "本月無節日資訊" : "官方休假資料尚未公布"}</span>}
          {!monthOfficialAvailable && monthHolidays.length > 0 && <span className={styles.noHoliday}>官方休假資料尚未公布</span>}
        </div>
        <div className={styles.weekdays}>{["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className={styles.grid} key={monthPrefix}>
          {days.map((day) => {
            const key = calendarDateKey(day);
            const items = eventsByDay.get(key) ?? [];
            const calendarDay = calendarDaysByDate.get(key);
            const markers = dayLabels(calendarDay);
            const off = calendarDay?.isConnectedHoliday ?? false;
            const isToday = key === todayKey;
            const classes = [styles.day, day.getMonth() !== month.getMonth() ? styles.outside : "", off ? styles.dayOff : "", key === selectedDay ? styles.selected : "", isToday ? styles.today : ""].filter(Boolean).join(" ");
            const tags = [...markers, ...items.map((item) => ({ label: (item.allDay ? "" : eventTime(item) + " ") + item.title, kind: "event" as const, color: item.color }))];
            const dots = [...(off ? [{ kind: "off" as const }] : []), ...(calendarDay?.festivalName ? [{ kind: "festival" as const }] : []), ...items.map((item) => ({ kind: "event" as const, color: item.color }))].slice(0, 3);
            return <button aria-label={formatDate(key) + (off ? "，放假" : "") + (items.length ? "，" + items.length + "個行程" : "")} aria-pressed={key === selectedDay} className={classes} key={key} onClick={() => selectDate(key)} type="button">
              <span className={styles.dayTop}><span className={styles.dayNumber}>{day.getDate()}</span>{off && <small className={styles.rest}>休</small>}</span>
              <span className={styles.dayTags}>{tags.slice(0, 2).map((tag, index) => <span className={tag.kind === "off" ? styles.tagOff : tag.kind === "festival" ? styles.tagFestival : styles.tagEvent} key={tag.kind + index} style={tag.kind === "event" ? eventStyle(tag.color) : undefined}>{tag.label}</span>)}{tags.length > 2 && <small>+{tags.length - 2} 更多</small>}</span>
              <span className={styles.dayDots}>{dots.map((dot, index) => <i className={dot.kind === "off" ? styles.dotOff : dot.kind === "festival" ? styles.dotFestival : styles.dotEvent} key={dot.kind + index} style={dot.kind === "event" ? eventStyle(dot.color) : undefined} />)}</span>
            </button>;
          })}
        </div>
        {fetching && !rangeLoaded && <p className={styles.loading} role="status">正在更新行程…</p>}
      </section>
      <aside className={styles.side}>
        <section className={[styles.panel, styles.selectedPanel].join(" ")}>
          <div className={styles.grabber} aria-hidden="true" />
          <div className={styles.selectedHead}>
            <div><p className={styles.kicker}>SELECTED DAY</p><h2>{formatDate(selectedDay)}</h2><p className={styles.selectedMeta}>{selectedDay === todayKey ? "今天・" : ""}{selectedCalendarDay?.isConnectedHoliday ? "休・" : ""}{selectedHolidays.length} 個節日・{selectedEvents.length} 個行程</p></div>
            <button className={styles.addButton} onClick={() => startNew(selectedDay)} type="button">＋ 新行程</button>
          </div>
          {selectedHolidays.length > 0 && <div className={styles.holidayNotes}>{selectedHolidays.map((holiday) => <div className={holiday.kind === "off" ? styles.holidayNoteOff : styles.holidayNote} key={holiday.label}>{holiday.kind === "off" ? "休・" : ""}{holiday.label}</div>)}</div>}
          <h3 className={styles.sectionTitle}>當日行程</h3>
          {selectedEvents.length === 0 && <p className={styles.empty}>今天沒有私人行程。可以新增行程，或選擇其他日期。</p>}
          <div className={styles.timeline}>
            {selectedAllDay.map((event) => <button className={styles.timelineEvent} key={event.id} onClick={() => selectEvent(event)} style={eventStyle(event.color)} type="button"><time>全天</time><i /><span><strong>{event.title}</strong><small>{recurrenceLabel(event.recurrenceType)}</small></span></button>)}
            {Array.from(new Set(["09:00", "12:00", "14:00", "18:00", "21:00", ...selectedTimed.map((event) => eventTime(event))])).sort().map((time) => {
              const matching = selectedTimed.filter((event) => eventTime(event) === time);
              return <div className={matching.length ? styles.timelineSlot : styles.timelineEmptySlot} key={time}><time>{time}</time><div className={styles.timelineRail} /><div className={styles.timelineItems}>{matching.map((event) => <button className={styles.timelineDetail} key={event.id} onClick={() => selectEvent(event)} style={eventStyle(event.color)} type="button"><strong>{event.title}</strong><small>{recurrenceLabel(event.recurrenceType)}{event.description ? "・" + event.description : ""}</small></button>)}</div></div>;
            })}
          </div>
        </section>
        <section className={[styles.panel, styles.upcomingPanel].join(" ")}><h3 className={styles.sectionTitle}>接下來</h3>
          {upcoming.length ? <div className={styles.upcomingList}>{upcoming.map((item) => <button className={styles.upcomingRow} key={item.key} onClick={() => { selectDate(item.date); if (item.event) selectEvent(item.event); }} style={item.event ? eventStyle(item.event.color) : undefined} type="button"><time>{Number(item.date.slice(5, 7))}/{Number(item.date.slice(8))}</time><span><strong>{item.title}</strong><small>{item.detail}</small></span><em className={item.kind === "holiday" ? styles.upcomingOff : item.kind === "festival" ? styles.upcomingFestival : styles.upcomingEvent}>{item.kind === "holiday" ? "放假" : item.kind === "festival" ? "節日" : "行程"}</em></button>)}</div> : <p className={styles.empty}>目前沒有接下來的行程或節日。</p>}
        </section>
      </aside>
    </div>
    <CreateItemModal className={styles.editorDialog} dirtyKey={JSON.stringify(draft)} open={editorOpen} pending={mobilePicker !== null} title={selectedId ? "編輯行程" : "新增行程"} onClose={() => { setMobilePicker(null); setEditorOpen(false); }}>
      <form className={styles.form} onSubmit={save}>
        <label>行程名稱<input maxLength={300} onChange={(event) => update("title", event.target.value)} placeholder="例如：專題討論" required value={draft.title} /></label>
        <div className={styles.dateSection}><label>日期<input onChange={(event) => update("date", event.target.value)} required type="date" value={draft.date} /></label><label className={styles.allDayControl}><span>全天</span><input checked={draft.allDay} onChange={(event) => update("allDay", event.target.checked)} type="checkbox" /><span aria-hidden="true" className={styles.allDaySwitch} /></label></div>
        {!draft.allDay && <><div className={[styles.formRow, styles.timeRow].join(" ")}><label>開始時間<input onChange={(event) => update("time", event.target.value)} required type="time" value={draft.time} /></label><label>結束時間（選填）<input onChange={(event) => update("endTime", event.target.value)} type="time" value={draft.endTime} /></label></div>{draft.endTime && <label>結束日期（跨日行程）<input min={draft.date} onChange={(event) => update("endDate", event.target.value)} required type="date" value={draft.endDate} /></label>}</>}
        <label className={styles.desktopRecurrence}>重複<select onChange={(event) => update("recurrenceType", event.target.value as Draft["recurrenceType"])} value={draft.recurrenceType}><option value="none">不重複</option><option value="daily">每天</option><option value="weekly">每週</option><option value="yearly">每年</option></select></label>
        <div className={styles.mobileRecurrence}><span>重複</span><button aria-haspopup="dialog" onClick={(event) => { pickerTrigger.current = event.currentTarget; setPickerRecurrence(draft.recurrenceType); setMobilePicker("recurrence"); }} type="button">{recurrenceGroups[0].options.find((option) => option.value === draft.recurrenceType)?.label}<span aria-hidden="true">›</span></button></div>
        <fieldset className={styles.reminderSection}><legend>提醒</legend>
          {draft.reminders.length ? <div className={styles.reminderList}>{[...draft.reminders].sort((a, b) => b - a).map((minutes) => <span className={styles.reminderChip} key={minutes}>🔔 {reminderLabel(minutes)}<button aria-label={`移除${reminderLabel(minutes)}`} onClick={() => update("reminders", draft.reminders.filter((value) => value !== minutes))} type="button">×</button></span>)}</div> : <p className={styles.reminderEmpty}>無提醒</p>}
          <div className={styles.desktopReminderControls}><label>新增提醒<select onChange={(event) => setReminderChoice(event.target.value)} value={reminderChoice}><option value="">選擇提醒時間</option>{reminderPresets.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}<option value="custom">自訂</option></select></label>
            {reminderChoice === "custom" && <div className={styles.customReminder}><input aria-label="自訂提醒數量" min={1} onChange={(event) => setCustomReminderValue(Number(event.target.value))} type="number" value={customReminderValue} /><select aria-label="自訂提醒單位" onChange={(event) => setCustomReminderUnit(event.target.value as typeof customReminderUnit)} value={customReminderUnit}><option value="minute">分鐘</option><option value="hour">小時</option><option value="day">天</option></select><span>前</span></div>}
            <button className={styles.addReminder} disabled={!reminderChoice || draft.reminders.length >= 12} onClick={() => { const max = { minute: 1440, hour: 168, day: 30 }[customReminderUnit]; if (reminderChoice === "custom" && (!Number.isInteger(customReminderValue) || customReminderValue < 1 || customReminderValue > max)) { setNotice(`自訂${{ minute: "分鐘", hour: "小時", day: "天" }[customReminderUnit]}須介於 1～${max}。`); return; } const minutes = reminderChoice === "custom" ? customReminderValue * { minute: 1, hour: 60, day: 1440 }[customReminderUnit] : Number(reminderChoice); update("reminders", [...new Set([...draft.reminders, minutes])].sort((a, b) => b - a)); setReminderChoice(""); setNotice(null); }} type="button">＋ 新增提醒</button>
          </div>
          <button aria-haspopup="dialog" className={[styles.addReminder, styles.mobileAddReminder].join(" ")} onClick={(event) => { pickerTrigger.current = event.currentTarget; openReminderPicker(); }} type="button">＋ 新增提醒</button>
          {draft.allDay && draft.reminders.length > 0 && <label>全天行程提醒時間<input onChange={(event) => update("allDayReminderTime", event.target.value)} type="time" value={draft.allDayReminderTime} /></label>}
        </fieldset>
        <label>備註（選填）<textarea maxLength={2000} onChange={(event) => update("description", event.target.value)} placeholder="請勿放入密碼、金鑰或 Recovery Code" rows={3} value={draft.description} /></label>
        <fieldset><legend>行程顏色</legend>
          <div className={styles.colorChoices}>
            {eventColorPresets.map((preset) => <button aria-label={"選擇" + preset.name + "色"} aria-pressed={draft.color.toUpperCase() === preset.value} className={[styles.colorChoice, draft.color.toUpperCase() === preset.value ? styles.colorActive : ""].join(" ")} key={preset.value} onClick={() => { update("color", preset.value); setCustomColorOpen(false); }} style={{ backgroundColor: preset.value }} title={preset.name} type="button" />)}
            <button aria-expanded={customColorOpen} aria-label="自訂行程顏色" className={[styles.customColorButton, customColorOpen ? styles.colorActive : ""].join(" ")} onClick={() => setCustomColorOpen((open) => !open)} type="button">＋ 自訂</button>
          </div>
          {customColorOpen && <div className={styles.customColorPanel}>
            <label className={styles.colorPickerLabel}>調色盤<input aria-label="開啟行程調色盤" onChange={(event) => update("color", event.target.value.toUpperCase())} type="color" value={isHexEventColor(draft.color) ? draft.color : defaultEventColor} /></label>
            <label className={styles.hexColorLabel}>Hex 色碼<input aria-label="Hex 色碼" maxLength={7} onChange={(event) => update("color", event.target.value.toUpperCase())} placeholder="#6F7AEF" spellCheck={false} value={draft.color} /></label>
            <span aria-hidden="true" className={styles.colorPreview} style={{ backgroundColor: isHexEventColor(draft.color) ? draft.color : defaultEventColor, color: eventColorContrast(draft.color) }}>Aa</span>
          </div>}
        </fieldset>
        {notice && editorOpen && <p className={styles.formError} role="alert">{notice}</p>}
        <CreateFormActions pending={false} label={selectedId ? "儲存修改" : "新增行程"} pendingLabel="儲存中…" />
        {selectedId && <button className={styles.deleteButton} onClick={() => setConfirmDelete(true)} type="button">{draft.recurrenceType === "none" ? "刪除行程" : `刪除${draft.recurrenceType === "daily" ? "每天" : draft.recurrenceType === "weekly" ? "每週" : "每年"}重複行程`}</button>}
      </form>
    </CreateItemModal>
    <MobileOptionSheet
      groups={mobilePicker === "recurrence" ? recurrenceGroups : reminderGroups}
      onClose={() => { setMobilePicker(null); window.requestAnimationFrame(() => pickerTrigger.current?.focus()); }}
      onDone={() => {
        if (mobilePicker === "recurrence") update("recurrenceType", pickerRecurrence);
        else update("reminders", [...new Set(pickerReminders)].sort((a, b) => b - a));
        setNotice(null);
      }}
      onSelect={(value) => mobilePicker === "recurrence" ? setPickerRecurrence(value as Draft["recurrenceType"]) : togglePickerReminder(value)}
      open={editorOpen && mobilePicker !== null}
      selectedValues={mobilePicker === "recurrence" ? [pickerRecurrence] : pickerReminders.map(String)}
      title={mobilePicker === "recurrence" ? "選擇重複方式" : "新增提醒"}
    >
      {mobilePicker === "reminders" && <section className={styles.customPicker}>
        <button aria-expanded={pickerCustomOpen} className={styles.customPickerToggle} onClick={() => { setPickerCustomOpen((open) => !open); setPickerError(""); }} type="button">自訂提醒<span aria-hidden="true">›</span></button>
        {pickerReminders.filter((minutes) => !reminderPresets.some((preset) => preset.value === minutes)).length > 0 && <div className={styles.customPickerSelected}>
          {pickerReminders.filter((minutes) => !reminderPresets.some((preset) => preset.value === minutes)).sort((a, b) => b - a).map((minutes) => <button aria-label={`移除${reminderLabel(minutes)}`} key={minutes} onClick={() => togglePickerReminder(String(minutes))} type="button">✓ {reminderLabel(minutes)} <span aria-hidden="true">×</span></button>)}
        </div>}
        {pickerCustomOpen && <div className={styles.customPickerControls}>
          <label>提前數量<input inputMode="numeric" min={1} onChange={(event) => setCustomReminderValue(Number(event.target.value))} type="number" value={customReminderValue} /></label>
          <div aria-label="提醒單位" className={styles.customPickerUnits} role="group">{(["minute", "hour", "day"] as const).map((unit) => <button aria-pressed={customReminderUnit === unit} key={unit} onClick={() => setCustomReminderUnit(unit)} type="button">{{ minute: "分鐘", hour: "小時", day: "天" }[unit]}</button>)}</div>
          <button className="secondary-button" onClick={addCustomPickerReminder} type="button">加入自訂提醒</button>
        </div>}
        {pickerError && <p className={styles.pickerError} role="alert">{pickerError}</p>}
      </section>}
    </MobileOptionSheet>
    <ConfirmDialog description={draft.recurrenceType === "none" ? "這個行程將永久刪除，無法還原。" : `這是${draft.recurrenceType === "daily" ? "每天" : draft.recurrenceType === "weekly" ? "每週" : "每年"}重複的行程，刪除後整個系列都會被移除。`} onCancel={() => setConfirmDelete(false)} onConfirm={remove} open={confirmDelete} pending={false} title="刪除行程？" />
    <CalendarNotificationSettings onClose={() => setNotificationOpen(false)} open={notificationOpen} />
  </section>;
}

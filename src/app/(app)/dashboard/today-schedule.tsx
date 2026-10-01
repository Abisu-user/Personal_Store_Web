import Link from "next/link";
import type { CSSProperties } from "react";
import type { TodayCalendarSchedule } from "@/lib/calendar/today";
import styles from "./today-schedule.module.css";

export function todayCalendarHref(schedule: TodayCalendarSchedule) {
  return `/calendar?date=${encodeURIComponent(schedule.date)}`;
}

export function TodayScheduleRows({ schedule }: { schedule: TodayCalendarSchedule }) {
  const href = todayCalendarHref(schedule);
  return <div className={styles.list}>
    {schedule.events.map((event) => <Link className={styles.row} href={href} key={event.id} prefetch={false}
      title={`${event.allDay ? "全天" : event.time ?? ""} ${event.title}`}>
      <span aria-hidden="true" className={styles.dot} style={{ "--event-color": event.color } as CSSProperties} />
      <span className={styles.time}>{event.allDay ? "全天" : event.time ?? "—"}</span>
      <span className={styles.title}>{event.title}</span>
    </Link>)}
    {schedule.total > schedule.events.length && <Link className={styles.more} href={href} prefetch={false}>
      ＋{schedule.total - schedule.events.length} 個行程 · 查看全部
    </Link>}
  </div>;
}

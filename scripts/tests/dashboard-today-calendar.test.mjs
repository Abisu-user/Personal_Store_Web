import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

function loadTypeScript(file, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(file), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, AbortSignal, require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, Date, Intl, Map, Number, Object, String });
  return exports;
}

const recurrence = loadTypeScript("src/lib/calendar/recurrence.ts");
const today = loadTypeScript("src/lib/calendar/today.ts", { "./recurrence": recurrence });
const source = (id, eventDate, recurrenceType = "none", overrides = {}) => ({
  id, title: id, color: "#AABBCC", eventDate, eventTime: "09:00:00", allDay: false, recurrenceType, ...overrides,
});

test("empty days and official holidays do not create a private schedule", () => {
  assert.equal(today.summarizeCalendarDay([], "2026-10-01"), null);
  assert.equal(today.summarizeCalendarDay([source("different day", "2026-10-02")], "2026-10-01"), null);
});

test("all-day comes first, timed events sort ascending, and only three are previewed", () => {
  const rows = [source("late", "2026-10-01", "none", { eventTime: "19:30:00" }),
    source("early", "2026-10-01", "none", { eventTime: "08:00:00" }),
    source("all day", "2026-10-01", "none", { allDay: true, eventTime: null, color: "#123456" }),
    source("middle", "2026-10-01", "none", { eventTime: "14:00:00" }),
    source("latest", "2026-10-01", "none", { eventTime: "20:00:00" })];
  const schedule = today.summarizeCalendarDay(rows, "2026-10-01");
  assert.equal(schedule.total, 5);
  assert.deepEqual(Array.from(schedule.events, (event) => event.id), ["all day", "early", "middle"]);
  assert.equal(schedule.events[0].time, null);
  assert.equal(schedule.events[0].color, "#123456");
  assert.equal(schedule.events[1].time, "08:00");
});

test("daily, weekly and yearly events reuse the Calendar occurrence resolver", () => {
  const rows = [source("daily", "2026-09-01", "daily"), source("weekly", "2026-09-04", "weekly"),
    source("birthday", "2025-10-02", "yearly", { allDay: true, eventTime: null })];
  const schedule = today.summarizeCalendarDay(rows, "2026-10-02");
  assert.deepEqual(Array.from(schedule.events, (event) => event.id), ["birthday", "daily", "weekly"]);
  assert.equal(today.summarizeCalendarDay([rows[1]], "2026-10-01"), null);
  assert.equal(today.summarizeCalendarDay([rows[2]], "2027-10-02")?.total, 1);
});

test("edits and removal of the final event are reflected by a fresh summary", () => {
  const original = source("meeting", "2026-10-01", "none", { eventTime: "09:00:00" });
  assert.equal(today.summarizeCalendarDay([original], "2026-10-01")?.events[0].time, "09:00");
  assert.equal(today.summarizeCalendarDay([{ ...original, eventTime: "10:00:00" }], "2026-10-01")?.events[0].time, "10:00");
  assert.equal(today.summarizeCalendarDay([], "2026-10-01"), null);
});

test("today's date is derived from the Calendar/browser zone, not UTC", () => {
  const instant = new Date("2026-09-30T16:30:00Z");
  assert.equal(recurrence.calendarDateKeyInTimeZone(instant, "Asia/Taipei"), "2026-10-01");
  assert.equal(instant.toISOString().slice(0, 10), "2026-09-30");
});

test("dashboard query selects only the owner’s today rows and recurrence rules", async () => {
  const queries = [];
  const rows = [
    { owner_id: "owner-a", id: "private-a", title: "A 的行程", color: "#123456", event_date: "2026-10-01", event_time: "09:00:00", all_day: false, recurrence_type: "none" },
    { owner_id: "owner-b", id: "private-b", title: "B 的行程", color: "#654321", event_date: "2026-10-01", event_time: "10:00:00", all_day: false, recurrence_type: "none" },
  ];
  const dashboard = loadTypeScript("src/lib/calendar/dashboard-today.ts", {
    "server-only": {},
    "@/lib/supabase/admin": { createAdminClient: () => ({ from(table) {
      assert.equal(table, "calendar_events");
      const query = { filters: [], columns: "" };
      queries.push(query);
      const chain = {
        select(columns) { query.columns = columns; return chain; },
        eq(...args) { query.filters.push(["eq", ...args]); return chain; },
        in(...args) { query.filters.push(["in", ...args]); return chain; },
        lte(...args) { query.filters.push(["lte", ...args]); return chain; },
        limit(value) { query.limit = value; return chain; },
        abortSignal() {
          const owner = query.filters.find(([op, key]) => op === "eq" && key === "owner_id")?.[2];
          const type = query.filters.find(([op, key]) => op === "eq" && key === "recurrence_type")?.[2];
          const data = rows.filter((row) => row.owner_id === owner && row.recurrence_type === type);
          return Promise.resolve({ data, count: data.length, error: null });
        },
      };
      return chain;
    } }) },
    "@/lib/calendar/event-color": { normalizeEventColor: (value) => value },
    "@/lib/calendar/today": today,
  });
  assert.equal((await dashboard.getDashboardTodaySchedule("owner-a", "2026-10-01"))?.events[0].id, "private-a");
  assert.equal((await dashboard.getDashboardTodaySchedule("owner-b", "2026-10-01"))?.events[0].id, "private-b");
  assert.equal(await dashboard.getDashboardTodaySchedule("owner-c", "2026-10-01"), null);
  assert.equal(queries.length, 6);
  for (const [index, query] of queries.entries()) {
    assert.ok(query.filters.some(([op, key, value]) => op === "eq" && key === "owner_id" && value === ["owner-a", "owner-b", "owner-c"][Math.floor(index / 2)]));
    assert.equal(query.limit, 1000);
    assert.ok(!query.columns.includes("description") && !query.columns.includes("reminder"));
  }
  assert.ok(queries[0].filters.some(([op, key, value]) => op === "eq" && key === "event_date" && value === "2026-10-01"));
  assert.ok(queries[1].filters.some(([op, key, value]) => op === "lte" && key === "event_date" && value === "2026-10-01"));
});

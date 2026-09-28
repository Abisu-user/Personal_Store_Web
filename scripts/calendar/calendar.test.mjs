import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { occurrencesInRange } from "../../src/lib/calendar/recurrence.ts";
import { buildCalendarDays, discoverOfficialCsvUrl, parseOfficialCsv, validateOfficialRows } from "../../src/lib/calendar/taiwan-calendar-core.ts";
import { eventColorContrast, normalizeEventColor } from "../../src/lib/calendar/event-color.ts";

const snapshot = (year) => JSON.parse(readFileSync(new URL("../../src/lib/calendar/snapshots/" + year + ".json", import.meta.url), "utf8"));

function event(date, recurrenceType = "none") {
  return { id: "one", title: "生日", description: null, startsAt: date + "T04:00:00.000Z", endsAt: null, color: "blue", updatedAt: "2026-01-01T00:00:00.000Z", eventDate: date, eventTime: null, allDay: true, recurrenceType };
}

test("one-time event appears only on its own date", () => {
  assert.deepEqual(occurrencesInRange([event("2026-10-24")], "2026-10-01", "2028-10-31").map((row) => row.occurrenceDate), ["2026-10-24"]);
});

test("yearly event is one row projected across years, including leap-day only in leap years", () => {
  assert.deepEqual(occurrencesInRange([event("2026-10-24", "yearly")], "2026-01-01", "2028-12-31").map((row) => row.occurrenceDate), ["2026-10-24", "2027-10-24", "2028-10-24"]);
  assert.deepEqual(occurrencesInRange([event("2028-02-29", "yearly")], "2027-01-01", "2032-12-31").map((row) => row.occurrenceDate), ["2028-02-29", "2032-02-29"]);
});

test("editing date or recurrence changes all future projections without leaving the old day", () => {
  assert.deepEqual(occurrencesInRange([{ ...event("2026-10-25", "yearly"), title: "生日 🎂" }], "2026-10-01", "2028-10-31").map((row) => row.occurrenceDate), ["2026-10-25", "2027-10-25", "2028-10-25"]);
  assert.deepEqual(occurrencesInRange([event("2026-10-25", "none")], "2026-10-01", "2028-10-31").map((row) => row.occurrenceDate), ["2026-10-25"]);
});

test("official 2026 and 2027 snapshots contain every day and determine rest independently of holiday names", () => {
  const rows2026 = snapshot(2026);
  const rows2027 = snapshot(2027);
  validateOfficialRows(rows2026, 2026);
  validateOfficialRows(rows2027, 2027);
  const days = buildCalendarDays("2026-09-25", "2026-09-28", new Map([[2026, rows2026]]));
  assert.deepEqual(days.map((day) => day.isDayOff), [true, true, true, true]);
  assert.equal(days[0].holidayName, "中秋節");
  assert.equal(days[1].holidayName, null);
  assert.equal(days[1].dayOffType, "weekend");
  assert.equal(days[3].dayOffType, "national_holiday");
  const crossYear = buildCalendarDays("2026-12-31", "2027-01-03", new Map([[2026, rows2026], [2027, rows2027]]));
  assert.deepEqual(crossYear.map((day) => day.isDayOff), [false, true, true, true]);
  assert.equal(buildCalendarDays("2027-03-01", "2027-03-01", new Map([[2027, rows2027]]))[0].dayOffType, "makeup_holiday");
});

test("unpublished year remains unknown, and a designated Saturday workday never becomes a day off", () => {
  const unknown = buildCalendarDays("2028-01-01", "2028-01-02", new Map());
  assert.deepEqual(unknown.map((day) => day.dayOffType), ["unknown", "unknown"]);
  assert.deepEqual(unknown.map((day) => day.isDayOff), [false, false]);
  const rows = snapshot(2026);
  const saturday = rows.findIndex((row) => row[0] === "20260103");
  rows[saturday][1] = 0;
  const day = buildCalendarDays("2026-01-03", "2026-01-03", new Map([[2026, rows]]))[0];
  assert.equal(day.weekday, 6);
  assert.equal(day.isDayOff, false);
  const mothersDay = buildCalendarDays("2026-05-10", "2026-05-10", new Map([[2026, snapshot(2026)]]))[0];
  assert.equal(mothersDay.festivalName, "母親節");
  assert.equal(mothersDay.holidayName, null);
});

test("official CSV parsing and future-year discovery use the government resource link", () => {
  const csv = "\uFEFF西元日期,星期,是否放假,備註\n20270101,五,2,開國紀念日";
  assert.throws(() => parseOfficialCsv(csv, 2027), /incomplete/);
  const html = '<li class="resource-item"><a href="https://www.dgpa.gov.tw/FileConversion?filename=dgpa/files/202801/test.csv&amp;nfix=" title="CSV下載檔案">CSV</a><span>117年中華民國政府行政機關辦公日曆表</span></li>';
  assert.match(discoverOfficialCsvUrl(html, 2028), /test.csv/);
  assert.equal(discoverOfficialCsvUrl(html, 2027), null);
});

test("custom event colors keep their hex value, contrast, and yearly occurrence", () => {
  assert.equal(normalizeEventColor("#6f7aef"), "#6F7AEF");
  assert.equal(eventColorContrast("#202020"), "#FFFFFF");
  assert.equal(eventColorContrast("#F8E989"), "#142033");
  const yearly = { ...event("2026-10-24", "yearly"), color: "#D587AB" };
  assert.deepEqual(occurrencesInRange([yearly], "2026-01-01", "2028-12-31").map((row) => row.color), ["#D587AB", "#D587AB", "#D587AB"]);
});

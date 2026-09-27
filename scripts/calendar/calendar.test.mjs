import assert from "node:assert/strict";
import test from "node:test";
import { occurrencesInRange } from "../../src/lib/calendar/recurrence.ts";
import { getTaiwanHolidays } from "../../src/lib/calendar/taiwan-holidays.ts";

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

test("2026 public holidays and commemorative days remain distinct", () => {
  const holidays = getTaiwanHolidays("2026-01-01", "2026-12-31");
  assert.equal(holidays.find((item) => item.date === "2026-09-25")?.isHoliday, true);
  assert.equal(holidays.find((item) => item.date === "2026-09-28")?.isHoliday, true);
  assert.equal(holidays.find((item) => item.date === "2026-05-10")?.isHoliday, false);
  assert.equal(holidays.find((item) => item.date === "2026-10-26")?.type, "observed-holiday");
});

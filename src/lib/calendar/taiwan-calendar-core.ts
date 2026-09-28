import type { TaiwanCalendarDay } from "./types";

export type OfficialRow = [date: string, dayOff: number, note: string];

const fixedFestivals: Record<string, string> = {
  "03-08": "婦女節",
  "03-12": "植樹節",
  "03-29": "青年節",
  "08-08": "父親節",
  "09-21": "國家防災日",
  "12-10": "人權日",
};

function weekdayFor(date: string) {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

function festivalFor(date: string) {
  const [, month, day] = date.split("-").map(Number);
  if (month === 5 && weekdayFor(date) === 0 && day >= 8 && day <= 14) return "母親節";
  return fixedFestivals[date.slice(5)] ?? null;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else value += char;
  }
  cells.push(value);
  return cells;
}

export function parseOfficialCsv(csv: string, year: number): OfficialRow[] {
  const lines = csv.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = parseCsvLine(lines.shift() ?? "").map((cell) => cell.trim());
  const dateIndex = header.indexOf("西元日期");
  const dayOffIndex = header.indexOf("是否放假");
  const noteIndex = header.indexOf("備註");
  if (dateIndex < 0 || dayOffIndex < 0 || noteIndex < 0) throw new Error("DGPA CSV columns are unavailable");
  const rows = lines.filter(Boolean).map((line): OfficialRow => {
    const cells = parseCsvLine(line);
    return [cells[dateIndex]?.trim() ?? "", Number(cells[dayOffIndex]), cells[noteIndex]?.trim() ?? ""];
  });
  validateOfficialRows(rows, year);
  return rows;
}

export function validateOfficialRows(rows: OfficialRow[], year: number) {
  const expected = new Date(Date.UTC(year + 1, 0, 1)).getTime() - new Date(Date.UTC(year, 0, 1)).getTime();
  if (rows.length !== expected / 86_400_000) throw new Error("DGPA calendar year is incomplete");
  for (let index = 0; index < rows.length; index += 1) {
    const expectedDate = new Date(Date.UTC(year, 0, index + 1)).toISOString().slice(0, 10).replaceAll("-", "");
    if (rows[index][0] !== expectedDate || ![0, 2].includes(rows[index][1])) throw new Error("DGPA calendar day is invalid");
  }
}

export function buildCalendarDays(from: string, to: string, rowsByYear: Map<number, OfficialRow[] | null>): TaiwanCalendarDay[] {
  const result: TaiwanCalendarDay[] = [];
  const connectedPeriods = resolveConnectedHolidayPeriods(from, to, rowsByYear);
  const cursor = new Date(from + "T12:00:00Z");
  const end = new Date(to + "T12:00:00Z").getTime();
  while (cursor.getTime() <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const year = cursor.getUTCFullYear();
    const rows = rowsByYear.get(year);
    const yearIndex = Math.round((cursor.getTime() - Date.UTC(year, 0, 1, 12)) / 86_400_000);
    const row = rows?.[yearIndex];
    const officialAvailable = Boolean(row);
    const isDayOff = row?.[1] === 2;
    const note = row?.[2] || null;
    const weekday = cursor.getUTCDay();
    const dayOffType: TaiwanCalendarDay["dayOffType"] = !officialAvailable ? "unknown"
      : !isDayOff ? "workday"
      : note?.includes("補假") ? "makeup_holiday"
      : note ? "national_holiday"
      : weekday === 0 || weekday === 6 ? "weekend" : "special_holiday";
    result.push({
      date, weekday, officialAvailable, isDayOff, dayOffType,
      isConnectedHoliday: connectedPeriods.has(date),
      connectedHolidayId: connectedPeriods.get(date) ?? null,
      holidayName: isDayOff ? note : null,
      festivalName: festivalFor(date), note,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

// A connected period is a maximal run of official days off containing at least
// one named holiday, official make-up day, or special weekday off. Plain
// weekends are included only when they touch such an anchor. Government
// designated Saturday workdays break the run.
export function resolveConnectedHolidayPeriods(from: string, to: string, rowsByYear: Map<number, OfficialRow[] | null>): Map<string, string> {
  const periods = new Map<string, string>();
  const examined = new Set<string>();
  const dayMs = 86_400_000;
  const start = Date.parse(from + "T12:00:00Z");
  const end = Date.parse(to + "T12:00:00Z");
  const stateAt = (time: number) => {
    const day = new Date(time);
    const year = day.getUTCFullYear();
    const row = rowsByYear.get(year)?.[Math.round((time - Date.UTC(year, 0, 1, 12)) / dayMs)];
    if (row?.[1] !== 2) return { eligible: false, anchor: false };
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    return { eligible: true, anchor: !weekend || Boolean(row[2]) };
  };
  for (let time = start; time <= end; time += dayMs) {
    const key = new Date(time).toISOString().slice(0, 10);
    if (examined.has(key) || !stateAt(time).eligible) continue;
    let first = time;
    while (stateAt(first - dayMs).eligible) first -= dayMs;
    let last = time;
    while (stateAt(last + dayMs).eligible) last += dayMs;
    let hasAnchor = false;
    const id = new Date(first).toISOString().slice(0, 10);
    for (let member = first; member <= last; member += dayMs) {
      const memberKey = new Date(member).toISOString().slice(0, 10);
      examined.add(memberKey);
      if (stateAt(member).anchor) hasAnchor = true;
    }
    if (hasAnchor) for (let member = first; member <= last; member += dayMs) {
      const memberKey = new Date(member).toISOString().slice(0, 10);
      if (memberKey >= from && memberKey <= to) periods.set(memberKey, id);
    }
  }
  return periods;
}

export function discoverOfficialCsvUrl(html: string, year: number): string | null {
  const rocYear = year - 1911;
  for (const match of html.matchAll(/<li\b[^>]*class="[^"]*\bresource-item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/g)) {
    const item = match[1];
    if (!new RegExp("(?:^|\\D)" + rocYear + "年中華民國政府行政機關辦公日曆表").test(item.replace(/<[^>]+>/g, ""))) continue;
    const csvAnchor = [...item.matchAll(/<a\b[^>]*>/g)].map(([anchor]) => anchor).find((anchor) => /\btitle="CSV下載檔案"/.test(anchor));
    const href = csvAnchor?.match(/\bhref="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
    if (!href) continue;
    const url = new URL(href);
    if (url.hostname === "www.dgpa.gov.tw" && url.pathname === "/FileConversion" && url.searchParams.get("filename")?.endsWith(".csv")) return url.toString();
  }
  return null;
}

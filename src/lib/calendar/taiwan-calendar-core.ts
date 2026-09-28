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
      holidayName: isDayOff ? note : null,
      festivalName: festivalFor(date), note,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function discoverOfficialCsvUrl(html: string, year: number): string | null {
  const rocYear = year - 1911;
  for (const match of html.matchAll(/<li class="resource-item"[^>]*>([\s\S]*?)<\/li>/g)) {
    const item = match[1];
    if (!new RegExp("<span[^>]*>" + rocYear + "年中華民國政府行政機關辦公日曆表<\\/span>").test(item)) continue;
    const href = item.match(/<a href="([^"]+)"[^>]*title="CSV下載檔案"/)?.[1]?.replaceAll("&amp;", "&");
    if (!href) continue;
    const url = new URL(href);
    if (url.hostname === "www.dgpa.gov.tw" && url.pathname === "/FileConversion" && url.searchParams.get("filename")?.endsWith(".csv")) return url.toString();
  }
  return null;
}
